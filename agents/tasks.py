# agentes/tasks.py
from crewai import Task

class TarefasERP:
    def ciclo_autonomo_completo(self, arquiteto, designer, programador, qa):
        return [
            Task(
                description=(
                    "PASSO 1 — Estude 'ler_estado_projeto'. Se o backlog estiver "
                    "vazio ou desatualizado, INSPECIONE o código (listar_arquivos "
                    "em src/, buscar_no_codigo por TODOs/placeholders) e use "
                    "'atualizar_backlog' para registrar 3-8 itens concretos com "
                    "id (T-001...), titulo, prioridade (1=alta) e tipo.\n"
                    "PASSO 2 — Escolha o PRÓXIMO item a executar e produza um "
                    "PLANO com: item_id escolhido, objetivo, arquivos que serão "
                    "tocados, critérios de aceite verificáveis."
                ),
                expected_output=(
                    "Plano com: ITEM_ID=<id>, OBJETIVO, ARQUIVOS_ALVO, "
                    "CRITERIOS_DE_ACEITE (lista)."
                ),
                agent=arquiteto,
            ),
            Task(
                description=(
                    "Defina: estrutura de componentes, props TS, Tailwind, breakpoints, a11y. "
                    "IMPORTANTE: Verifique se o componente já tem testes E2E (Playwright) na pasta 'e2e/'. "
                    "Não altere IDs ou data-testid que os testes E2E dependem."
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
                "Rode 'npx tsc --noEmit' ao final.\n\n"
                f"=== LOG DE TESTES ===\n{log[-5000:]}"
            ),
            expected_output="Arquivos corrigidos + confirmação de tsc OK.",
            agent=programador,
        )

    def tarefa_fechamento(self, qa, sucesso: bool, resumo: str):
        return Task(
            description=(
                f"Ciclo terminou com {'SUCESSO' if sucesso else 'FALHA'}. "
                f"Resumo: {resumo}\n"
                "Use 'registrar_ciclo' para anexar ao historico.md. "
                "Se sucesso, marque o item do backlog como concluído."
            ),
            expected_output="Histórico atualizado.",
            agent=qa,
        )