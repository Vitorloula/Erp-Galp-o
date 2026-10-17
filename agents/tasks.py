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
                    "Com base no PLANO, defina: estrutura de componentes, props "
                    "TypeScript, uso de Tailwind (classes concretas), breakpoints, "
                    "estados loading/erro/vazio, a11y (aria-labels, foco, contraste). "
                    "Cite componentes existentes a reutilizar (use buscar_no_codigo)."
                ),
                expected_output="Diretrizes de UI/UX acionáveis (lista objetiva).",
                agent=designer,
            ),
            Task(
                description=(
                    "Implemente o PLANO salvando CADA arquivo com 'escrever_arquivo'. "
                    "Respeite 'regras_projeto.md' (alias '@/', Tailwind, lucide-react, "
                    "Zustand). NUNCA exponha segredos. Ao final, rode "
                    "'npx tsc --noEmit' e corrija erros de tipo antes de entregar."
                ),
                expected_output="Lista de arquivos criados/modificados + status do tsc.",
                agent=programador,
            ),
            Task(
                description=(
                    "Valide: rode 'npx tsc --noEmit' e 'npx vitest run'. "
                    "Atualize GUIA_DE_TESTES.md e DOCUMENTACAO_ERP.md via "
                    "'escrever_arquivo'. Registre o ciclo com 'registrar_ciclo'. "
                    "Se aprovado, marque o item do backlog como concluído "
                    "('atualizar_backlog' acao='concluir'). "
                    "FINALIZE com uma linha exata: 'VEREDITO: APROVADO' "
                    "ou 'VEREDITO: REPROVADO — <motivo curto>'."
                ),
                expected_output="Docs atualizados + linha 'VEREDITO: APROVADO|REPROVADO — motivo'.",
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