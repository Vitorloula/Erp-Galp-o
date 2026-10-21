# agentes/tasks.py
"""
Tasks do pipeline. Regras detalhadas de E2E vivem em 'agents/REGRAS_E2E.md'.
QA LLM só documenta — gate mecânico (qa_gate.py) é quem aprova/reprova.
"""

from crewai import Task


class TarefasERP:
    # ================================================================
    # Pipeline principal (um ciclo autônomo completo)
    # ================================================================
    def ciclo_autonomo_completo(self, arquiteto, designer, programador, qa):
        return [
            # ------------------------------------------------------- #
            # 1. ARQUITETO
            # ------------------------------------------------------- #
            Task(
                description=(
                    "PASSO 1 — Leia 'ler_estado_projeto'. Se o backlog estiver "
                    "vazio ou desatualizado, inspecione o código "
                    "(listar_arquivos em src/, buscar_no_codigo por "
                    "TODOs/placeholders) e use 'atualizar_backlog' com "
                    "acao='adicionar' para registrar 3-8 itens concretos "
                    "(id T-001..., titulo, prioridade 1=alta, tipo, "
                    "arquivos_que_toca).\n\n"
                    "PASSO 2 — Escolha o PRÓXIMO item a executar (prioridade "
                    "mais alta).\n\n"
                    "PASSO 3 — PERSISTA o plano chamando 'definir_plano' com:\n"
                    "  item_id: o ID escolhido\n"
                    "  objetivo: 1-2 frases\n"
                    "  arquivos_json: array JSON com paths que serão tocados, "
                    "ex: '[\"src/pages/Estoque.tsx\"]'\n"
                    "  criterios: lista textual do que conta como 'pronto'"
                ),
                expected_output=(
                    "Plano persistido em estado.json (campo plano_atual). "
                    "Formato esperado: '✅ Plano salvo: item=..., arquivos=N.'"
                ),
                agent=arquiteto,
            ),

            # ------------------------------------------------------- #
            # 2. DESIGNER
            # ------------------------------------------------------- #
            Task(
                description=(
                    "Leia o plano via 'ler_estado_projeto' (campo plano_atual).\n\n"
                    "Defina diretrizes visuais concretas para o item:\n"
                    "  • Componentes: reutilize os de 'src/components/ui.tsx' "
                    "(.btn, .campo, .cartao, Kpi, Modal, Segmentado, Badge*, "
                    "Cabecalho, Aviso, Vazio, Carregando) — NÃO proponha novo "
                    "componente se um existente serve.\n"
                    "  • Responsividade: mobile-first; verifique breakpoints "
                    "sm/md/lg e garanta que NÃO há rolagem horizontal em "
                    "nenhuma largura; no celular use toque >= 44px e "
                    "safe-area (pb-seguro).\n"
                    "  • Estados: loading, erro, vazio e desabilitado para "
                    "cada interação.\n"
                    "  • A11y: aria-label, foco visível, contraste WCAG AA, "
                    "texto alternativo de ícone.\n"
                    "  • Visual atual: classes Tailwind consistentes com "
                    "src/index.css (cores emerald/slate, bordas, sombras, "
                    "ícones lucide-react, fonte Inter).\n\n"
                    "IMPORTANTE — Antes de propor mudanças na UI, LEIA a "
                    "pasta 'e2e/' e verifique se o componente/tela que será "
                    "alterado tem testes E2E. Se tiver, liste quais .spec.ts "
                    "precisarão ser atualizados.\n\n"
                    "NUNCA altere IDs, data-testid, aria-labels ou textos "
                    "que os testes E2E dependem SEM avisar neste plano.\n\n"
                    "MELHORIA CONTÍNUA — Se notar dívida de design fora do "
                    "escopo do item (tela inconsistente, falta de "
                    "responsividade, problema de acessibilidade), registre um "
                    "item no backlog com 'atualizar_backlog' acao='adicionar', "
                    "tipo='design', prioridade e 'arquivos_que_toca'."
                ),
                expected_output=(
                    "Diretrizes de UI/UX (componentes reutilizados, "
                    "breakpoints, estados, a11y) + lista de .spec.ts afetados "
                    "+ eventuais itens de design adicionados ao backlog."
                ),
                agent=designer,
            ),

            # ------------------------------------------------------- #
            # 3. PROGRAMADOR
            # ------------------------------------------------------- #
            Task(
                description=(
                    "Implemente o plano de 'plano_atual' salvando CADA "
                    "arquivo com 'escrever_arquivo'. Respeite "
                    "'regras_projeto.md'. NUNCA exponha segredos.\n\n"
                    "━━━ REGRAS DE E2E ━━━\n"
                    "ANTES de tocar em qualquer .spec.ts, LEIA "
                    "'agents/REGRAS_E2E.md' com 'ler_arquivo'. As regras "
                    "de lá são OBRIGATÓRIAS. Em resumo:\n"
                    "  • Atualize .spec.ts que você quebrou (Regra 1)\n"
                    "  • Nunca use `expect(await locator.count())` (Regra 2)\n"
                    "  • Cubra opções dinâmicas completamente (Regra 3)\n"
                    "  • Nunca reverta UI para teste passar (Regra 4)\n"
                    "  • Regex flexível em toasts (Regra 5)\n"
                    "  • Busca com debounce: espere o botão antes do "
                    "    Enter, ou clique nele (Regra 6)\n"
                    "  • Bug real × teste desatualizado (Regra 8)\n\n"
                    "Ao final, rode 'npx tsc --noEmit' e "
                    "'npx playwright test --project=app-computador'."
                ),
                expected_output=(
                    "Arquivos criados/modificados + status do tsc + status "
                    "do E2E. Inclua quais .spec.ts foram atualizados e por quê."
                ),
                agent=programador,
            ),

            # ------------------------------------------------------- #
            # 4. QA (só documenta — gate é externo)
            # ------------------------------------------------------- #
            Task(
                description=(
                    "O gate mecânico (tsc/vitest/build/playwright) é "
                    "rodado por script externo (qa_gate.py). Seu papel é "
                    "DOCUMENTAR.\n\n"
                    "Ações:\n"
                    "  1) Leia o plano (ler_estado_projeto -> plano_atual).\n"
                    "  2) Atualize GUIA_DE_TESTES.md com qualquer novo "
                    "     teste adicionado neste ciclo (nome do arquivo "
                    "     .spec.ts + o que cobre).\n"
                    "  3) Atualize DOCUMENTACAO_ERP.md se a feature for "
                    "     relevante para o usuário final.\n"
                    "  4) Chame 'registrar_ciclo' com um resumo do que foi "
                    "     feito (item_id + 2-3 linhas).\n\n"
                    "NÃO tente aprovar/reprovar — isso é feito pelo gate "
                    "mecânico. Seu veredito textual é apenas informativo. "
                    "Se você não conseguir executar npx/npm (ambiente sem "
                    "Node), registre isso claramente em vez de inventar "
                    "resultado."
                ),
                expected_output=(
                    "Docs atualizados + registro do ciclo no histórico."
                ),
                agent=qa,
            ),
        ]

    # ================================================================
    # Task de correção — usada pelo loop de auto-reparo do main.py
    # ================================================================
    def tarefa_correcao(self, programador, motivo: str, log: str = ""):
        return Task(
            description=(
                f"O gate REPROVOU o ciclo. Motivo: {motivo}\n\n"
                "Antes de corrigir, LEIA 'agents/REGRAS_E2E.md' e o plano "
                "atual (ler_estado_projeto -> plano_atual).\n\n"
                "Classifique a falha antes de agir:\n"
                "  • BUG REAL na UI (botão não funciona, filtro não aplica) "
                "    → corrija o componente em 'src/'.\n"
                "  • TESTE DESATUALIZADO (texto/aba/seção mudou) → atualize "
                "    o .spec.ts em 'e2e/app/'.\n"
                "  • TIMING/DEBOUNCE (`Received: X` com valor anterior ao "
                "    esperado) → use `expect.poll()` ou `toHaveCount()`.\n"
                "  • TOAST FLAKY (regex com código auto-gerado) → relaxe o "
                "    regex (ex: `/Produto cadastrado/` em vez de "
                "    `/Produto cadastrado \\(P\\d+\\)/`).\n"
                "  • BUSCA COM DEBOUNCE (Enter disparou antes dos "
                "    resultados) → espere o botão aparecer "
                "    (`getByRole().toBeVisible()`) e clique nele.\n"
                "  • VIOLAÇÃO MECÂNICA (skip, only, count() em asserção) → "
                "    remova.\n"
                "  • AMBIENTE (npx/npm não encontrado, WinError 2) → NÃO é "
                "    bug de código. Reporte e NÃO altere nenhum arquivo.\n\n"
                "❌ NUNCA comente, pule (.skip) ou reverta UI para fazer o "
                "ciclo passar.\n\n"
                "Corrija APENAS o necessário usando 'escrever_arquivo' "
                "(sobrescrever). Rode 'npx tsc --noEmit' e "
                "'npx playwright test --project=app-computador' ao final "
                "para confirmar.\n\n"
                f"=== LOG DE TESTES ===\n{log[-5000:]}"
            ),
            expected_output=(
                "Arquivos corrigidos + classificação da falha "
                "(bug real / teste desatualizado / timing / flaky / "
                "debounce / mecânico / ambiente) + confirmação de que o "
                "E2E passou (ou explicação de por que não foi possível "
                "executar)."
            ),
            agent=programador,
        )

    # ================================================================
    # Task de fechamento — registra o ciclo aprovado no histórico
    # ================================================================
    def tarefa_fechamento(self, qa, sucesso: bool, resumo: str, item_id: str = ""):
        concluir = (
            f"Use 'atualizar_backlog' com acao='concluir', "
            f"item_id='{item_id}'."
            if sucesso and item_id
            else "Não altere o backlog (ciclo não aprovado ou item_id desconhecido)."
        )
        return Task(
            description=(
                f"Ciclo terminou com {'SUCESSO' if sucesso else 'FALHA'}.\n"
                f"Resumo: {resumo}\n\n"
                "Ações:\n"
                "  1) Chame 'registrar_ciclo' com o resumo acima "
                "     (formato: '[YYYY-MM-DD] <título>\\n<resumo>').\n"
                f"  2) {concluir}\n"
                "  3) Se falha, NÃO mexa no backlog.\n\n"
                "O histórico é APPEND-ONLY. Nunca apague entradas antigas."
            ),
            expected_output=(
                "Histórico atualizado + item do backlog marcado (se sucesso)."
            ),
            agent=qa,
        )

    # ================================================================
    # Task do Product Owner
    # ================================================================
    def gerar_features(self, po):
        return Task(
            description=(
                "Antes de gerar features, leia 'ler_estado_projeto' e "
                "verifique se o backlog já tem 3+ itens pendentes. Se "
                "tiver, NÃO adicione nada e retorne 'backlog já satisfeito'.\n\n"
                "Para cada feature nova (id PO-001, PO-002, ...), use "
                "'atualizar_backlog' com acao='adicionar' e dados_json "
                "contendo:\n"
                "  • id, titulo (≤80 chars), prioridade (1=alta), tipo\n"
                "  • evidencia: 'arquivo.tsx:linha — <descrição do problema>'\n"
                "  • arquivos_que_toca: array com paths EXISTENTES (máx 5)\n\n"
                "Ancore CADA feature em evidência concreta do código. Sem "
                "evidência = não proponha."
            ),
            expected_output=(
                "Features válidas adicionadas (ou 'backlog já satisfeito')."
            ),
            agent=po,
        )

    # ================================================================
    # Task de auditoria de design (melhoria contínua do visual/responsivo)
    # ================================================================
    def tarefa_auditoria_design(self, designer):
        return Task(
            description=(
                "Faça uma auditoria de design em TODO o sistema para mantê-lo "
                "atual e 100% responsivo. Leia 'src/components/ui.tsx', "
                "'src/index.css', 'src/components/Layout.tsx' e varra as telas "
                "de 'src/pages/' com 'listar_arquivos' e 'buscar_no_codigo'.\n\n"
                "Procure problemas concretos (com evidência 'arquivo:linha'):\n"
                "  1. RESPONSIVIDADE — rolagem horizontal, tabelas/larguras "
                "     fixas sem overflow, grids que quebram em 390px, alvo de "
                "     toque < 44px, falta de safe-area (pb-seguro) na "
                "     navegação inferior.\n"
                "  2. CONSISTÊNCIA — componente reinventado no lugar dos de "
                "     ui.tsx (.btn/.campo/.cartao/Kpi/Modal), cores fora do "
                "     padrão emerald/slate, espaçamentos divergentes, badge "
                "     sem ícone.\n"
                "  3. ACESSIBILIDADE — botão de ícone sem aria-label, "
                "     contraste abaixo de WCAG AA, foco não visível, estado "
                "     sem texto além da cor.\n"
                "  4. ATUALIDADE — estados vazios/loading inexistentes, "
                "     feedback ausente, tipografia/escala inconsistente.\n\n"
                "Para CADA problema real, registre um item no backlog com "
                "'atualizar_backlog' acao='adicionar':\n"
                "  • id D-001, D-002, ...\n"
                "  • titulo (≤80 chars), prioridade (1=alta), tipo='design'\n"
                "  • evidencia: 'arquivo.tsx:linha — descrição'\n"
                "  • arquivos_que_toca: paths EXISTENTES (máx 5)\n"
                "  • criterios: o que conta como pronto\n\n"
                "Ancore CADA item em evidência real do código. Sem evidência = "
                "não proponha. Não invente problemas; se a UI já estiver "
                "consistente, retorne 'auditoria de design: nada a melhorar'."
            ),
            expected_output=(
                "Itens de design (D-*) adicionados ao backlog, ou 'nada a "
                "melhorar'."
            ),
            agent=designer,
        )