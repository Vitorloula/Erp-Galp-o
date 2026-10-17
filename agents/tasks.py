# agentes/tasks.py
from crewai import Task

class TarefasERP:
    def ciclo_autonomo_completo(self, arquiteto, designer, programador, qa):
        return [
            Task(
                description=(
                    "PASSO 1 — Estude 'ler_estado_projeto'. Se o backlog estiver vazio, INSPECIONE o código. "
                    "Use 'atualizar_backlog' para registrar itens com id, titulo, prioridade e tipo.\n"
                    "PASSO 2 — Escolha o PRÓXIMO item e produza um PLANO: item_id, objetivo, arquivos alvo, critérios de aceite."
                ),
                expected_output="Plano com: ITEM_ID=<id>, OBJETIVO, ARQUIVOS_ALVO, CRITERIOS_DE_ACEITE (lista).",
                agent=arquiteto,
            ),
            Task(
                description=(
                    "Defina: estrutura de componentes, props TS, Tailwind, breakpoints, a11y. "
                    "IMPORTANTE: Verifique se o componente já tem testes E2E (Playwright) na pasta 'e2e/'. "
                    "Não altere IDs ou datas-testid que os testes E2E dependem."
                ),
                expected_output="Diretrizes de UI/UX acionáveis.",
                agent=designer,
            ),
            Task(
                description=(
                    "Implemente o PLANO salvando CADA arquivo com 'escrever_arquivo'. "
                    "Respeite 'regras_projeto.md'. NUNCA exponha segredos. "
                    "ATENÇÃO: Se a tarefa exigir mudar algo na tela, leia o teste E2E correspondente em 'e2e/' "
                    "e mantenha os seletores (data-testid, labels) intactos. "
                    "Ao final, rode 'npx tsc --noEmit'."
                ),
                expected_output="Lista de arquivos criados/modificados + status do tsc.",
                agent=programador,
            ),
            Task(
                description=(
                    "Valide rodando 'npx tsc --noEmit' e 'npx vitest run --coverage'. "
                    "Se a cobertura for menor que 80%, escreva mais testes unitários. "
                    "Atualize GUIA_DE_TESTES.md e DOCUMENTACAO_ERP.md. "
                    "FINALIZE com uma linha exata: 'VEREDITO: APROVADO' ou 'VEREDITO: REPROVADO — <motivo>'."
                ),
                expected_output="Docs atualizados + veredito explícito.",
                agent=qa,
            ),
        ]

    def tarefa_correcao(self, programador, motivo: str, log: str = ""):
        return Task(
            description=(
                f"O QA REPROVOU o ciclo. Motivo: {motivo}\n"
                "Corrija APENAS o necessário usando 'escrever_arquivo' (sobrescrever). "
                f"=== LOG DE TESTES ===\n{log[-5000:]}"
            ),
            expected_output="Arquivos corrigidos + confirmação de tsc OK.",
            agent=programador,
        )

    def tarefa_fechamento(self, qa, sucesso: bool, resumo: str):
        return Task(
            description=(
                f"Ciclo terminou com {'SUCESSO' if sucesso else 'FALHA'}. "
                f"Resumo: {resumo}\nUse 'registrar_ciclo' e 'atualizar_backlog'."
            ),
            expected_output="Histórico atualizado.",
            agent=qa,
        )