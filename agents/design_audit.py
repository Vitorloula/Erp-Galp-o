# agents/design_audit.py
"""
Auditor de design autônomo — roda apenas quando há poucos itens de design no backlog.

O Designer é o dono do design system: varre o front em busca de dívida visual
(responsividade, consistência, acessibilidade, atualidade) e propõe itens D-*
no backlog. Cada item precisa de evidência concreta (arquivo:linha).
"""
import json
import traceback
from pathlib import Path

from crewai import Crew, Process

from agents import EquipeERP
from tasks import TarefasERP

RAIZ_PROJETO = Path(__file__).resolve().parent.parent
ARQ_ESTADO = RAIZ_PROJETO / "memoria" / "estado.json"

DESIGN_BACKLOG_MINIMO = 3
TIPOS_DESIGN = {"design", "ui", "ux", "responsividade", "acessibilidade", "visual"}


def _ler_estado() -> dict:
    if not ARQ_ESTADO.exists():
        return {"backlog": []}
    try:
        return json.loads(ARQ_ESTADO.read_text(encoding="utf-8"))
    except Exception:
        return {"backlog": []}


def backlog_design_tamanho() -> int:
    estado = _ler_estado()
    return sum(1 for b in estado.get("backlog", []) if b.get("tipo") in TIPOS_DESIGN)


def validar_itens_design() -> list[str]:
    """Valida e remove itens D-* inválidos do backlog."""
    estado = _ler_estado()
    backlog = estado.get("backlog", [])
    ids_remover = set()
    problemas = []

    for item in backlog:
        item_id = item.get("id", "")
        if not item_id.startswith("D-"):
            continue

        titulo = item.get("titulo", "")
        arquivos = item.get("arquivos_que_toca", [])
        evidencia = item.get("evidencia", "")

        if len(titulo) > 80:
            problemas.append(f"❌ {item_id}: título muito longo")
            ids_remover.add(item_id); continue
        if not evidencia:
            problemas.append(f"❌ {item_id}: sem evidência")
            ids_remover.add(item_id); continue
        if not arquivos:
            problemas.append(f"❌ {item_id}: sem arquivos_que_toca")
            ids_remover.add(item_id); continue
        if len(arquivos) > 5:
            problemas.append(f"❌ {item_id}: toca {len(arquivos)} arquivos (máx 5)")
            ids_remover.add(item_id); continue
        for arq_nome in arquivos:
            if not (RAIZ_PROJETO / arq_nome).exists():
                problemas.append(f"❌ {item_id}: arquivo inexistente {arq_nome}")
                ids_remover.add(item_id)
                break

    if ids_remover:
        antes = len(backlog)
        estado["backlog"] = [b for b in backlog if b.get("id") not in ids_remover]
        ARQ_ESTADO.write_text(json.dumps(estado, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"🧹 Removidos {antes - len(estado['backlog'])} itens de design inválidos")

    return problemas


def executar_auditoria_design(backlog_minimo: int = DESIGN_BACKLOG_MINIMO, forcar: bool = False) -> bool:
    """Roda o Designer (auditoria) somente se há poucos itens de design (ou forcar=True)."""
    antes = backlog_design_tamanho()
    if not forcar and antes >= backlog_minimo:
        print(f"⏭️ Backlog de design já tem {antes} itens (mínimo {backlog_minimo}). Pulando auditoria.")
        return True

    print("\n" + "=" * 60)
    print(f"🎨 AUDITORIA DE DESIGN — {antes}/{backlog_minimo} itens, varrendo o front" + (" (forçada)" if forcar else ""))
    print("=" * 60)

    equipe = EquipeERP()
    tarefas = TarefasERP()

    try:
        designer = equipe.designer_ui_ux()
        task = tarefas.tarefa_auditoria_design(designer)
        Crew(
            agents=[designer],
            tasks=[task],
            process=Process.sequential,
            memory=False,
            planning=False,
            verbose=True,
        ).kickoff()
    except Exception:
        print("❌ Auditoria de design falhou:")
        traceback.print_exc()
        return False

    problemas = validar_itens_design()
    if problemas:
        print("\n🔍 Validação encontrou problemas:")
        for p in problemas:
            print(f"  {p}")

    depois = backlog_design_tamanho()
    print(f"\n📊 Backlog de design: {antes} → {depois} (Δ = {depois - antes:+d})")
    return True


if __name__ == "__main__":
    executar_auditoria_design()
