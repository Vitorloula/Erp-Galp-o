# agents/melhorar.py
"""
Script manual: Product Owner + 1 ciclo de implementação.
Uso:
    python agents/melhorar.py                 # PO + implementa 1 feature
    python agents/melhorar.py --so-analisar   # só PO (não implementa)
    python agents/melhorar.py --sem-push      # só local
    python agents/melhorar.py --forcar-po     # ignora backlog mínimo
"""
import argparse
import json
import sys
import traceback
from datetime import datetime

import git

from core import Config, log, validar_ambiente, RAIZ_PROJETO
from agents import EquipeERP
from tasks import TarefasERP
from product_owner import backlog_tamanho, executar_product_owner, validar_features_po
from design_audit import executar_auditoria_design
from pipeline import executar_ciclo

ESTADO_JSON = RAIZ_PROJETO / "memoria" / "estado.json"


def preview_backlog():
    if not ESTADO_JSON.exists():
        print("📋 Backlog vazio (estado.json não existe)")
        return
    try:
        estado = json.loads(ESTADO_JSON.read_text(encoding="utf-8"))
        backlog = estado.get("backlog", [])
        if not backlog:
            print("📋 Backlog vazio")
            return
        print(f"\n📋 Backlog atual ({len(backlog)} itens):\n")
        for item in backlog:
            prio = item.get("prioridade", "?")
            tipo = item.get("tipo", "?")
            titulo = item.get("titulo", "(sem título)")
            evid = item.get("evidencia", "")
            print(f"  [{item.get('id', '?')}] P{prio} · {tipo}")
            print(f"      {titulo}")
            if evid:
                print(f"      📍 {evid[:100]}")
            print()
    except Exception as e:
        print(f"❌ Erro lendo backlog: {e}")


def commit_e_push(repo: git.Repo, mensagem: str, fazer_push: bool) -> str | None:
    try:
        repo.git.add(A=True)
        if not repo.is_dirty(untracked_files=True):
            log("ℹ️ Nada a commitar")
            return None
        commit = repo.index.commit(mensagem)
        log(f"📸 Commit: {commit.hexsha[:8]} — {mensagem}")
        if fazer_push:
            try:
                origin = repo.remote(name="origin")
                branch = repo.active_branch.name
                origin.push(refspec=f"{branch}:{branch}")
                log(f"🚀 Push para origin/{branch}")
            except Exception:
                log("⚠️ Push falhou (commit local feito):")
                traceback.print_exc()
        return commit.hexsha
    except Exception:
        traceback.print_exc()
        return None


def main():
    parser = argparse.ArgumentParser(description="Melhoria manual: PO + 1 ciclo")
    parser.add_argument("--so-analisar", action="store_true", help="Só PO (não implementa)")
    parser.add_argument("--sem-push", action="store_true", help="Só commit local")
    parser.add_argument("--forcar-po", action="store_true", help="Ignora backlog mínimo")
    args = parser.parse_args()

    print("=" * 60)
    print("🛠️ MODO MANUAL — Melhorias sob demanda")
    print("=" * 60)

    validar_ambiente(RAIZ_PROJETO)
    log("📊 Estado atual:")
    preview_backlog()

    log("\n" + "=" * 60)
    log("📋 Fase 1: Product Owner")
    log("=" * 60)
    if args.forcar_po:
        sucesso_po = executar_product_owner(forcar=True)
    else:
        sucesso_po = executar_product_owner()

    if not sucesso_po:
        log("❌ PO não gerou features. Encerrando.")
        sys.exit(1)

    validar_features_po()
    log("\n📊 Backlog após o PO:")
    preview_backlog()

    log("\n" + "=" * 60)
    log("🎨 Auditoria de design")
    log("=" * 60)
    executar_auditoria_design(forcar=args.forcar_po)
    log("\n📊 Backlog após auditoria de design:")
    preview_backlog()

    if args.so_analisar:
        log("\n✅ Modo --so-analisar: encerrando (nada implementado).")
        return

    log("\n" + "=" * 60)
    log("🔁 Fase 2: Implementando 1 feature")
    log("=" * 60)

    repo = git.Repo(RAIZ_PROJETO)
    branch = repo.active_branch.name
    log(f"🌿 Branch: {branch}")

    config = Config()
    equipe = EquipeERP()
    tarefas = TarefasERP()
    ok, motivo, _extra = executar_ciclo(equipe, tarefas, 1, RAIZ_PROJETO, config)

    if ok:
        log("\n✅ Ciclo aprovado")
        msg = f"feat(ia): melhorias manuais {datetime.now():%Y-%m-%d %H:%M}"
        commit_e_push(repo, msg, fazer_push=not args.sem_push)
        log("\n🎉 Feature commitada.")
    else:
        log("\n❌ Ciclo reprovado")
        log(f"Motivo: {motivo}")

    print("\n" + "=" * 60)
    print("📊 RESUMO DA SESSÃO")
    print("=" * 60)
    print(f"Backlog final: {backlog_tamanho()} itens")
    print("Status:", "✅ 1 feature commitada" if ok else "⚠️ Feature não commitada")


if __name__ == "__main__":
    main()
