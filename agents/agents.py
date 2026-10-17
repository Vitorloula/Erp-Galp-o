# agentes/agents.py
from pathlib import Path
from crewai import Agent
from tools import (
    ler_arquivo, escrever_arquivo, listar_arquivos, buscar_no_codigo,
    rodar_comando_npm, ler_estado_projeto, atualizar_backlog, registrar_ciclo,
)

RAIZ_PROJETO = Path(__file__).resolve().parent.parent
CAMINHO_MEMORIA = RAIZ_PROJETO / "memoria_projeto.md"


def ler_memoria(max_chars: int = 4000) -> str:
    if not CAMINHO_MEMORIA.exists():
        return "Sem memória."
    txt = CAMINHO_MEMORIA.read_text(encoding="utf-8")
    return txt[-max_chars:] if len(txt) > max_chars else txt


class EquipeERP:
    """Fábrica de agentes — memória SEMPRE fresca por instanciação."""

    def _bs(self, base: str) -> str:
        return f"{base}\n\n=== Histórico (resumo) ===\n{ler_memoria()}"

    # -------------------------------------------------------------- #
    def arquiteto(self) -> Agent:
        return Agent(
            role="Arquiteto de Software Sênior (auto-evolutivo)",
            goal=(
                "Manter o backlog do projeto sempre atualizado e priorizado. "
                "A cada ciclo: (1) ler o estado via 'ler_estado_projeto'; "
                "(2) inspecionar o código real (listar_arquivos, buscar_no_codigo); "
                "(3) adicionar itens novos com 'atualizar_backlog'; "
                "(4) escolher o PRÓXIMO item a executar e justificar."
            ),
            backstory=self._bs(
                "Você é um arquiteto de produto pragmático. Você odeia backlog "
                "desatualizado e prioridades vagas. Você prefere entregas pequenas "
                "e verificáveis. Você pensa em termos de 'o que entrega valor "
                "imediatamente ao operador do galpão'."
            ),
            tools=[ler_estado_projeto, atualizar_backlog, ler_arquivo,
                   listar_arquivos, buscar_no_codigo],
            allow_delegation=False,
            verbose=True,
        )

    def designer_ui_ux(self) -> Agent:
        return Agent(
            role="Designer UI/UX + Design System",
            goal=(
                "Traduzir o item escolhido pelo Arquiteto em diretrizes visuais "
                "concretas: componentes, breakpoints, estados (loading/erro/vazio), "
                "a11y, mobile-first. Checar componentes existentes antes de propor novos."
            ),
            backstory=self._bs(
                "Designer sênior obsessivo por usabilidade em tablets/desktops de "
                "galpão. Conhece Tailwind profundamente e detesta reinventar componente."
            ),
            tools=[ler_arquivo, listar_arquivos, buscar_no_codigo],
            allow_delegation=False,
            verbose=True,
        )

    def programador(self) -> Agent:
        return Agent(
            role="Programador Fullstack Sênior (Vite/React/Supabase)",
            goal=(
                "Implementar o item priorizado SALVANDO cada arquivo em disco "
                "com 'escrever_arquivo'. Usar '@/'. Zustand para estado. "
                "Validar tipagem com 'npx tsc --noEmit' antes de concluir."
            ),
            backstory=self._bs(
                "Dev sênior meticuloso. Você nunca 'deixa para depois' a tipagem. "
                "Você respeita o design system e as regras de 'regras_projeto.md'."
            ),
            tools=[ler_arquivo, escrever_arquivo, listar_arquivos,
                   buscar_no_codigo, rodar_comando_npm],
            allow_delegation=False,
            verbose=True,
        )

    def qa_tester(self) -> Agent:
        return Agent(
            role="Engenheiro de Qualidade (QA) com poder de autoavaliação",
            goal=(
                "Rodar tsc + vitest. Se falhar, DEVOLVER erros concretos ao "
                "Programador (via retorno textual). Se passar, atualizar "
                "GUIA_DE_TESTES.md, DOCUMENTACAO_ERP.md e registrar ciclo. "
                "SEMPRE emitir veredito final no formato: 'VEREDITO: APROVADO' "
                "ou 'VEREDITO: REPROVADO — <motivo>'."
            ),
            backstory=self._bs(
                "QA rigoroso e conciso. Você fala em fatos: 'tsc falhou em X', "
                "'teste Y quebrou'. Você NUNCA aprova código com erros de tipo."
            ),
            tools=[ler_arquivo, escrever_arquivo, listar_arquivos,
                   rodar_comando_npm, registrar_ciclo, atualizar_backlog],
            allow_delegation=False,
            verbose=True,
        )