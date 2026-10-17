# agentes/main.py
import json
import os
import re
import shutil
import subprocess
import sys
import traceback
import threading
from datetime import datetime
from pathlib import Path

import git
from crewai import Crew, Process

from agents import EquipeERP
from tasks import TarefasERP

# ---------------- Configuração ---------------- #
MAX_CICLOS = int(os.getenv("MAX_CICLOS", "5"))
MAX_CORRECOES_POR_CICLO = int(os.getenv("MAX_CORRECOES", "2"))
TIMEOUT_GLOBAL_S = int(os.getenv("TIMEOUT_GLOBAL_S", str(60 * 90)))
TIMEOUT_TESTES_S = 900
MAX_CICLOS_SEM_PROGRESSO = 2

VEREDITO_RE = re.compile(r"VEREDITO:\s*(APROVADO|REPROVADO)\s*[—\-:]?\s*(.*)", re.IGNORECASE)

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def validar_ambiente(raiz: Path):
    faltas = []
    if not os.getenv("OPENAI_API_KEY"):
        faltas.append("OPENAI_API_KEY não definida no .env")
    for arq in ("package.json", "tsconfig.json"):
        if not (raiz / arq).exists():
            faltas.append(f"{arq} não encontrado na raiz")
    if not shutil.which("npx"):
        faltas.append("npx não encontrado no PATH")
    if faltas:
        for f in faltas:
            print(f"❌ {f}")
        sys.exit(1)
    log("✅ Ambiente validado.")

# ---------------- Git ---------------- #
def detectar_branch(repo: git.Repo) -> str:
    """Detecta a branch atual (ou primeira disponível: main, master, saas)."""
    try:
        return repo.active_branch.name
    except TypeError:
        for nome in ("main", "master", "saas"):
            if nome in [h.name for h in repo.heads]:
                return nome
        return "main"

def preparar_git(repo: git.Repo) -> tuple[str, str]:
    original = detectar_branch(repo)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    nova = f"ia-autonoma/{ts}"
    repo.git.checkout("-b", nova)
    log(f"🌿 Branch: {nova} (a partir de {original})")
    return nova, original

def snapshot_commit(repo: git.Repo, msg: str) -> str | None:
    try:
        repo.git.add(A=True)
        if not repo.is_dirty(untracked_files=True):
            return None
        c = repo.index.commit(msg)
        return c.hexsha
    except Exception:
        traceback.print_exc()
        return None

def rollback_para(repo: git.Repo, commit_sha: str):
    try:
        repo.git.reset("--hard", commit_sha)
        repo.git.clean("-fd")
        log(f"↩️ Rollback para {commit_sha[:8]}")
    except Exception:
        traceback.print_exc()

def limpar_branch(repo: git.Repo, nova: str, original: str):
    try:
        repo.git.checkout("--", ".")
        repo.git.clean("-fd")
        repo.git.checkout(original)
        repo.git.branch("-D", nova)
    except Exception:
        traceback.print_exc()

# ---------------- Testes ---------------- #
def instalar_deps(raiz: Path) -> bool:
    log("📦 npm install...")
    try:
        r = subprocess.run(
            "npm install --no-audit --no-fund", 
            cwd=raiz, capture_output=True, text=True, 
            encoding="utf-8", errors="replace", timeout=600, shell=True
        )
        if r.returncode != 0:
            print((r.stderr or r.stdout)[-2000:])
            return False
        return True
    except subprocess.TimeoutExpired:
        return False

def rodar_testes(raiz: Path) -> tuple[bool, str]:
    logs = []
    def _r(cmd, nome):
        log(f"👉 {nome}")
        try:
            r = subprocess.run(
                cmd, cwd=raiz, capture_output=True, text=True, 
                encoding="utf-8", errors="replace", timeout=TIMEOUT_TESTES_S, shell=True
            )
        except subprocess.TimeoutExpired:
            m = f"❌ Timeout: {cmd}"
            logs.append(m); print(m); return False, m
        out = (r.stdout or "") + "\n" + (r.stderr or "")
        logs.append(f"=== {nome} (exit={r.returncode}) ===\n{out}")
        if r.returncode != 0:
            print(f"❌ {nome} falhou")
            return False, out
        print(f"✅ {nome} OK")
        return True, out

    # 1. Tipagem
    ok, _ = _r("npx tsc --noEmit -p tsconfig.json", "tsc")
    if not ok:
        return False, "\n".join(logs)

    # 2. Testes Unitários + Cobertura
    ok, saida = _r("npx vitest run --coverage --reporter=dot", "vitest + coverage")
    if not ok:
        return False, "\n".join(logs)

    # 3. Build de Produção
    ok, _ = _r("npm run build", "vite build")
    if not ok:
        return False, "\n".join(logs)

    # 4. Testes E2E (garante que a UI não quebrou)
    # Rodando apenas app-computador para economizar tempo e focar no essencial
    ok, _ = _r("npx playwright test --project=app-computador --reporter=line", "playwright E2E")
    if not ok:
        log("❌ E2E quebrou! O Programador precisa corrigir a UI ou atualizar o .spec.ts.")
        return False, "\n".join(logs)

    return True, "\n".join(logs)

def extrair_veredito(texto: str) -> tuple[bool, str]:
    m = VEREDITO_RE.search(texto or "")
    if not m:
        return False, "QA não emitiu veredito explícito."
    aprovado = m.group(1).upper() == "APROVADO"
    motivo = (m.group(2) or "").strip()
    return aprovado, motivo

# ---------------- Loop principal ---------------- #
def executar_ciclo(equipe, tarefas, repo, num_ciclo, raiz) -> tuple[bool, str]:
    log(f"\n{'='*60}\n🔁 CICLO {num_ciclo}\n{'='*60}")

    arq, design, dev, qa = (equipe.arquiteto(), equipe.designer_ui_ux(),
                            equipe.programador(), equipe.qa_tester())

    crew = Crew(
        agents=[arq, design, dev, qa],
        tasks=tarefas.ciclo_autonomo_completo(arq, design, dev, qa),
        process=Process.sequential,
        verbose=True,
    )

    try:
        resultado = crew.kickoff()
    except Exception:
        traceback.print_exc()
        return False, "Crew falhou."

    texto_final = str(resultado)
    veredito_llm, motivo_llm = extrair_veredito(texto_final)

    if not instalar_deps(raiz):
        return False, "npm install falhou."

    testes_ok, log_testes = rodar_testes(raiz)
    
    if testes_ok:
        aprovado = True
        motivo = ""
        log("✅ Testes externos (tsc + vitest + build + E2E) passaram. Ciclo aprovado.")
    else:
        aprovado = False
        motivo = f"Testes falharam. QA LLM disse: {motivo_llm}"
        log(f"❌ Testes externos falharam.")

    tentativas = 0
    while not aprovado and tentativas < MAX_CORRECOES_POR_CICLO:
        tentativas += 1
        log(f"🔧 Correção {tentativas}/{MAX_CORRECOES_POR_CICLO} — motivo: {motivo}")
        try:
            Crew(
                agents=[dev],
                tasks=[tarefas.tarefa_correcao(dev, motivo, log_testes)],
                process=Process.sequential,
                verbose=True,
            ).kickoff()
        except Exception:
            traceback.print_exc(); break

        if not instalar_deps(raiz):
            break
        testes_ok, log_testes = rodar_testes(raiz)
        aprovado = testes_ok
        motivo = "" if aprovado else "Ainda falhando após correção."

    if aprovado:
        log("✅ Ciclo aprovado.")
        try:
            Crew(agents=[qa], tasks=[tarefas.tarefa_fechamento(qa, True, texto_final[:2000])],
                 process=Process.sequential, verbose=False).kickoff()
        except Exception:
            traceback.print_exc()
    else:
        log(f"❌ Ciclo reprovado: {motivo}")

    return aprovado, motivo

def main():
    def _timeout_handler():
        print("\n⏰ TIMEOUT GLOBAL — encerrando.")
        os._exit(124)
    
    timer = threading.Timer(TIMEOUT_GLOBAL_S, _timeout_handler)
    timer.daemon = True
    timer.start()

    raiz = Path(__file__).resolve().parent.parent
    print("=" * 60)
    print("🤖 FÁBRICA AUTÔNOMA AUTO-EVOLUTIVA — ERP GALPÃO")
    print("=" * 60)
    validar_ambiente(raiz)

    repo = git.Repo(raiz)
    branch_nova, branch_orig = preparar_git(repo)

    equipe = EquipeERP()
    tarefas = TarefasERP()

    ciclos_sem_progresso = 0
    aprovados, reprovados = 0, 0

    try:
        for i in range(1, MAX_CICLOS + 1):
            snap = snapshot_commit(repo, f"checkpoint pré-ciclo {i}")
            sha_antes = snap or repo.head.commit.hexsha

            ok, motivo = executar_ciclo(equipe, tarefas, repo, i, raiz)

            if ok:
                aprovados += 1
                ciclos_sem_progresso = 0
                sha_ciclo = snapshot_commit(repo, f"feat(ia): ciclo {i} aprovado")
                if sha_ciclo:
                    log(f"📸 Commit ciclo {i}: {sha_ciclo[:8]}")
            else:
                reprovados += 1
                ciclos_sem_progresso += 1
                log(f"⚠️ Ciclo {i} reprovado — rollback para {sha_antes[:8]}")
                rollback_para(repo, sha_antes)
                if ciclos_sem_progresso >= MAX_CICLOS_SEM_PROGRESSO:
                    log(f"🛑 {MAX_CICLOS_SEM_PROGRESSO} ciclos sem progresso — encerrando loop.")
                    break
    except Exception:
        traceback.print_exc()
        limpar_branch(repo, branch_nova, branch_orig)
        sys.exit(1)
    finally:
        timer.cancel()

    log(f"\n📊 Resultado: {aprovados} aprovados, {reprovados} reprovados")
    try:
        repo.git.add(A=True)
        if repo.is_dirty(untracked_files=True):
            repo.index.commit(f"feat(ia): sessão autônoma ({aprovados} ciclos aprovados)")
        origin = repo.remote(name="origin")
        if branch_nova in [r.name for r in origin.refs]:
            origin.push(refspec=f"{branch_nova}:{branch_nova}", force_with_lease=True)
        else:
            origin.push(refspec=f"{branch_nova}:{branch_nova}")
        log(f"🚀 Push: {branch_nova}")
    except Exception:
        log("❌ Push falhou:")
        traceback.print_exc()
        repo.git.checkout(branch_orig)
        sys.exit(1)

    repo.git.checkout(branch_orig)

    print("\n" + "=" * 60)
    print(f"🎉 SESSÃO AUTÔNOMA CONCLUÍDA — {aprovados} ciclos entregues")
    print(f"📌 Branch: {branch_nova}")
    print("=" * 60)

if __name__ == "__main__":
    main()