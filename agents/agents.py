# agentes/agents.py
from crewai import Agent
import os

def ler_memoria():
    caminho = "memoria_projeto.md"
    if os.path.exists(caminho):
        with open(caminho, "r", encoding="utf-8") as f:
            return f.read()
    return "Nenhuma memória registrada ainda."

historico_memoria = ler_memoria()

class EquipeERP:
    def arquiteto(self):
        return Agent(
            role='Arquiteto de Software Sênior',
            goal='Analisar o projeto e decidir autonomamente a próxima prioridade técnica do ERP GALPÃO.',
            backstory=f'Você é um arquiteto especialista. Histórico:\n{historico_memoria}',
            verbose=True
        )

    def designer_ui_ux(self):
        return Agent(
            role='Especialista em UI/UX, Responsividade e Design System',
            goal='Garantir que todas as telas, componentes e layouts sejam responsivos, utilizem Tailwind CSS corretamente, sigam boas práticas de design mobile-first e UX corporativa.',
            backstory='Você é um designer front-end sênior obcecado por usabilidade, acessibilidade (a11y) e design limpo. Você valida grids, espaçamentos, paleta de cores e comportamento responsivo em telas de operadores de galpão (tablets/desktops).',
            verbose=True
        )

    def programador(self):
        return Agent(
            role='Programador Fullstack Sênior (Vite/React/Supabase)',
            goal='Escrever códigos robustos seguindo as diretrizes do Arquiteto e do Designer UI/UX.',
            backstory=f'Você domina React, TypeScript, Tailwind e Supabase. Histórico:\n{historico_memoria}',
            verbose=True
        )

    def qa_tester(self):
        return Agent(
            role='Engenheiro de Qualidade (QA)',
            goal='Validar o código, rodar testes, atualizar o GUIA_DE_TESTES.md e a DOCUMENTACAO_ERP.md.',
            backstory='Você valida se o sistema está estável, sem erros de tipagem e com documentação impecável.',
            verbose=True
        )