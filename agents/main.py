# agentes/main.py
"""
Loop autônomo — gate mecânico (qa_gate.py) é a fonte de verdade.
QA LLM só documenta. Timeout graceful (commita estado parcial).
Ambiente quebrado (npx/npm ausente) aborta o ciclo sem gastar LLM.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import traceback
from datetime import datetime
from pathlib import Path

# Garante que 'agents', 'tasks', 'tools', 'qa_gate' sejam importáveis
sys.path.insert(0, str(Path(__file__).resolve().parent))

import git
from crewai import Crew, Process

from agents import EquipeERP
from tasks import TarefasERP
from product_owner import executar_product_owner
import qa_gate

# ---------------- Configuração ---------------- #
MAX_CICLOS = int(os.getenv("MAX_CICLOS", "5"))
MAX_CORRECOES_POR_CICLO = int(os.getenv("MAX_CORRECOES", "2"))
TIMEOUT_GLOBAL_S = int(os.getenv("TIMEOUT_GLOBAL_S", str(50 * 60)))  # 50min < workflow 60min
MAX_CICLOS_SEM_PROGRESSO = 2

RAIZ_PROJETO = Path(__file__).resolve().parent.parent
METRICAS_PATH = RAIZ_PROJETO / "memoria" / "metricas.jsonl"

VEREDITO_RE = re.compile(r"VEREDITO:\s*(APROVADO|REPROVADO)\s*[—\-:]?\s*(.*)", re.IGNORECASE)

_shutdown = threading.Event()


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


# ---------------- Ambiente ---------------- #
def validar_ambiente(raiz: Path):
    faltas = []
    has_llm = any(
        os.getenv(k) for k in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GROQ_API_KEY")
    )
    if not has_llm:
        faltas.append(
            "Nenhuma LLM key (OPENAI_API_KEY / ANTHROPIC_API_KEY / GROQ_API_KEY)"
        )
    for arq in ("package.json", "tsconfig.json"):
        if not (raiz / arq).exists():
            faltas.append(f"{arq} não encontrado na raiz")

    # Testa npx/npm de verdade (resolve .cmd no Windows)
    for tool_name in ("npx", "npm"):
        caminho = shutil.which(tool_name)
        if not caminho:
            faltas.append(f"{tool_name} não encontrado no PATH")
            continue
        try:
            r = subprocess.run(
                [caminho, "--version"],
                capture_output=True, text=True, timeout=15, shell=False,
            )
            if r.returncode != 0:
                faltas.append(f"{tool_name} --version falhou (exit {r.returncode})")
        except Exception as e:
            faltas.append(f"{tool_name} não executa: {type(e).__name__}: {e}")

    if faltas:
        for f in faltas:
            print(f"❌ {f}")
        sys.exit(1)
    log("✅ Ambiente validado (npx/npm executam).")


# ---------------- Git ---------------- #
def detectar_branch(repo: git.Repo, base_preferida: str = "saas") -> str:
    """Prefere a base configurada ('saas'), senão a ativa, senão main/master."""
    heads = [h.name for h in repo.heads]
    if base_preferida in heads:
        return base_preferida
    try:
        return repo.active_branch.name
    except TypeError:
        for nome in ("main", "master"):
            if nome in heads:
                return nome
        return "main"


def preparar_git(repo: git.Repo, base_preferida: str = "saas") -> tuple[str, str]:
    original = detectar_branch(repo, base_preferida)
    repo.git.checkout(original)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    nova = f"ia-autonoma/{ts}"
    repo.git.checkout("-B", nova)  # -B = cria ou reseta
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


# ---------------- npm ---------------- #
def _lockfile_mudou(raiz: Path) -> bool:
    """True se package-lock.json mudou desde HEAD."""
    try:
        r = subprocess.run(
            ["git", "diff", "--quiet", "HEAD", "--", "package-lock.json"],
            cwd=raiz, shell=False, capture_output=True,
        )
        return r.returncode != 0
    except Exception:
        return True  # em dúvida, instala


def instalar_deps(raiz: Path, force: bool = False) -> bool:
    if not force and not _lockfile_mudou(raiz):
        return True
    log("📦 npm ci...")
    try:
        npm_exe = shutil.which("npm") or "npm"
        r = subprocess.run(
            [npm_exe, "ci", "--no-audit", "--no-fund"],
            cwd=raiz, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=600, shell=False,
        )
        if r.returncode != 0:
            print((r.stderr or r.stdout)[-2000:])
            return False
        return True
    except subprocess.TimeoutExpired:
        return False
    except Exception:
        traceback.print_exc()
        return False


# ---------------- Métricas ---------------- #
def registrar_metricas(ciclo: int, resultado: dict):
    try:
        METRICAS_PATH.parent.mkdir(exist_ok=True)
        with METRICAS_PATH.open("a", encoding="utf-8") as f:
            f.write(json.dumps({
                "ts": datetime.now().isoformat(),
                "ciclo": ciclo,
                **resultado,
            }, ensure_ascii=False) + "\n")
    except Exception:
        traceback.print_exc()


# ---------------- Plano atual ---------------- #
def ler_plano_atual(raiz: Path) -> dict | None:
    """Retorna plano_atual se válido (item ainda está no backlog)."""
    arq = raiz / "memoria" / "estado.json"
    if not arq.exists():
        return None
    try:
        estado = json.loads(arq.read_text(encoding="utf-8"))
        plano = estado.get("plano_atual")
        if not plano:
            return None
        ids = [b.get("id") for b in estado.get("backlog", [])]
        if plano.get("item_id") in ids:
            return plano
        return None
    except Exception:
        return None


# ---------------- Veredito (compat — não usado como decisor) ---------------- #
def extrair_veredito(texto: str) -> tuple[bool, str]:
    m = VEREDITO_RE.search(texto or "")
    if not m:
        return False, "QA não emitiu veredito explícito."
    aprovado = m.group(1).upper() == "APROVADO"
    motivo = (m.group(2) or "").strip()
    return aprovado, motivo


# ---------------- Loop de correção ---------------- #
def _tentar_correcoes(equipe, tarefas, raiz, num_ciclo, motivo: str, log_testes: str) -> tuple[bool, str, dict]:
    dev = equipe.programador()
    tentativas = 0
    while tentativas < MAX_CORRECOES_POR_CICLO:
        tentativas += 1
        log(f"🔧 Correção {tentativas}/{MAX_CORRECOES_POR_CICLO} — {motivo[:120]}")
        try:
            Crew(
                agents=[dev],
                tasks=[tarefas.tarefa_correcao(dev, motivo, log_testes)],
                process=Process.sequential,
                verbose=True,
            ).kickoff()
        except Exception:
            traceback.print_exc()
            break

        if not instalar_deps(raiz):
            break

        ok, log_testes = qa_gate.testes_completos(raiz)
        if ok is None:
            log("🚨 AMBIENTE ficou indisponível durante correção. Abortando.")
            return False, "Ambiente incompatível", {"erro": "ambiente"}
        if ok:
            log("✅ Correção passou.")
            return True, "", {"correcoes": tentativas}
        motivo = "Ainda falhando após correção"

    return False, motivo, {"correcoes": tentativas}


# ---------------- Ciclo ---------------- #
def executar_ciclo(equipe, tarefas, repo, num_ciclo, raiz) -> tuple[bool, str, dict]:
    log(f"\n{'='*60}\n🔁 CICLO {num_ciclo}\n{'='*60}")

    # Se já existe plano válido → pula o Arquiteto (economia de LLM)
    plano = ler_plano_atual(raiz)
    if plano:
        log(f"⏭️ Plano existente para {plano['item_id']} — pulando Arquiteto.")
        arq = None
    else:
        arq = equipe.arquiteto()

    design = equipe.designer_ui_ux()
    dev = equipe.programador()
    qa = equipe.qa_tester()

    tasks_cycle = tarefas.ciclo_autonomo_completo(arq, design, dev, qa)
    if arq is None:
        tasks_cycle = tasks_cycle[1:]  # remove task do arquiteto
    agents_cycle = [a for a in (arq, design, dev, qa) if a is not None]

    try:
        crew = Crew(
            agents=agents_cycle,
            tasks=tasks_cycle,
            process=Process.sequential,
            verbose=True,
        )
        resultado = crew.kickoff()
        texto_final = str(resultado)
        metricas_llm = {}
        try:
            um = getattr(crew, "usage_metrics", None)
            if um is not None:
                metricas_llm = {
                    "tokens": getattr(um, "total_tokens", None),
                    "custo": getattr(um, "total_cost", None),
                }
        except Exception:
            pass
    except Exception:
        traceback.print_exc()
        return False, "Crew falhou.", {"erro": "crew_exception"}

    # 1. Gate mecânico (diff)
    diff_ok, diff_problemas = qa_gate.gate_mecanico(raiz)
    if not diff_ok:
        log("❌ Gate mecânico (diff) reprovou:")
        print(diff_problemas)
        return False, f"Diff inválido: {diff_problemas[:500]}", {"gate_diff": diff_problemas}

    # 2. npm ci só se lockfile mudou
    if not instalar_deps(raiz):
        return False, "npm ci falhou.", {"erro": "npm_ci"}

    # 3. Testes rápidos
    rapidos_ok, log_rapidos = qa_gate.testes_rapidos(raiz)
    if rapidos_ok is None:
        log("🚨 AMBIENTE: npx/npm não encontrados. Abortando ciclo (não é bug do código).")
        log(log_rapidos[-500:])
        return False, "Ambiente incompatível: npx/npm ausente", {"erro": "ambiente"}
    if not rapidos_ok:
        log("❌ Testes rápidos falharam.")
        return _tentar_correcoes(
            equipe, tarefas, raiz, num_ciclo,
            motivo="tsc/vitest/build falharam", log_testes=log_rapidos,
        )

    # 4. Testes completos (Playwright E2E) — só quando rápidos passam
    completos_ok, log_completos = qa_gate.testes_completos(raiz)
    if completos_ok is None:
        log("🚨 AMBIENTE ficou indisponível nos testes completos. Abortando.")
        return False, "Ambiente incompatível", {"erro": "ambiente"}
    if not completos_ok:
        log("❌ Playwright E2E falhou.")
        return _tentar_correcoes(
            equipe, tarefas, raiz, num_ciclo,
            motivo="Playwright E2E falhou", log_testes=log_completos,
        )

    log("✅ Gate mecânico + testes completos passaram.")

    # 5. QA LLM só documenta (não decide aprovação)
    item_id = (plano or {}).get("item_id", "")
    try:
        Crew(
            agents=[qa],
            tasks=[tarefas.tarefa_fechamento(
                qa, True, texto_final[:1500], item_id=item_id
            )],
            process=Process.sequential, verbose=False,
        ).kickoff()
    except Exception:
        traceback.print_exc()

    return True, "", {"metricas_llm": metricas_llm, "item_id": item_id}


# ---------------- Main ---------------- #
def main():
    def _timeout_handler():
        print("\n⏰ TIMEOUT GLOBAL — commitando estado parcial...", flush=True)
        _shutdown.set()
        try:
            repo = git.Repo(RAIZ_PROJETO)
            try:
                branch = repo.active_branch.name
            except TypeError:
                branch = None
            repo.git.add(A=True)
            if repo.is_dirty(untracked_files=True):
                repo.index.commit("wip(ia): estado parcial no timeout global")
                log("📸 Commit de emergência feito.")
            if branch:
                try:
                    repo.remote(name="origin").push(refspec=f"{branch}:{branch}")
                    log(f"🚀 Push de emergência: {branch}")
                except Exception:
                    log("⚠️ Push de emergência falhou (branch local preservada).")
        except Exception:
            traceback.print_exc()
        sys.exit(124)

    timer = threading.Timer(TIMEOUT_GLOBAL_S, _timeout_handler)
    timer.daemon = True
    timer.start()

    print("=" * 60)
    print("🤖 FÁBRICA AUTÔNOMA AUTO-EVOLUTIVA — ERP GALPÃO")
    print("=" * 60)
    validar_ambiente(RAIZ_PROJETO)

    repo = git.Repo(RAIZ_PROJETO)
    branch_nova, branch_orig = preparar_git(repo)

    equipe = EquipeERP()
    tarefas = TarefasERP()

    ciclos_sem_progresso = 0
    aprovados, reprovados = 0, 0

    try:
        for i in range(1, MAX_CICLOS + 1):
            if _shutdown.is_set():
                break

            snap = snapshot_commit(repo, f"checkpoint pré-ciclo {i}")
            sha_antes = snap or repo.head.commit.hexsha

            # PO só roda se backlog estiver baixo (lógica dentro do módulo)
            try:
                executar_product_owner()
            except Exception:
                traceback.print_exc()

            ok, motivo, extra = executar_ciclo(equipe, tarefas, repo, i, RAIZ_PROJETO)
            registrar_metricas(i, {"ok": ok, "motivo": motivo[:300], **extra})

            if ok:
                aprovados += 1
                ciclos_sem_progresso = 0
                sha_ciclo = snapshot_commit(repo, f"feat(ia): ciclo {i} aprovado")
                if sha_ciclo:
                    log(f"📸 Commit ciclo {i}: {sha_ciclo[:8]}")
            else:
                reprovados += 1
                ciclos_sem_progresso += 1
                log(f"⚠️ Ciclo {i} reprovado: {motivo}")

                # Salva falha ANTES do rollback (senão perde o diff)
                try:
                    diff = repo.git.diff(sha_antes)
                except Exception:
                    diff = ""
                try:
                    from tools import registrar_falha as _rf
                    _rf.func(motivo=motivo, diff=diff, log_testes=str(extra)[:5000])
                except Exception:
                    traceback.print_exc()

                rollback_para(repo, sha_antes)
                if ciclos_sem_progresso >= MAX_CICLOS_SEM_PROGRESSO:
                    log(f"🛑 {MAX_CICLOS_SEM_PROGRESSO} ciclos sem progresso — encerrando.")
                    break
    except Exception:
        traceback.print_exc()
        log(f"❌ Exception. Branch {branch_nova} preservada (não deletada).")
        try:
            repo.git.checkout(branch_orig)
        except Exception:
            pass
        sys.exit(1)
    finally:
        timer.cancel()

    log(f"\n📊 Resultado: {aprovados} aprovados, {reprovados} reprovados")

    # Push da branch (mesmo com 0 aprovados, se houve commit)
    try:
        repo.git.add(A=True)
        if repo.is_dirty(untracked_files=True):
            repo.index.commit(f"feat(ia): sessão autônoma ({aprovados} ciclos aprovados)")
        origin = repo.remote(name="origin")
        try:
            origin.push(refspec=f"{branch_nova}:{branch_nova}", force_with_lease=True)
        except Exception:
            origin.push(refspec=f"{branch_nova}:{branch_nova}")
        log(f"🚀 Push: {branch_nova}")
    except Exception:
        log("❌ Push falhou:")
        traceback.print_exc()
        try:
            repo.git.checkout(branch_orig)
        except Exception:
            pass
        sys.exit(1)

    try:
        repo.git.checkout(branch_orig)
    except Exception:
        pass

    print("\n" + "=" * 60)
    print(f"🎉 SESSÃO AUTÔNOMA CONCLUÍDA — {aprovados} ciclos entregues")
    print(f"📌 Branch: {branch_nova}")
    print("=" * 60)


if __name__ == "__main__":
    main()