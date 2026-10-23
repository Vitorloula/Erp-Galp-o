# agentes/product_owner.py
"""
Product Owner autônomo — roda apenas quando o backlog está abaixo do mínimo.
"""
import json
import traceback
from pathlib import Path

from crewai import Crew, Process

from agents import EquipeERP
from tasks import TarefasERP

RAIZ_PROJETO = Path(__file__).resolve().parent.parent
PO_BACKLOG_MINIMO = 3


def backlog_tamanho() -> int:
    arq = RAIZ_PROJETO / "memoria" / "estado.json"
    if not arq.exists():
        return 0
    try:
        estado = json.loads(arq.read_text(encoding="utf-8"))
        return len(estado.get("backlog", []))
    except Exception:
        return 0


def validar_features_po() -> list[str]:
    """Valida e remove features PO-* inválidas do backlog."""
    arq = RAIZ_PROJETO / "memoria" / "estado.json"
    if not arq.exists():
        return []
    try:
        estado = json.loads(arq.read_text(encoding="utf-8"))
    except Exception:
        return []

    backlog = estado.get("backlog", [])
    ids_remover = set()
    problemas = []

    for item in backlog:
        item_id = item.get("id", "")
        if not item_id.startswith("PO-"):
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
            caminho = RAIZ_PROJETO / arq_nome
            if not caminho.exists():
                problemas.append(f"❌ {item_id}: arquivo inexistente {arq_nome}")
                ids_remover.add(item_id)
                break

    if ids_remover:
        antes = len(backlog)
        estado["backlog"] = [b for b in backlog if b.get("id") not in ids_remover]
        arq.write_text(json.dumps(estado, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"🧹 Removidas {antes - len(estado['backlog'])} features inválidas")

    return problemas


def executar_product_owner(backlog_minimo: int = PO_BACKLOG_MINIMO, forcar: bool = False) -> bool:
    """Roda o PO somente se backlog < mínimo (ou forcar=True). Retorna True se OK."""
    antes = backlog_tamanho()
    if not forcar and antes >= backlog_minimo:
        print(f"⏭️ Backlog já tem {antes} itens (mínimo {backlog_minimo}). Pulando PO.")
        return True

    print("\n" + "=" * 60)
    print(f"📋 PRODUCT OWNER — backlog {antes}/{backlog_minimo}, gerando features" + (" (forçado)" if forcar else ""))
    print("=" * 60)

    equipe = EquipeERP()
    tarefas = TarefasERP()

    try:
        po = equipe.product_owner()
        task = tarefas.gerar_features(po, forcar=forcar)
        Crew(
            agents=[po],
            tasks=[task],
            process=Process.sequential,
            memory=False,
            planning=False,
            verbose=True,
        ).kickoff()
    except Exception:
        print("❌ Product Owner falhou:")
        traceback.print_exc()
        return False

    problemas = validar_features_po()
    if problemas:
        print("\n🔍 Validação encontrou problemas:")
        for p in problemas:
            print(f"  {p}")

    depois = backlog_tamanho()
    delta = depois - antes
    print(f"\n📊 Backlog: {antes} → {depois} (Δ = {delta:+d})")
    if forcar:
        return True
    return depois >= backlog_minimo


if __name__ == "__main__":
    executar_product_owner()