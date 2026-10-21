# agents/corrigir_e2e.py
"""
Script manual: roda Playwright. Se falhar, aciona o Programador para corrigir.
Sem shell=True, com validação de ambiente.
"""
import subprocess
import sys
import traceback

from crewai import Crew, Process

from core import resolver_executavel, validar_ambiente, RAIZ_PROJETO
from agents import EquipeERP
from tasks import TarefasERP

PLAYWRIGHT_CMD = ["npx", "playwright", "test", "--project=app-computador", "--reporter=line"]


def rodar_playwright() -> tuple[bool, str]:
    """Roda Playwright. Retorna (passou, log)."""
    print("🔍 Rodando testes E2E...")
    try:
        cmd = [resolver_executavel(PLAYWRIGHT_CMD[0])] + PLAYWRIGHT_CMD[1:]
        r = subprocess.run(
            cmd, cwd=RAIZ_PROJETO, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=900, shell=False,
        )
        log = (r.stdout or "") + "\n" + (r.stderr or "")
        return r.returncode == 0, log
    except subprocess.TimeoutExpired:
        return False, "=== Playwright TIMEOUT (900s) ==="
    except Exception as e:
        return False, f"=== Playwright ERRO: {type(e).__name__}: {e}"


def main():
    validar_ambiente(RAIZ_PROJETO)

    passou, log = rodar_playwright()
    if passou:
        print("✅ Todos os testes E2E já estão passando!")
        return

    print("❌ Testes E2E quebrados. Acionando o Programador...")
    print("Aguarde, isso pode levar alguns minutos...")

    equipe = EquipeERP()
    tarefas = TarefasERP()
    dev = equipe.programador()

    task_correcao = tarefas.tarefa_correcao(
        programador=dev,
        motivo=(
            "Testes E2E quebrados. Classifique a falha conforme REGRAS_E2E.md "
            "(bug real / teste desatualizado / timing / flaky / debounce). "
            "Atualize .spec.ts se aplicável ou corrija o componente."
        ),
        log=log,
    )

    try:
        Crew(
            agents=[dev],
            tasks=[task_correcao],
            process=Process.sequential,
            memory=False,
            planning=False,
            verbose=True,
        ).kickoff()
    except Exception:
        traceback.print_exc()
        print("❌ Crew falhou. Log abaixo:")
        print(log[-3000:])
        sys.exit(1)

    print("\n🔁 Verificando novamente após a correção...")
    passou, log_novo = rodar_playwright()
    if passou:
        print("🎉 SUCESSO! Testes E2E passando. Você pode commitar.")
    else:
        print("❌ Ainda há falhas:")
        print(log_novo[-3000:])
        sys.exit(1)


if __name__ == "__main__":
    main()
