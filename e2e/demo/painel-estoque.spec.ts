import { ehCelular, expect, linhasEstoque, test, valorKpi } from '../base'

// Dados de demonstração: 12 produtos; 2 lotes vencidos, 3 vencendo em 30 dias,
// 2 produtos zerados e 6 lotes em dia (13 linhas no estoque).

test.describe('Painel', () => {
  test('mostra indicadores e lista do que precisa de atenção', async ({ page }) => {
    await page.goto('/painel')
    await expect.poll(() => valorKpi(page.getByRole('button', { name: /Produtos com saldo/ }))).toBe(10)
    expect(await valorKpi(page.getByRole('button', { name: /Vencidos/ }))).toBe(2)
    expect(await valorKpi(page.getByRole('button', { name: /Vencem em 30 dias/ }))).toBe(3)
    expect(await valorKpi(page.getByRole('button', { name: /Estoque zerado/ }))).toBe(2)

    // Vermelhos primeiro (vencido, depois zerado), amarelos por ordem de vencimento
    const atencao = page.locator('[data-atencao]')
    await expect(atencao).toHaveCount(7)
    expect(await atencao.evaluateAll(els => els.map(e => e.getAttribute('data-situacao')))).toEqual([
      'vencido', 'vencido', 'zerado', 'zerado', 'vencendo', 'vencendo', 'vencendo',
    ])
    await expect(atencao.nth(4)).toContainText('Tiametoxam')
    await expect(atencao.first()).toHaveClass(/linha-vencido/)
    await expect(atencao.nth(4)).toHaveClass(/linha-vencendo/)

    await expect(page.locator('[data-mov]')).toHaveCount(8)
  })

  test('indicadores levam ao estoque já filtrado', async ({ page }) => {
    await page.goto('/painel')
    await page.getByRole('button', { name: /Vencidos/ }).click()
    await expect(page).toHaveURL(/\/estoque\?filtro=vencido/)
    await expect(linhasEstoque(page)).toHaveCount(2)

    await page.goto('/painel')
    await page.getByRole('button', { name: /Estoque zerado/ }).click()
    await expect(linhasEstoque(page)).toHaveCount(2)
    await expect(linhasEstoque(page).first()).toContainText('Sem estoque')
  })

  test('item de atenção abre o produto', async ({ page }) => {
    await page.goto('/painel')
    await page.locator('[data-atencao]').filter({ hasText: 'Mancozebe' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Mancozebe 800 WP' })).toBeVisible()
  })

  test('atalhos rápidos do celular', async ({ page }, info) => {
    test.skip(!ehCelular(info), 'atalhos aparecem só no celular')
    await page.goto('/painel')
    await page.getByRole('link', { name: 'Entrada', exact: true }).click()
    await expect(page).toHaveURL(/tipo=entrada/)
    await expect(page.getByRole('button', { name: 'Entrada', exact: true })).toHaveClass(/bg-white/)
    await page.goto('/painel')
    await page.getByRole('link', { name: 'Saída manual' }).click()
    await expect(page).toHaveURL(/tipo=saida$/)
    await page.goto('/painel')
    await page.getByRole('link', { name: 'Escanear baixa' }).click()
    await expect(page.getByRole('dialog', { name: 'Escanear código de barras' })).toBeVisible()
  })
})

test.describe('Estoque', () => {
  test('filtros por situação com contadores', async ({ page }) => {
    await page.goto('/estoque')
    const contagens = { Todos: 13, Vencidos: 2, Zerados: 2, 'Vencem em 30 dias': 3, 'Em dia': 6 }
    for (const [nome, n] of Object.entries(contagens)) {
      const chip = page.getByRole('button', { name: new RegExp('^' + nome) })
      await expect(chip).toContainText(String(n))
      await chip.click()
      await expect(linhasEstoque(page)).toHaveCount(n)
    }
    await expect(page).toHaveURL(/filtro=ok/)
  })

  test('linhas vermelhas e amarelas seguem o padrão da empresa', async ({ page }) => {
    await page.goto('/estoque')
    await expect(linhasEstoque(page)).toHaveCount(13)
    for (const linha of await linhasEstoque(page).all()) {
      const sit = await linha.getAttribute('data-situacao')
      await expect(linha).toHaveClass(new RegExp(`linha-${sit}`))
      const fundo = await linha.evaluate(e => getComputedStyle(e).backgroundColor)
      const [, , croma, matiz] = fundo.match(/oklch\(([\d.]+) ([\d.]+) ([\d.]+)/)?.map(Number) ?? []
      if (sit === 'vencido' || sit === 'zerado') {
        expect(croma, `fundo colorido (${sit}): ${fundo}`).toBeGreaterThan(0.005)
        expect(matiz, `fundo vermelho (${sit}): ${fundo}`).toBeLessThan(40)
      } else if (sit === 'vencendo') {
        expect(matiz, `fundo amarelo: ${fundo}`).toBeGreaterThan(60)
        expect(matiz, `fundo amarelo: ${fundo}`).toBeLessThan(110)
      }
    }
    // Validade no formato amigável "set./26"
    const textos = await linhasEstoque(page).filter({ hasText: 'Atrazina' }).allInnerTexts()
    expect(textos.join(' ')).toMatch(/[a-z]{3}\.\/\d{2}/)
  })

  test('busca, categoria e ordenação por validade', async ({ page }) => {
    await page.goto('/estoque')
    await page.getByLabel('Buscar').fill('glif')
    await expect(linhasEstoque(page)).toHaveCount(1)
    await expect(linhasEstoque(page)).toContainText('Glifosato 480 SL')

    await page.getByLabel('Buscar').fill('7891000000083') // código de barras do MAP
    await expect(linhasEstoque(page)).toHaveCount(1)
    await expect(linhasEstoque(page)).toContainText('MAP 11-52-00')

    await page.getByLabel('Buscar').fill('')
    await page.getByLabel('Categoria').selectOption('fertilizante')
    await expect(linhasEstoque(page)).toHaveCount(5)

    await page.getByLabel('Categoria').selectOption('')
    await page.getByLabel('Ordenar por').selectOption('validade')
    await expect(linhasEstoque(page).first()).toContainText('Atrazina 500 SC') // venceu há 9 dias
    await expect(linhasEstoque(page).nth(1)).toContainText('Fertilizante foliar Boro') // venceu há 3 dias
    await expect(linhasEstoque(page).nth(2)).toContainText('Tiametoxam')

    await page.getByLabel('Ordenar por').selectOption('situacao')
    expect(await linhasEstoque(page).evaluateAll(els => els.slice(0, 5).map(e => e.getAttribute('data-situacao')))).toEqual([
      'vencido', 'vencido', 'zerado', 'zerado', 'vencendo',
    ])
  })

  test('clicar na linha abre o produto', async ({ page }) => {
    await page.goto('/estoque')
    await linhasEstoque(page).filter({ hasText: 'Óleo mineral' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Óleo mineral adjuvante' })).toBeVisible()
  })

  test('botão Baixa já abre a saída com o lote escolhido', async ({ page }, info) => {
    test.skip(ehCelular(info), 'botão Baixa fica na tabela do computador')
    await page.goto('/estoque?filtro=vencido')
    await linhasEstoque(page).filter({ hasText: 'Atrazina' }).getByRole('link', { name: 'Baixa' }).click()
    await expect(page).toHaveURL(/tipo=saida&produto=.+&lote=/)
    await expect(page.getByRole('radio', { name: /AT2401/ })).toBeChecked()
    await expect(page.getByText(/este lote está/)).toContainText('vencido')
  })
})
