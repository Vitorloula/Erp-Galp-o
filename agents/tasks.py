# agentes/tasks.py
from crewai import Task


class TarefasERP:
    def ciclo_autonomo_completo(self, arquiteto, designer, programador, qa):
        return [
            # ============================================================
            # 1. ARQUITETO — Analisa, mantém o backlog e prioriza
            # ============================================================
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

            # ============================================================
            # 2. DESIGNER — Define UI/UX e mapeia testes E2E afetados
            # ============================================================
            Task(
                description=(
                    "Defina: estrutura de componentes, props TS, Tailwind, "
                    "breakpoints, a11y (aria-labels, foco, contraste).\n\n"
                    "IMPORTANTE — Antes de propor mudanças na UI, LEIA a pasta 'e2e/' "
                    "e verifique se o componente/tela que será alterado tem testes E2E. "
                    "Se tiver, avise no plano: 'Esta mudança quebrará os testes X, Y e Z — "
                    "atualizar o .spec.ts correspondente'.\n\n"
                    "NUNCA altere IDs, data-testid, aria-labels ou textos que os testes "
                    "E2E dependem SEM avisar. Se a mudança for necessária, o teste também "
                    "precisa ser atualizado — inclua isso no plano."
                ),
                expected_output=(
                    "Diretrizes de UI/UX + lista explícita de testes E2E que serão afetados."
                ),
                agent=designer,
            ),

            # ============================================================
            # 3. PROGRAMADOR — Implementa o código E ajusta os testes afetados
            # ============================================================
            Task(
                description=(
                    "Implemente o PLANO salvando CADA arquivo com 'escrever_arquivo'.\n"
                    "Respeite 'regras_projeto.md'. NUNCA exponha segredos.\n\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "🚨 REGRA 1 — ATUALIZAR TESTES E2E QUE VOCÊ QUEBROU\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "Se você alterou qualquer texto, ID, aba (ex: Excel), toast, "
                    "estado de empty, ou comportamento visível na UI:\n"
                    "  1) LEIA o arquivo .spec.ts correspondente em 'e2e/app/'\n"
                    "  2) ATUALIZE o .spec.ts para refletir a nova realidade\n"
                    "  3) Rode 'npx playwright test --project=app-computador' para validar\n\n"
                    "EXEMPLOS PRÁTICOS:\n"
                    "  - Se adicionou a aba 'Lista de compras' ao Excel, atualize o "
                    "expect do Excel em 'relatorios.spec.ts'.\n"
                    "  - Se adicionou uma nova seção ao PDF, inclua o nome dela no "
                    "loop que desmarca todas as seções no teste.\n"
                    "  - Se mudou o texto de um toast, use regex no .spec.ts "
                    "em vez de texto exato.\n"
                    "  - Se mudou um empty state, use asserção comportamental "
                    "(ex: `toHaveCount(0)` na lista) em vez de verificar texto.\n\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "🚨 REGRA 2 — NUNCA USE count() EM ASSERÇÕES (NÃO AUTO-ESPERA)\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "❌ ERRADO (não auto-espera, falha por timing/debounce):\n"
                    "   `expect(await movs(page).count()).toBeGreaterThan(3)`\n"
                    "   `expect(await page.locator('tr').count()).toBe(5)`\n"
                    "   `expect(await page.getByText('X').count()).toBe(1)`\n\n"
                    "✅ CORRETO (auto-espera até 8s, imune a debounce/async):\n"
                    "   `await expect(movs(page)).toHaveCount(5)`\n"
                    "   `await expect(page.locator('tr')).toHaveCount(5)`\n"
                    "   `await expect.poll(() => movs(page).count()).toBeGreaterThan(3)`\n\n"
                    "Motivo: campos de busca no app têm debounce de ~300ms. Se você "
                    "usa `expect(await count())`, o teste lê o valor ANTES do debounce "
                    "disparar, e falha. `toHaveCount()` e `expect.poll()` retentam.\n\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "🚨 REGRA 3 — COBRIR OPÇÕES DINÂMICAS COMPLETAMENTE\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "Se o código-fonte itera sobre uma lista (ex: array de seções, "
                    "abas, categorias), e você adicionou um item novo, ATUALIZE o "
                    "teste para cobrir esse item também.\n\n"
                    "Exemplo: se adicionou uma 5ª seção ao PDF, inclua o nome dela "
                    "no loop `for (const secao of [...])` no relatorios.spec.ts.\n"
                    "Se adicionou uma 5ª aba ao Excel, inclua em `.toEqual([...])`.\n\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "🚨 REGRA 4 — NUNCA REVERTER UI PARA TESTE PASSAR\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "Se um teste antigo falha porque a UI mudou (legitimamente), "
                    "ATUALIZE o teste. Não reverta a UI para o teste passar — a "
                    "não ser que a quebra seja um bug real introduzido por você.\n\n"
                    "❌ NUNCA comente ou pule um teste para fazer o ciclo passar.\n"
                    "❌ NUNCA use `.skip()` sem justificativa documentada no commit.\n\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "🚨 REGRA 5 — REGEX FLEXÍVEL EM TOASTS E NOTIFICAÇÕES\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "Toasts e notificações dependem de TIMING e de dados dinâmicos "
                    "(códigos auto-gerados, IDs, timestamps). Um regex muito específico "
                    "quebra de forma INTERMITENTE (flaky).\n\n"
                    "❌ ERRADO (regex estrita com código auto-gerado):\n"
                    "   `toast(page, /Produto cadastrado \\(P\\d+\\)\\./)`\n"
                    "   `toast(page, 'Correção #42 registrada (+5 sc)')`\n"
                    "   `toast(page, 'Pedido 2024-10-17-001 criado')`\n\n"
                    "✅ CORRETO (regex flexível + validação em outra camada):\n"
                    "   `toast(page, /Produto cadastrado/).toBeVisible()`\n"
                    "   Depois, valide o RESULTADO com asserções determinísticas:\n"
                    "     - `page.getByRole('heading', { name: /Fungicida/ })`\n"
                    "     - `page.getByRole('link', { name: /Fungicida/ })`\n"
                    "     - `expect(itens).toHaveCount(N)`\n\n"
                    "Motivo: o toast pode sair SEM o código se o cache ainda não "
                    "propagou do banco. O produto É criado — o resto do teste já "
                    "valida isso. Exigir o código no toast torna o teste flaky.\n\n"
                    "Ao final, rode 'npx tsc --noEmit' e "
                    "'npx playwright test --project=app-computador'."
                ),
                expected_output=(
                    "Arquivos criados/modificados + status do tsc + status do E2E. "
                    "Inclua na saída se algum .spec.ts foi atualizado e por quê."
                ),
                agent=programador,
            ),

            # ============================================================
            # 4. QA — Valida com regras estritas de qualidade de testes
            # ============================================================
            Task(
                description=(
                    "Valide rodando 'npx tsc --noEmit', 'npx vitest run --coverage' "
                    "e 'npx playwright test --project=app-computador'.\n\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "🚨 REGRA CRÍTICA — TESTES DE ESTADO VAZIO E TOASTS\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "- NUNCA dependa de texto exato em testes de UI. Textos mudam.\n"
                    "- Use asserções de COMPORTAMENTO:\n"
                    "    * `toHaveCount(0)` para listas vazias (não checar texto de empty state).\n"
                    "    * `page.on('download')` para verificar se downloads dispararam.\n"
                    "    * `toBeDisabled()` / `toBeEnabled()` para estados de botões.\n"
                    "    * `toHaveAttribute()` para estados de dados (data-situacao, data-tipo, etc).\n"
                    "- Para toasts, use regex flexível (ex: `/cadastrad[oa]/i`) ou verifique "
                    "que QUALQUER toast apareceu em `[aria-live=\"polite\"]`.\n"
                    "- Se um teste E2E falhar por causa de texto volátil, ATUALIZE o .spec.ts "
                    "para usar asserções comportamentais — NÃO mude o texto da UI só para "
                    "o teste passar.\n\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "🚨 REGRA CRÍTICA — BUG REAL vs TESTE DESATUALIZADO\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "Se o teste falhar, analise o error-context.md e responda:\n\n"
                    "  (a) O TESTE está desatualizado (texto/aba/seção mudou)?\n"
                    "      → REPROVE o ciclo e peça ao Programador para atualizar o .spec.ts.\n\n"
                    "  (b) A UI tem um BUG REAL (botão não funciona, filtro não aplica)?\n"
                    "      → REPROVE o ciclo e devolva ao Programador com mensagem clara:\n"
                    "         'BUG na UI: [descrição]. Arquivo suspeito: src/components/X.tsx'.\n"
                    "      → NÃO aceite um teste verde se ele esconde um bug real.\n\n"
                    "SINAIS DE BUG REAL (não é problema do teste):\n"
                    "  - Clicar em botão X não muda o estado visível (lista continua igual).\n"
                    "  - Validação Y não bloqueia a ação mesmo quando deveria bloquear.\n"
                    "  - Texto do estado é coerente mas o comportamento é errado.\n\n"
                    "SINAIS DE TESTE DESATUALIZADO:\n"
                    "  - Texto mudou mas o comportamento ainda é correto.\n"
                    "  - Nova aba/seção foi adicionada mas o loop não cobre ela.\n"
                    "  - `expect(await count())` sem auto-espera (timing bug).\n\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "🚨 REGRA CRÍTICA — TIMING / DEBOUNCE\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "Se o teste falhar com `Received: X` onde X é o valor ANTERIOR "
                    "esperado (ex: esperava 4+, recebeu 1), suspeite de debounce:\n"
                    "  - `fill('Carlos')` no app dispara debounce de ~300ms.\n"
                    "  - `expect(await count())` lê ANTES do debounce disparar.\n"
                    "  - Solução: usar `await expect.poll(() => count()).toBeGreaterThan(3)`\n"
                    "    ou `await expect(locator).toHaveCount(N)`.\n\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "🚨 REGRA CRÍTICA — TOASTS COM DADOS DINÂMICOS (FLAKY)\n"
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    "Se um teste de toast falhar INTERMITENTEMENTE (às vezes passa, "
                    "às vezes não), o regex provavelmente está muito específico.\n\n"
                    "Sintoma: `Locator: toast(/Produto cadastrado \\(P\\d+\\)\\./)` "
                    "→ element not found, mas o produto FOI criado (13 produtos ativos "
                    "visível, produto na lista).\n\n"
                    "Causa: o componente faz `recarregar()` antes do toast, mas o cache "
                    "pode não ter propagado — o toast sai como 'Produto cadastrado.' "
                    "SEM o código.\n\n"
                    "Solução: relaxar o regex do toast para `/Produto cadastrado/` "
                    "(sem o código), e validar o RESULTADO em outra asserção "
                    "(navegação, contagem, texto no detalhe).\n\n"
                    "Se a cobertura for menor que 80%, escreva mais testes unitários.\n\n"
                    "Atualize GUIA_DE_TESTES.md e DOCUMENTACAO_ERP.md.\n\n"
                    "FINALIZE com uma linha exata: 'VEREDITO: APROVADO' ou "
                    "'VEREDITO: REPROVADO — <motivo curto>'."
                ),
                expected_output=(
                    "Docs atualizados + veredito explícito (APROVADO ou REPROVADO) + "
                    "resumo do E2E com contagem de testes que passaram/falharam."
                ),
                agent=qa,
            ),
        ]

    # ================================================================
    # TASK DE CORREÇÃO — usada pelo loop de auto-reparo do main.py
    # ================================================================
    def tarefa_correcao(self, programador, motivo: str, log: str = ""):
        return Task(
            description=(
                f"O QA REPROVOU o ciclo. Motivo: {motivo}\n\n"
                "🚨 REGRA DE OURO (repito porque é crucial):\n"
                "Se a falha for um teste E2E (.spec.ts) quebrado:\n"
                "  1) Analise o erro. É bug REAL na UI ou teste desatualizado?\n"
                "  2) Se for bug real: corrija o componente em 'src/'.\n"
                "  3) Se for teste desatualizado (texto mudou, aba nova, etc): "
                "atualize o .spec.ts correspondente em 'e2e/app/'.\n"
                "  4) Se o teste falha porque um botão/filtro NÃO FUNCIONA: é bug real, "
                "corrija o componente — NÃO comente o teste.\n"
                "  5) Se o teste falha com `Received: X` (valor anterior ao esperado): "
                "é timing/debounce. Use `expect.poll()` ou `toHaveCount()`.\n"
                "  6) Se o teste falha por regex muito específico em toast "
                "(ex: `/Produto cadastrado \\(P\\d+\\)\\./`): é FLAKY. "
                "Relaxe o regex para `/Produto cadastrado/` e valide o resultado "
                "em outra asserção.\n\n"
                "❌ NUNCA comente ou pule um teste para fazer o ciclo passar.\n"
                "❌ NUNCA reverta uma melhoria de UI só para um teste antigo passar.\n"
                "❌ NUNCA use `expect(await locator.count()).toBeX()` — não auto-espera.\n\n"
                "Corrija APENAS o necessário usando 'escrever_arquivo' (sobrescrever). "
                "Rode 'npx tsc --noEmit' e 'npx playwright test --project=app-computador' "
                "ao final para confirmar.\n\n"
                f"=== LOG DE TESTES ===\n{log[-5000:]}"
            ),
            expected_output=(
                "Arquivos corrigidos + explicação do que era bug real vs teste "
                "desatualizado vs flaky + confirmação de que o E2E passou."
            ),
            agent=programador,
        )

    # ================================================================
    # TASK DE FECHAMENTO — registra o ciclo aprovado no histórico
    # ================================================================
    def tarefa_fechamento(self, qa, sucesso: bool, resumo: str):
        return Task(
            description=(
                f"Ciclo terminou com {'SUCESSO' if sucesso else 'FALHA'}. "
                f"Resumo: {resumo}\n\n"
                "Ações:\n"
                "  1) Use 'registrar_ciclo' para anexar ao historico.md "
                "(formato: '[YYYY-MM-DD] <título>\\n<resumo>').\n"
                "  2) Se sucesso, use 'atualizar_backlog' com acao='concluir' "
                "para marcar o item do ciclo como concluído.\n"
                "  3) Se falha, NÃO mexa no backlog — o item continua pendente.\n\n"
                "Lembre-se: o historico.md é APPEND-ONLY. Nunca apague entradas antigas."
            ),
            expected_output="Histórico atualizado + item do backlog marcado (se sucesso).",
            agent=qa,
        )