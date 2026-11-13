import ExcelJS from 'exceljs'
import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { abrirCaixa, esperarSincronizado, ler, novaVenda, pagar } from '../apoio/pdv.ts'
import { expect, test, toast } from '../base.ts'

// T-036: custo no cadastro do produto → faturamento bruto, CMV, lucro e margem
// calculados automaticamente (Painel e Relatórios), com snapshot do custo na venda.

interface ProdutoTeste {
  nome: string
  codigo: string
  preco: string
  custo?: string
}

/** Cadastra pelo formulário real (o mesmo caminho do operador). */
async function cadastrarProduto(page: Page, produto: ProdutoTeste) {
  await page.goto('/produtos')
  await page.getByRole('button', { name: 'Novo produto' }).first().click()
  const d = page.getByRole('dialog', { name: 'Novo produto' })
  await d.getByLabel('Nome do produto *').fill(produto.nome)
  await d.getByLabel('Código interno').fill(produto.codigo)
  await d.getByLabel('Preço de venda (R$)').fill(produto.preco)
  if (produto.custo !== undefined) await d.getByLabel('Custo (R$)').fill(produto.custo)
  await d.getByRole('button', { name: 'Salvar' }).click()
  await expect(toast(page, /Produto cadastrado/)).toBeVisible()
}

/** Vende pelo caixa (quantidade × código) e espera a sincronização. */
async function vender(page: Page, codigo: string, quantidade = 1) {
  await abrirCaixa(page)
  await ler(page, `${quantidade}*${codigo}`)
  await pagar(page)
  await novaVenda(page)
  await esperarSincronizado(page)
}

const abrirResultado = async (page: Page) => {
  await page.goto('/relatorios')
  await page.getByRole('button', { name: 'Lucro', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Resultado', exact: true })).toBeVisible()
}

test.describe('Resultado (custo e lucro)', () => {
  test('Painel mostra faturamento, lucro e margem do dia', async ({ page }) => {
    await cadastrarProduto(page, { nome: 'Custo T036 Painel', codigo: 'T036P', preco: '20', custo: '10' })
    await vender(page, 'T036P', 2)

    await page.goto('/painel')
    const card = page.getByRole('region', { name: 'Resultado de hoje' })
    await expect(card).toContainText('Faturamento bruto')
    await expect(card).toContainText('R$ 40,00')
    await expect(card).toContainText('Lucro bruto')
    await expect(card).toContainText('R$ 20,00')
    await expect(card).toContainText('50%')
    await expect(card).toContainText('1 vendas finalizadas hoje')
  })

  test('Relatórios mostra os KPIs e a linha do produto no período', async ({ page }) => {
    await cadastrarProduto(page, { nome: 'Custo T036 Relatório', codigo: 'T036R', preco: '20', custo: '10' })
    await vender(page, 'T036R', 2)
    await abrirResultado(page)

    await expect(page.getByText('Faturamento bruto')).toBeVisible()
    await expect(page.getByText('CMV', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('R$ 40,00').first()).toBeVisible()
    await expect(page.getByText('R$ 20,00').first()).toBeVisible()
    await expect(page.getByText('50%').first()).toBeVisible()

    const linha = page.locator('main table tbody tr').filter({ hasText: 'Custo T036 Relatório' })
    await expect(linha).toContainText('T036R')
    await expect(linha).toContainText('R$ 40,00')
    await expect(linha).toContainText('R$ 20,00')
    await expect(linha).toContainText('50%')
  })

  test('produto sem custo aparece com aviso e fora do CMV', async ({ page }) => {
    await cadastrarProduto(page, { nome: 'Custo T036 Sem Custo', codigo: 'T036S', preco: '20' })
    await vender(page, 'T036S', 2)
    await abrirResultado(page)

    await expect(page.getByText(/Itens sem custo cadastrado neste período/)).toBeVisible()
    await expect(page.getByText(/não entram no lucro e o lucro pode ficar superestimado/)).toBeVisible()
    const linha = page.locator('main table tbody tr').filter({ hasText: 'Custo T036 Sem Custo' })
    await expect(linha).toContainText('R$ 40,00') // faturamento
    await expect(linha).toContainText('R$ 0,00') // CMV
    await expect(linha).toContainText('100%') // lucro = faturamento (sem custo)
  })

  test('venda cancelada não entra no faturamento', async ({ page }) => {
    await cadastrarProduto(page, { nome: 'Custo T036 Cancelada', codigo: 'T036X', preco: '20', custo: '10' })
    await vender(page, 'T036X')

    await page.getByRole('button', { name: /Menu do caixa/ }).click()
    await page.getByRole('dialog', { name: 'Menu do caixa' }).getByRole('button', { name: /^Últimas vendas/ }).click()
    await page.getByRole('button', { name: 'Cancelar 01-000001' }).click()
    await page.getByLabel('Motivo *').fill('Cliente desistiu')
    await page.getByRole('button', { name: 'Cancelar venda', exact: true }).click()
    await expect(toast(page, /cancelada/)).toBeVisible()
    await esperarSincronizado(page)

    await page.goto('/painel')
    const card = page.getByRole('region', { name: 'Resultado de hoje' })
    await expect(card).toContainText('R$ 0,00')
    await expect(card).toContainText('Sem vendas concluídas hoje')
  })

  test('Excel exportado inclui a seção Resultado', async ({ page }) => {
    await cadastrarProduto(page, { nome: 'Custo T036 Excel', codigo: 'T036E', preco: '20', custo: '10' })
    await vender(page, 'T036E', 2)
    await page.goto('/relatorios')
    await expect(page.locator('main table tbody tr').first()).toBeVisible()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar Excel (.xlsx)' }).click(),
    ])
    await expect(toast(page, 'Planilha Excel gerada.')).toBeVisible()

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(readFileSync(await download.path()) as unknown as ArrayBuffer)
    const ws = wb.getWorksheet('Resultado')
    expect(ws).toBeTruthy()
    const textos: string[] = []
    ws!.eachRow(row =>
      row.eachCell(cell => {
        if (typeof cell.value === 'string') textos.push(cell.value)
      }),
    )
    expect(textos).toContain('Faturamento bruto')
    expect(textos.join(' ')).toContain('Resultado — período')
    expect(textos.join(' ')).toContain('Custo T036 Excel')
    expect(textos.join(' ')).toContain('R$ 40,00')
  })
})
