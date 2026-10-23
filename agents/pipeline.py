# agents/pipeline.py
"""
Execução de um ciclo autônomo + loop de auto-correção.

Compartilhado por main.py (autônomo) e melhorar.py (manual). O gate mecânico
(qa_gate.py) continua sendo a fonte de verdade; o QA LLM apenas documenta.
"""
from __future__ import annotations

import json
import traceback
from pathlib import Path

from crewai import Crew, Process

import qa_gate
from core import (
    Config,
    extrair_uso,
    instalar_deps,
    log,
)

RAIZ_PROJETO = Path(__file__).resolve().parent.parent


# ------------------------------------------------------------------ #
# Helpers
# ------------------------------------------------------------------ #
def _novo_crew(agents, tasks) -> Crew:
    """Cria uma Crew com memory/planning desligados (custo controlado)."""
    return Crew(
        agents=agents,
        tasks=tasks,
        process=Process.sequential,
        memory=False,
        planning=False,
        verbose=True,
    )


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


# ------------------------------------------------------------------ #
# Loop de correção
# ------------------------------------------------------------------ #
def _tentar_correcoes(
    equipe, tarefas, raiz: Path, num_ciclo: int, motivo: str, log_testes: str,
    config: Config,
) -> tuple[bool, str, dict]:
    dev = equipe.programador()
    tentativas = 0
    while tentativas < config.max_correcoes:
        tentativas += 1
        log(f"🔧 Correção {tentativas}/{config.max_correcoes} — {motivo[:120]}")
        try:
            _novo_crew(
                [dev],
                [tarefas.tarefa_correcao(dev, motivo, log_testes)],
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


# ------------------------------------------------------------------ #
# Ciclo
# ------------------------------------------------------------------ #
def executar_ciclo(equipe, tarefas, num_ciclo: int, raiz: Path, config: Config) -> tuple[bool, str, dict]:
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
        crew = _novo_crew(agents_cycle, tasks_cycle)
        resultado = crew.kickoff()
        texto_final = str(resultado)
        metricas_llm = extrair_uso(crew, config.modelo)
    except Exception:
        traceback.print_exc()
        return False, "Crew falhou.", {"erro": "crew_exception"}

    # 1. Gate mecânico (diff)
    diff_ok, diff_problemas = qa_gate.gate_mecanico(raiz)
    if not diff_ok:
        log("❌ Gate mecânico (diff) reprovou:")
        print(diff_problemas)
        return False, f"Diff inválido: {diff_problemas[:500]}", {"gate_diff": diff_problemas}

    # 1b. Gate de implementação: houve mudança real de código?
    impl_ok, impl_msg = qa_gate.gate_implementacao(raiz)
    if not impl_ok:
        log(f"❌ Gate de implementação reprovou: {impl_msg}")
        return False, impl_msg, {"gate_implementacao": impl_msg}

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
            config=config,
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
            config=config,
        )

    log("✅ Gate mecânico + testes completos passaram.")

    # 5. QA LLM só documenta (não decide aprovação)
    item_id = (plano or {}).get("item_id", "")
    try:
        _novo_crew(
            [qa],
            [tarefas.tarefa_fechamento(qa, True, texto_final[:1500], item_id=item_id)],
        ).kickoff()
    except Exception:
        traceback.print_exc()

    return True, "", {"metricas_llm": metricas_llm, "item_id": item_id}
