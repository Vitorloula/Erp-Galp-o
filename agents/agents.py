# agents/agents.py
"""Definição dos agentes (CrewAI) — memória fresca por instanciação e custo controlado.

Configuração de modelo (env):
  LLM_MODEL           → modelo padrão de todos os agentes
  LLM_MODEL_ARQUITETO → override do Arquiteto (ex.: modelo mais forte)
  LLM_MODEL_PO        → override do Product Owner
  ... (DESIGNER, PROGRAMADOR, QA seguem o mesmo padrão)

Sem nenhuma env, o CrewAI usa o default dele (OPENAI_MODEL_NAME / provider).
"""
import os
from pathlib import Path

from crewai import Agent

from tools import (
    ler_arquivo, escrever_arquivo, listar_arquivos, buscar_no_codigo,
    rodar_comando_npm, ler_estado_projeto, atualizar_backlog, registrar_ciclo,
    definir_plano,
)

RAIZ_PROJETO = Path(__file__).resolve().parent.parent
CAMINHO_MEMORIA = RAIZ_PROJETO / "memoria_projeto.md"

# Limita o número de iterações por agente: evita loop caro que estoura tokens.
MAX_ITER = int(os.getenv("AGENT_MAX_ITER", "12"))


def _llm(papel: str) -> str | None:
    """Modelo por papel: LLM_MODEL_<PAPEL> > LLM_MODEL > None (default CrewAI)."""
    return os.getenv(f"LLM_MODEL_{papel.upper()}") or os.getenv("LLM_MODEL") or None


def ler_memoria(max_chars: int = 1500) -> str:
    """Resumo compacto da memória do projeto (o essencial, não o arquivo inteiro)."""
    if not CAMINHO_MEMORIA.exists():
        return "Sem memória."
    txt = CAMINHO_MEMORIA.read_text(encoding="utf-8")
    return txt[-max_chars:] if len(txt) > max_chars else txt


class EquipeERP:
    """Fábrica de agentes — memória SEMPRE fresca por instanciação."""

    def _bs(self, base: str) -> str:
        memoria = ler_memoria()
        if not memoria or memoria == "Sem memória.":
            return base
        return f"{base}\n\n=== Histórico (resumo) ===\n{memoria}"

    def _kwargs(self, papel: str) -> dict:
        """Parâmetros comuns: sem delegação, sem memória RAG, iter limitado, modelo opcional."""
        kwargs = {
            "allow_delegation": False,
            "memory": False,
            "max_iter": MAX_ITER,
            "verbose": True,
        }
        modelo = _llm(papel)
        if modelo:
            kwargs["llm"] = modelo
        return kwargs

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
            tools=[ler_estado_projeto, atualizar_backlog, definir_plano,
                   ler_arquivo, listar_arquivos, buscar_no_codigo],
            **self._kwargs("arquiteto"),
        )

    def designer_ui_ux(self) -> Agent:
        return Agent(
            role="Designer de Produto + Design System (melhoria contínua)",
            goal=(
                "Dono do design system e da experiência: manter o sistema "
                "visualmente atual e 100% responsivo. A cada ciclo: "
                "(1) traduzir o item do plano em diretrizes visuais concretas "
                "(componentes, breakpoints, estados, a11y, mobile-first); "
                "(2) detectar dívida de design (inconsistência, falta de "
                "responsividade, acessibilidade) e propor itens de melhoria no "
                "backlog via 'atualizar_backlog' com acao='adicionar' e "
                "tipo='design'. Nunca reinventar componente existente."
            ),
            backstory=self._bs(
                "Designer sênior de produto, obsessivo por usabilidade e "
                "consistência. Domina Tailwind CSS v4 (config CSS-first via "
                "@theme) e o design system do projeto: primitivos em "
                "src/components/ui.tsx (cx, Carregando, Vazio, BadgeSituacao, "
                "BadgeReposicao, BadgeTipo, Modal, Kpi, Segmentado, Cabecalho, "
                "Aviso) e classes em src/index.css (.btn*, .campo, .rotulo, "
                ".cartao, .chip*, .linha-*). Regras: mobile-first; breakpoint "
                "'lg' (>=1024px) liga o menu lateral e esconde a navegação "
                "inferior; 'sm' (>=640px) ajusta espaçamentos; alvo de toque "
                ">= 44px; contraste WCAG AA; foco visível; aria-labels; "
                "safe-area (pb-seguro); NUNCA rolagem horizontal; ícones "
                "lucide-react; fonte Inter. Pensa no operador do galpão "
                "(tablet/desktop) e no celular (câmera, PDV, leitor)."
            ),
            tools=[ler_estado_projeto, atualizar_backlog, ler_arquivo,
                   listar_arquivos, buscar_no_codigo],
            **self._kwargs("designer"),
        )

    def programador(self) -> Agent:
        return Agent(
            role="Programador Fullstack Sênior (Vite/React/Supabase)",
            goal=(
                "Implementar o item priorizado SALVANDO cada arquivo em disco "
                "com 'escrever_arquivo'. Usar imports relativos ('./', '../'). "
                "Zustand para estado. Validar tipagem com 'npx tsc --noEmit' "
                "antes de concluir."
            ),
            backstory=self._bs(
                "Dev sênior meticuloso. Você nunca 'deixa para depois' a tipagem. "
                "Você respeita o design system e as regras de 'regras_projeto.md'."
            ),
            tools=[ler_arquivo, escrever_arquivo, listar_arquivos,
                   buscar_no_codigo, rodar_comando_npm],
            **self._kwargs("programador"),
        )

    def qa_tester(self) -> Agent:
        return Agent(
            role="Engenheiro de Qualidade (QA) com poder de autoavaliação",
            goal=(
                "Rodar tsc + vitest. Se falhar, DEVOLVER erros concretos ao "
                "Programador. Se passar, atualizar GUIA_DE_TESTES.md, "
                "DOCUMENTACAO_ERP.md e registrar ciclo. SEMPRE emitir veredito "
                "final no formato: 'VEREDITO: APROVADO' ou 'VEREDITO: REPROVADO — <motivo>'."
            ),
            backstory=self._bs(
                "QA rigoroso e conciso. Você fala em fatos: 'tsc falhou em X', "
                "'teste Y quebrou'. Você NUNCA aprova código com erros de tipo."
            ),
            tools=[ler_arquivo, escrever_arquivo, listar_arquivos,
                   rodar_comando_npm, registrar_ciclo, atualizar_backlog],
            **self._kwargs("qa"),
        )

    def product_owner(self) -> Agent:
        return Agent(
            role="Product Owner (dono do produto)",
            goal=(
                "Gerar features novas ancoradas em evidência concreta do código, "
                "usando 'atualizar_backlog' com acao='adicionar'. Sem evidência, "
                "não propor."
            ),
            backstory=self._bs(
                "PO que conhece o negócio do galpão e prioriza pelo impacto no "
                "operador. Detesta feature sem justificativa."
            ),
            tools=[ler_estado_projeto, atualizar_backlog, ler_arquivo,
                   listar_arquivos, buscar_no_codigo],
            **self._kwargs("po"),
        )
