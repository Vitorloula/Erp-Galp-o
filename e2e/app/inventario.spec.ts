import { expect, test, toast } from '../base.ts'

test.describe('Inventário por lote', () => {
  test('conta cada lote e ajusta o lote contado, não o primeiro lote do produto', async ({ page }) => {
    await page.goto('/inventario')
    await page.getByLabel('Buscar no inventário').fill('AT2401')

    const loteVencido = page.locator('[data-inventario]').filter({ hasText: 'AT2401' })
    const loteNovo = page.locator('[data-inventario]').filter({ hasText: 'AT2507' })
    await expect(loteVencido).toBeVisible()
    await expect(loteNovo).toHaveCount(0)

    await page.getByLabel('Buscar no inventário').fill('Atrazina')
    await expect(loteNovo).toBeVisible()

    await page.getByLabel('Contagem de Atrazina 500 SC lote AT2401').fill('30')
    await page.getByLabel('Contagem de Atrazina 500 SC lote AT2507').fill('120')
    await page.getByRole('button', { name: 'Revisar 2 contagem(ns)' }).click()

    await expect(loteVencido.getByText('-10', { exact: true })).toBeVisible()
    await expect(loteNovo.getByText('0', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Gerar 1 ajuste(s)' }).click()

    await expect(toast(page, '1 ajuste(s) de inventário lançado(s).')).toBeVisible()
    await expect(page.getByText(/Inventário finalizado/)).toBeVisible()

    await page.goto('/produtos')
    await page.getByLabel('Buscar').fill('Atrazina')
    await page.getByRole('link', { name: /Atrazina 500 SC/ }).click()
    await expect(page.locator('[data-lote="AT2401"]')).toContainText('30 L')
    await expect(page.locator('[data-lote="AT2507"]')).toContainText('120 L')
  })

  test('salva o rascunho da contagem por aparelho', async ({ page }) => {
    await page.goto('/inventario')
    await page.getByLabel('Buscar no inventário').fill('Mancozebe')
    const input = page.getByLabel('Contagem de Mancozebe 800 WP lote MZ0325')
    await input.fill('18')
    await page.reload()
    await page.getByLabel('Buscar no inventário').fill('Mancozebe')
    await expect(page.getByLabel('Contagem de Mancozebe 800 WP lote MZ0325')).toHaveValue('18')

    await page.getByRole('button', { name: 'Limpar contagem' }).click()
    await expect(page.getByLabel('Contagem de Mancozebe 800 WP lote MZ0325')).toHaveValue('')
  })
})
