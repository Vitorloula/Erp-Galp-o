# Regras de Testes E2E — Playwright

## Regra 1 — Atualizar .spec.ts que você quebrou
Se alterou texto, ID, aba, toast, empty state ou comportamento visível,
atualize o `.spec.ts` correspondente em `e2e/app/` para refletir a nova realidade.

## Regra 2 — Nunca use count() em asserções
❌ `expect(await locator.count()).toBe(N)`  (não auto-espera)
✅ `await expect(locator).toHaveCount(N)`
✅ `await expect.poll(() => locator.count()).toBeGreaterThan(N)`

## Regra 3 — Cobrir opções dinâmicas completamente
Se o código itera sobre lista (seções, abas, categorias) e você adicionou
um item, atualize o teste para cobrir esse item também.

## Regra 4 — Nunca reverter UI para teste passar
Se o teste falha porque a UI mudou legitimamente, atualize o teste.
Nunca comente ou `.skip()` sem justificativa no commit.

## Regra 5 — Regex flexível em toasts
❌ `toast(page, /Produto cadastrado \(P\d+\)\./)`
✅ `toast(page, /Produto cadastrado/).toBeVisible()`
   + validar o RESULTADO em outra asserção (heading, contagem, link).

## Regra 6 — Busca com debounce: esperar antes do Enter
❌ `fill('oleo'); press('Enter'); expect(item).toBeVisible()`  // Enter antes do debounce
✅ `fill('oleo'); expect(getByRole('button', { name: /Óleo/ })).toBeVisible(); click()`

## Regra 7 — Estados de empty e botões
- `toHaveCount(0)` para lista vazia (não checar texto do empty state).
- `toBeDisabled()` / `toBeEnabled()` para estados de botão.
- `page.on('download')` para verificar downloads.

## Regra 8 — Bug real × teste desatualizado
Se o teste falha, classifique ANTES de corrigir:
- Bug real (botão não faz nada, filtro não filtra) → corrija o componente.
- Teste desatualizado (texto/aba/seção mudou) → corrija o `.spec.ts`.
- Timing/debounce (`Received: X` do estado anterior) → `expect.poll()`.
- Toast flaky (regex muito específico) → relaxe o regex.
- Ambiente (npx não encontrado, WinError 2) → NÃO é bug de código, é config.