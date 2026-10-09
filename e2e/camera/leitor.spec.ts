import { EAN_CAMERA } from '../preparar'
import { expect, test, toast } from '../base'
import { cameraLigada, monitorarCamera } from './monitor'

// A câmera falsa do navegador exibe o EAN-13 da Atrazina 500 SC (gerado em e2e/preparar.ts).
// Isto testa o caminho completo: permissão → vídeo → decodificação → seleção do produto.

test.describe('Leitor de código de barras pela câmera', () => {
  test.beforeEach(({ page }) => monitorarCamera(page))

  test('lê o código, desliga a câmera e dá baixa no lote certo', async ({ page }) => {
    await page.goto('/movimentar?tipo=saida')
    await page.getByRole('button', { name: 'Escanear código de barras' }).click()

    // Ao ler, o leitor fecha sozinho e o produto aparece selecionado
    await expect(page.getByText('Atrazina 500 SC').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('dialog', { name: 'Escanear código de barras' })).toBeHidden()
    await expect(page.getByText(EAN_CAMERA).first()).toBeVisible()
    await expect(page.getByRole('radio', { name: /AT2507/ })).toBeChecked()
    await expect.poll(() => cameraLigada(page), { message: 'a câmera deve ser desligada após a leitura' }).toBe(false)

    await page.getByLabel('Quantidade a retirar').fill('20')
    await page.getByRole('button', { name: 'Dar baixa de 20 L' }).click()
    await expect(toast(page, 'Saída registrada: −20 L de Atrazina 500 SC. Saldo do lote: 100 L.')).toBeVisible()
  })

  test('atalho "Escanear baixa" do painel já abre a câmera', async ({ page }) => {
    await page.goto('/painel')
    await page.getByRole('link', { name: 'Escanear baixa' }).click()
    await expect(page.getByText('Atrazina 500 SC').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('radio', { name: /AT2507/ })).toBeChecked()
  })

  test('preenche o código de barras no cadastro de produto', async ({ page }) => {
    await page.goto('/produtos')
    await page.getByRole('button', { name: 'Novo produto' }).first().click()
    const d = page.getByRole('dialog', { name: 'Novo produto' })
    await d.getByRole('button', { name: 'Escanear com a câmera' }).click()
    await expect(d.getByLabel('Código de barras')).toHaveValue(EAN_CAMERA, { timeout: 20_000 })
    await expect(page.getByRole('dialog', { name: 'Escanear código do produto' })).toBeHidden()
    await expect.poll(() => cameraLigada(page)).toBe(false)
  })

  test('na entrada, ler o código já leva ao formulário do produto', async ({ page }) => {
    await page.goto('/movimentar?tipo=entrada')
    await page.getByRole('button', { name: 'Escanear código de barras' }).click()
    await expect(page.getByLabel('Quantidade recebida')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Atrazina 500 SC').first()).toBeVisible()
  })
})
