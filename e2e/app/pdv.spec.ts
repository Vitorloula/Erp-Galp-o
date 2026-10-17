import { abrirCaixa, esperarSincronizado, ler, novaVenda, pagar } from '../apoio/pdv.ts'
import { expect, linhasEstoque, test, toast } from '../base.ts'

// Caixa (PDV) na empresa de exemplo: Glifosato R$ 32,90/L (EAN 7891000000014), MAP R$ 245,00/sc (7891000000083).

test.describe('Caixa (PDV)', () => {
  test('venda completa: leitor, multiplicador, troco, cupom, retaguarda e estoque', async ({ page }) => {
    await abrirCaixa(page)
    await ler(page, '7891000000014')
    await ler(page, '2*7891000000083')
    await ler(page, '7891000000014') // mesmo produto soma na linha
    await expect(page.locator('[data-item]')).toHaveCount(2)
    await expect(page.locator('[data-item="Glifosato 480 SL"]')).toContainText('2 L × R$ 32,90')
    await expect(page.locator('[data-total]')).toHaveText('R$ 555,80')

    await pagar(page, [['Dinheiro', '600']])
    const concluida = page.getByRole('dialog', { name: 'Venda concluída' })
    await expect(concluida).toContainText('Venda 01-000001 concluída')
    await expect(concluida.locator('[data-troco]')).toHaveText('R$ 44,20')
    // Cupom de 80 mm pronto para imprimir (escondido na tela)
    await expect(page.locator('[data-cupom]')).toContainText('DOCUMENTO SEM VALOR FISCAL')
    await expect(page.locator('[data-cupom]')).toContainText('MAP 11-52-00')
    await novaVenda(page)
    await esperarSincronizado(page)

    await page.goto('/vendas')
    await expect(page.locator('[data-venda="01-000001"]')).toContainText('R$ 555,80')
    await expect(page.locator('[data-por-forma]')).toContainText('Dinheiro: R$ 555,80') // 600 recebidos − 44,20 de troco
    await page.goto('/estoque')
    await page.getByLabel('Buscar').fill('Glifosato')
    await expect(linhasEstoque(page)).toContainText('258')
  })

  test('desconto na venda e pagamento em duas formas', async ({ page }) => {
    await abrirCaixa(page)
    await ler(page, '3*7891000000014') // 3 × 32,90 = 98,70
    await page.getByRole('button', { name: 'Desconto' }).click()
    const d = page.getByRole('dialog', { name: 'Desconto na venda' })
    await d.getByRole('button', { name: 'Em %' }).click()
    await d.getByLabel('Valor do desconto').fill('10')
    await d.getByRole('button', { name: 'Aplicar R$ 9,87' }).click()
    await expect(page.locator('[data-total]')).toHaveText('R$ 88,83')

    await pagar(page, [['Pix', '50'], ['Dinheiro', '']])
    await novaVenda(page)
    await esperarSincronizado(page)
    await page.goto('/vendas')
    await page.locator('[data-venda="01-000001"]').click()
    const detalhe = page.getByRole('dialog', { name: 'Venda 01-000001' })
    await expect(detalhe).toContainText('desconto R$ 9,87')
    await expect(detalhe).toContainText('Pix')
    await expect(detalhe).toContainText('R$ 38,83')
  })

  test('item sem estoque avisa, mas a venda continua', async ({ page }) => {
    await abrirCaixa(page)
    await ler(page, '7891000000052') // 2,4-D zerado
    await expect(page.getByText(/Estoque insuficiente de 2,4-D Amina 806 SL/)).toBeVisible()
    await expect(page.locator('[data-item]')).toHaveCount(1)
  })

  test('código desconhecido avisa; busca por nome (F2) acha o produto', async ({ page }) => {
    await abrirCaixa(page)
    await ler(page, '7899999999999')
    await expect(page.getByText('Código 7899999999999 não cadastrado.')).toBeVisible()
    await page.getByLabel('Código do produto').press('F2')
    
    // 🔧 CORREÇÃO: a busca tem debounce de ~300ms. NÃO usar `press('Enter')` 
    // imediatamente após `fill()`, porque os resultados ainda não carregaram.
    // Solução: esperar o botão do produto aparecer e CLICAR nele (mais determinístico).
    await page.getByLabel('Buscar no caixa').fill('oleo')
    await page.getByRole('button', { name: /Óleo mineral adjuvante/ }).click()
    
    await expect(page.locator('[data-item="Óleo mineral adjuvante"]')).toBeVisible()
  })

  test('sangria, suprimento e fechamento às cegas mostram a falta', async ({ page }) => {
    await abrirCaixa(page, '100')
    await ler(page, '7891000000014') // 32,90
    await pagar(page, [['Dinheiro', '50']]) // troco 17,10
    await novaVenda(page)

    const menu = page.getByRole('dialog', { name: 'Menu do caixa' })
    await page.getByRole('button', { name: /Menu do caixa/ }).click()
    await menu.getByRole('button', { name: /^Suprimento/ }).click()
    await page.getByLabel('Valor (R$)').fill('20')
    await page.getByRole('button', { name: 'Registrar suprimento' }).click()
    await expect(toast(page, 'Suprimento de R$ 20,00 registrado.')).toBeVisible()
    await page.getByRole('button', { name: /Menu do caixa/ }).click()
    await menu.getByRole('button', { name: /^Sangria/ }).click()
    await page.getByLabel('Valor (R$)').fill('30')
    await page.getByRole('button', { name: 'Registrar sangria' }).click()

    // Esperado em dinheiro: 100 + 50 − 17,10 + 20 − 30 = 122,90; contado 120 → falta 2,90
    await page.getByRole('button', { name: /Menu do caixa/ }).click()
    await menu.getByRole('button', { name: /^Fechar caixa/ }).click()
    const fechar = page.getByRole('dialog', { name: 'Fechar caixa' })
    await expect(fechar).not.toContainText('122,90') // às cegas: não mostra o esperado antes
    await fechar.getByLabel('Dinheiro na gaveta (R$)').fill('120')
    await fechar.getByRole('button', { name: 'Fechar caixa' }).click()
    const dinheiro = fechar.locator('[data-fechamento="Dinheiro"]')
    await expect(dinheiro).toContainText('R$ 122,90')
    await expect(dinheiro).toContainText('− R$ 2,90')
    await fechar.getByRole('button', { name: 'Concluir' }).click()
    await expect(page.getByRole('button', { name: 'Abrir caixa' })).toBeVisible()
    await esperarSincronizado(page)

    await page.goto('/vendas')
    await page.getByRole('button', { name: 'Caixas' }).click()
    await expect(page.locator('[data-sessao="Caixa 01"]')).toContainText('Faltou R$ 2,90')
  })

  test('dono cancela a venda no caixa; os itens voltam ao estoque', async ({ page }) => {
    await abrirCaixa(page)
    await ler(page, '7891000000045') // Lambda-cialotrina, saldo 12 L
    await pagar(page)
    await novaVenda(page)
    await page.getByRole('button', { name: /Menu do caixa/ }).click()
    await page.getByRole('dialog', { name: 'Menu do caixa' }).getByRole('button', { name: /^Últimas vendas/ }).click()
    await page.getByRole('button', { name: 'Cancelar 01-000001' }).click()
    await page.getByLabel('Motivo *').fill('Cliente desistiu')
    await page.getByRole('button', { name: 'Cancelar venda', exact: true }).click()
    await expect(toast(page, 'Venda 01-000001 cancelada.')).toBeVisible()
    await esperarSincronizado(page)

    await page.goto('/vendas')
    await page.locator('[data-venda="01-000001"]').click()
    await expect(page.getByRole('dialog', { name: 'Venda 01-000001' })).toContainText('Cliente desistiu')
    await page.goto('/estoque')
    await page.getByLabel('Buscar').fill('Lambda')
    await expect(linhasEstoque(page)).toContainText('12')
  })
})