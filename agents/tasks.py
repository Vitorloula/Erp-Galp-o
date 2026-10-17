# agentes/tasks.py
from crewai import Task

class TarefasERP:
    def ciclo_autonomo_completo(self, arquiteto, designer_ui_ux, programador, qa_tester):
        return [
            Task(
                description=(
                    "Analise o 'memoria_projeto.md' e o estado atual do repositório. "
                    "Decida autonomamente a próxima prioridade para o ERP GALPÃO (backend ou frontend/telas)."
                ),
                expected_output="Definição técnica da prioridade do ciclo.",
                agent=arquiteto
            ),
            Task(
                description=(
                    "Com base na tarefa definida, especifique a experiência do usuário (UX), a responsividade, "
                    "o layout mobile-first, o uso de componentes Tailwind CSS e as boas práticas de acessibilidade e design system."
                ),
                expected_output="Diretrizes de UI/UX, layout e responsividade detalhadas.",
                agent=designer_ui_ux
            ),
            Task(
                description=(
                    "Implemente o código funcional em ../src/ integrando a lógica de backend/frontend "
                    "e aplicando rigorosamente as diretrizes visuais e responsivas propostas pelo designer."
                ),
                expected_output="Código implementado e salvo na pasta ../src/.",
                agent=programador
            ),
            Task(
                description=(
                    "Valide o código, crie o 'GUIA_DE_TESTES.md', atualize a 'DOCUMENTACAO_ERP.md' "
                    "e registre as evoluções no 'memoria_projeto.md'."
                ),
                expected_output="Documentação, guias de teste e relatórios atualizados com sucesso.",
                agent=qa_tester
            )
        ]