import { expect, test } from '../base.ts'

test.describe('Serviços', () => {
  test('lista abre e mostra estado vazio ou OS', async ({ page }) => {
    await page.goto('/os')
    await expect(page.getByRole('heading', { level: 1, name: 'Ordens de serviço' })).toBeVisible()
    await expect(page.getByPlaceholder('Buscar cliente, IMEI ou número da OS')).toBeVisible()
  })

  test('agenda abre', async ({ page }) => {
    await page.goto('/os/agenda')
    await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeVisible()
  })

  test('recebimento valida campos obrigatórios', async ({ page }) => {
    await page.goto('/os/nova')
    await expect(page.getByRole('heading', { level: 1, name: 'Receber aparelho' })).toBeVisible()
    await page.getByRole('button', { name: 'Receber aparelho' }).click()
    await expect(page.getByText('Informe o nome do cliente.')).toBeVisible()
  })

  test('menu tem item Serviços', async ({ page }) => {
    if (test.info().project.name === 'app-celular') {
      await page.goto('/mais')
      await expect(page.getByRole('link', { name: 'Serviços' })).toBeVisible()
    } else {
      await page.goto('/painel')
      await expect(page.locator('aside').getByRole('link', { name: 'Serviços' })).toBeVisible()
    }
  })

  test('Painel tem card Ordens de serviço', async ({ page }) => {
    await page.goto('/painel')
    await expect(page.getByText('Ordens de serviço')).toBeVisible()
  })
})