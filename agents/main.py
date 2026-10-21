# agents/main.py
"""
Loop autônomo — orquestração (git, timeout, métricas) apenas.

A lógica de ciclo vive em pipeline.py; helpers determinísticos em core.py.
Gate mecânico (qa_gate.py) é a fonte de verdade. QA LLM só documenta.
Timeout graceful (commita estado parcial). Ambiente quebrado aborta sem gastar LLM.
"""
import sys
import threading
import traceback

import git

from core import (
    Config,
    log,
    preparar_git,
    registrar_metricas,
    rollback_para,
    snapshot_commit,
    validar_ambiente,
    RAIZ_PROJETO,
)
from agents import EquipeERP
from tasks import TarefasERP
from product_owner import executar_product_owner
from design_audit import executar_auditoria_design
from pipeline import executar_ciclo

_shutdown = threading.Event()


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


def _salvar_falha(repo, sha_antes: str, motivo: str, extra: dict) -> None:
    """Salva a falha ANTES do rollback (senão perde o diff)."""
    try:
        diff = repo.git.diff(sha_antes)
    except Exception:
        diff = ""
    try:
        from tools import registrar_falha as _rf
        _rf.func(motivo=motivo, diff=diff, log_testes=str(extra)[:5000])
    except Exception:
        traceback.print_exc()


def _push_branch(repo, branch_nova: str, aprovados: int) -> None:
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
        raise


def main() -> None:
    config = Config()

    timer = threading.Timer(config.timeout_global_s, _timeout_handler)
    timer.daemon = True
    timer.start()

    print("=" * 60)
    print("🤖 FÁBRICA AUTÔNOMA AUTO-EVOLUTIVA — ERP GALPÃO")
    print("=" * 60)
    validar_ambiente(RAIZ_PROJETO)

    repo = git.Repo(RAIZ_PROJETO)
    branch_nova, branch_orig = preparar_git(repo, config.base_branch)

    equipe = EquipeERP()
    tarefas = TarefasERP()

    ciclos_sem_progresso = 0
    aprovados, reprovados = 0, 0

    try:
        for i in range(1, config.max_ciclos + 1):
            if _shutdown.is_set():
                break

            snap = snapshot_commit(repo, f"checkpoint pré-ciclo {i}")
            sha_antes = snap or repo.head.commit.hexsha

            # PO só roda se backlog estiver baixo (lógica dentro do módulo)
            try:
                executar_product_owner()
            except Exception:
                traceback.print_exc()

            # Designer audita o front só se há poucos itens de design
            try:
                executar_auditoria_design()
            except Exception:
                traceback.print_exc()

            ok, motivo, extra = executar_ciclo(equipe, tarefas, i, RAIZ_PROJETO, config)
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

                _salvar_falha(repo, sha_antes, motivo, extra)
                rollback_para(repo, sha_antes)
                if ciclos_sem_progresso >= config.max_ciclos_sem_progresso:
                    log(f"🛑 {config.max_ciclos_sem_progresso} ciclos sem progresso — encerrando.")
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
        _push_branch(repo, branch_nova, aprovados)
    except Exception:
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
