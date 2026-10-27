import { readFile } from 'node:fs/promises'
import { expect, test, toast } from '../base.ts'

test.describe('Privacidade e LGPD', () => {
  test('dono baixa os dados da empresa em JSON', async ({ page }) => {
    await page.goto('/empresa')
    await expect(page.getByRole('heading', { name: 'Privacidade e seus dados' })).toBeVisible()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Baixar dados \(JSON\)/ }).click(),
    ])
    await expect(toast(page, 'Exportação de dados gerada.')).toBeVisible()

    const caminho = await download.path()
    expect(caminho).toBeTruthy()
    const dados = JSON.parse(await readFile(caminho!, 'utf8'))
    expect(dados.empresa_id).toBeTruthy()
    expect(dados.tabelas.produtos).toHaveLength(12)
    expect(dados.tabelas.movimentacoes.length).toBeGreaterThan(0)
    expect(dados.tabelas.perfis.length).toBeGreaterThan(0)
    expect(dados.aviso).toContain('LGPD')
  })

  test('páginas de privacidade e termos ficam disponíveis antes do login', async ({ page }) => {
    await page.goto('/privacidade.html')
    await expect(page.getByRole('heading', { name: 'Política de Privacidade' })).toBeVisible()
    await expect(page.getByText(/DOCUMENTO SEM VALOR FISCAL/)).toBeVisible()

    await page.goto('/termos.html')
    await expect(page.getByRole('heading', { name: 'Termos de Uso' })).toBeVisible()
    await expect(page.getByText(/PDV não fiscal/i)).toBeVisible()
  })
})
