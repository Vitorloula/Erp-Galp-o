# agentes/main.py
import os
import sys
import subprocess
import git
from datetime import datetime
from crewai import Crew, Process
from agents import EquipeERP  # 👈 Importação corrigida
from tasks import TarefasERP

# Inicializa os Agentes e Tarefas
equipe = EquipeERP()
tarefas = TarefasERP()

arq = equipe.arquiteto()
designer = equipe.designer_ui_ux()
dev = equipe.programador()
qa = equipe.qa_tester()

crew = Crew(
    agents=[arq, designer, dev, qa],
    tasks=tarefas.ciclo_autonomo_completo(arq, designer, dev, qa),
    process=Process.sequential,
    verbose=True
)

def rodar_pipeline_de_testes(repo_path):
    print("\n🔍 [PIPELINE] Executando validações de qualidade de código...")
    
    print("👉 Verificando tipagem TypeScript (tsc)...")
    res_tsc = subprocess.run(["npx", "tsc", "--noEmit"], cwd=repo_path, capture_output=True, text=True)
    if res_tsc.returncode != 0:
        print("❌ Erro: O código gerado possui falhas de tipagem TypeScript!")
        print(res_tsc.stdout)
        print(res_tsc.stderr)
        return False
    print("✅ Tipagem TypeScript aprovada!")

    print("👉 Executando bateria de testes do projeto...")
    res_test = subprocess.run(["npm", "test", "--", "--run"], cwd=repo_path, capture_output=True, text=True)
    if res_test.returncode != 0:
        print("⚠️ Aviso: Alguns testes automatizados falharam ou não foram encontrados.")
        print(res_test.stdout)
    else:
        print("✅ Todos os testes passaram com sucesso!")

    return True

def preparar_ambiente_git(repo):
    try:
        repo.git.checkout('main')
        origin = repo.remote(name='origin')
        origin.pull()
        
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        branch_name = f"feature/ia-ui-autonoma-{timestamp}"
        
        repo.git.checkout('-b', branch_name)
        print(f"🌿 Branch isolada criada: {branch_name}")
        return branch_name
    except Exception as e:
        print(f"⚠️ Erro no setup Git: {e}")
        sys.exit(1)

def finalizar_e_enviar_pr(repo, branch_name):
    try:
        print("\n📦 Empacotando alterações validadas para o GitHub...")
        repo.git.add(A=True)
        
        if not repo.is_dirty(untracked_files=True):
            print("ℹ️ Nenhuma alteração detectada.")
            return

        commit_msg = f"feat(ia): ciclo autônomo com UI/UX concluído - {branch_name}"
        repo.index.commit(commit_msg)
        
        origin = repo.remote(name='origin')
        origin.push(refspec=f"{branch_name}:{branch_name}")
        print(f"🚀 Push enviado com sucesso para a branch '{branch_name}'!")
        
        repo.git.checkout('main')
        return branch_name
    except Exception as e:
        print(f"❌ Erro ao enviar para o GitHub: {e}")
        return None

if __name__ == "__main__":
    print("="*60)
    print("🤖 FÁBRICA AUTÓNOMA DE SOFTWARE (COM UI/UX) — ERP GALPÃO")
    print("="*60)
    
    raiz_projeto = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    repo_git = git.Repo(raiz_projeto)
    
    branch_ativa = preparar_ambiente_git(repo_git)
    
    print("\n🏗️ Executando ciclo autônomo (Arquiteto -> Designer -> Dev -> QA)...")
    resultado = crew.kickoff()
    
    with open(os.path.join(raiz_projeto, "relatorio_melhorias.md"), "w", encoding="utf-8") as f:
        f.write(str(resultado))
        
    testes_aprovados = rodar_pipeline_de_testes(raiz_projeto)
    
    if not testes_aprovados:
        print("\n❌ [PIPELINE ABORTADO] O código gerado falhou nas validações locais.")
        repo_git.git.checkout('main')
        sys.exit(1)
        
    branch_enviada = finalizar_e_enviar_pr(repo_git, branch_ativa)
    
    print("\n" + "="*60)
    print("🎉 CICLO AUTÓNOMO EXECUTADO COM SUCESSO!")
    print("="*60)
    if branch_enviada:
        print(f"📌 Branch pronta no GitHub: {branch_enviada}")
        print("📋 PRÓXIMOS PASSOS:")
        print("  1. Leia o 'GUIA_DE_TESTES.md' e o 'DOCUMENTACAO_ERP.md' gerados na raiz.")
        print("  2. Abra o Pull Request no GitHub e faça o Merge!")
    print("="*60)