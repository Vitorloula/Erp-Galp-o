import { expect, test } from '../base.ts'

// Aceite do T-020: o chip "Repor", a tabela e a lista de compras precisam mostrar
// exatamente a mesma contagem, todos lendo a mesma fonte (T-009).
test.describe('Estoque — Repor', () => {
  test('chip, tabela e lista de compras têm a mesma contagem', async ({ page, conta, supabase }) => {
    await supabase.servidor.comoUsuario(conta.usuarioId, async tx => {
      await tx.query('update public.produtos set estoque_minimo = $1 where empresa_id = $2 and nome = $3', [
        300,
        conta.empresaId,
        'Glifosato 480 SL',
      ])
      await tx.query('update public.produtos set estoque_minimo = $1 where empresa_id = $2 and nome = $3', [
        200,
        conta.empresaId,
        'Atrazina 500 SC',
      ])
    })

    await page.goto('/estoque?filtro=abaixo')

    const chip = page.getByRole('button', { name: /Repor/ })
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await expect(chip).toHaveText(/Repor\s*2/)

    const itens = page.locator('[data-reposicao]')
    await expect(itens).toHaveCount(2)
    await expect(page.locator('[data-reposicao][data-situacao="abaixo"]')).toHaveCount(2)
    await expect(itens.filter({ hasText: 'Glifosato 480 SL' })).toHaveCount(1)
    await expect(itens.filter({ hasText: 'Atrazina 500 SC' })).toHaveCount(1)

    await page.getByRole('button', { name: 'Marcar todos' }).click()
    await expect(page.locator('[data-reposicao][data-selecionado="true"]')).toHaveCount(2)
    await expect(page.locator('[data-selecao]')).toContainText('2 de 2 selecionados')
    await expect(page.getByRole('button', { name: 'Baixar Excel' })).toBeEnabled()
  })
})
