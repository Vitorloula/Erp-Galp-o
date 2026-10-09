import { expect, test } from '../base.ts'
import { cameraLigada, monitorarCamera } from './monitor'

// Câmera falsa apontada para uma "prateleira" sem código de barras.

test.describe('Leitor com a câmera aberta', () => {
  test.beforeEach(({ page }) => monitorarCamera(page))

  test('mostra o vídeo, orienta o operador e desliga a câmera ao fechar', async ({ page }, info) => {
    await page.goto('/movimentar?tipo=saida')
    await page.getByRole('button', { name: 'Escanear código de barras' }).click()
    const leitor = page.getByRole('dialog', { name: 'Escanear código de barras' })
    await expect(leitor.locator('video')).toBeVisible({ timeout: 10_000 })
    await expect(leitor.getByText('Aponte para o código de barras da embalagem')).toBeVisible()
    expect(await cameraLigada(page)).toBe(true)

    // O vídeo ocupa a área do leitor, sem faixas vazias
    const area = await leitor.locator('video').boundingBox()
    expect(area!.width).toBeGreaterThan(350)
    expect(area!.height).toBeGreaterThan(400)
    await page.screenshot({ path: info.outputPath('leitor-com-camera.png') })
    await info.attach('leitor-com-camera', { path: info.outputPath('leitor-com-camera.png'), contentType: 'image/png' })

    await leitor.getByRole('button', { name: 'Fechar leitor' }).click()
    await expect(leitor).toBeHidden()
    await expect.poll(() => cameraLigada(page), { message: 'a luz da câmera deve apagar ao fechar' }).toBe(false)
  })

  test('tecla Esc fecha o leitor; digitar o código continua funcionando', async ({ page }) => {
    await page.goto('/movimentar?tipo=saida')
    await page.getByRole('button', { name: 'Escanear código de barras' }).click()
    const leitor = page.getByRole('dialog', { name: 'Escanear código de barras' })
    await expect(leitor.locator('video')).toBeVisible({ timeout: 10_000 })
    await page.keyboard.press('Escape')
    await expect(leitor).toBeHidden()
    await expect.poll(() => cameraLigada(page)).toBe(false)

    await page.getByRole('button', { name: 'Escanear código de barras' }).click()
    await leitor.getByPlaceholder('Ou digite o código').fill('7891000000014')
    await leitor.getByRole('button', { name: 'OK' }).click()
    await expect(page.getByText('Glifosato 480 SL').first()).toBeVisible()
    await expect.poll(() => cameraLigada(page)).toBe(false)
  })

  test('abrir e fechar o leitor várias vezes não deixa câmeras presas', async ({ page }) => {
    await page.goto('/movimentar?tipo=saida')
    const leitor = page.getByRole('dialog', { name: 'Escanear código de barras' })
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: 'Escanear código de barras' }).click()
      await expect(leitor.locator('video')).toBeVisible({ timeout: 10_000 })
      await leitor.getByRole('button', { name: 'Fechar leitor' }).click()
      await expect(leitor).toBeHidden()
    }
    await expect.poll(() => cameraLigada(page)).toBe(false)
    expect(await page.locator('video').count()).toBe(0)
  })
})
