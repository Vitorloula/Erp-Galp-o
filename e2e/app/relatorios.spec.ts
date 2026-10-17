import ExcelJS from 'exceljs'
import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { dataDaqui, expect, test, toast, valorKpi } from '../base.ts'

const lerNumero = (t: string) => {
  const s = t.replace(/[+\s]/g, '').replace('−', '-').replace(/\./g, '').replace(',', '.')
  return s === '—' ? 0 : Number(s)
}

async function baixar(page: Page, botao: string) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: botao }).click()])
  return { nome: download.suggestedFilename(), caminho: await download.path() }
}

test.describe('Relatórios', () => {
  test('últimos 7 dias: totais e abas', async ({ page }) => {
    await page.goto('/relatorios')
    const kpis = page.locator('main .cartao:has(span.text-2xl)')
    await expect(kpis).toHaveCount(3)
    await expect(kpis.nth(0)).toContainText('Entradas')
    expect(await valorKpi(kpis.nth(0))).toBe(1)
    await expect(kpis.nth(1)).toContainText('Saídas')
    expect(await valorKpi(kpis.nth(1))).toBe(5)
    await expect(kpis.nth(2)).toContainText('Ajustes e correções')
    expect(await valorKpi(kpis.nth(2))).toBe(0)

    await page.getByRole('button', { name: 'Movimentações', exact: true }).click()
    await expect(page.locator('main table tbody tr')).toHaveCount(6)
    await page.getByRole('button', { name: 'Posição', exact: true }).click()
    await expect(page.locator('main table tbody tr')).toHaveCount(13)
    await expect(page.locator('main table tbody tr.linha-vencido')).toHaveCount(2)
    await expect(page.locator('main table tbody tr.linha-vencendo')).toHaveCount(3)
  })

  test('resumo fecha a conta: saldo inicial + entradas − saídas ± ajustes = saldo final', async ({ page }) => {
    await page.goto('/relatorios')
    await page.getByRole('button', { name: 'Mês anterior' }).click()
    await page.getByRole('button', { name: 'Últimos 30 dias' }).click()
    const linhas = page.locator('main table tbody tr')
    await expect(linhas).toHaveCount(12)
    for (const linha of await linhas.all()) {
      const [, ini, ent, sai, cor, fim] = (await linha.locator('td').allInnerTexts()).map(lerNumero)
      expect(Math.round((ini + ent + sai + cor) * 1000) / 1000, await linha.innerText()).toBe(fim)
    }
  })

  test('período personalizado e filtro por produto', async ({ page }) => {
    await page.goto('/relatorios')
    await page.getByLabel('De', { exact: true }).fill(dataDaqui(-60).iso)
    await expect(page.getByRole('button', { name: 'Personalizado' })).toHaveClass(/chip-ativo/)
    await page.getByRole('combobox', { name: 'Produto' }).selectOption({ label: 'Glifosato 480 SL' })
    await expect(page.locator('main table tbody tr')).toHaveCount(1)
    const [, ini, ent, sai, cor, fim] = (await page.locator('main table tbody tr td').allInnerTexts()).map(lerNumero)
    expect({ ini, ent, sai, cor, fim }).toEqual({ ini: 0, ent: 400, sai: -160, cor: 20, fim: 260 })
  })

  test('baixa Excel formatado com as abas e as cores de alerta', async ({ page }) => {
    await page.goto('/relatorios')
    await expect(page.locator('main table tbody tr').first()).toBeVisible()
    const { nome, caminho } = await baixar(page, 'Baixar Excel (.xlsx)')
    expect(nome).toBe(`relatorio-estoque_${dataDaqui(-6).iso}_a_${dataDaqui(0).iso}.xlsx`)
    await expect(toast(page, 'Planilha Excel gerada.')).toBeVisible()

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(readFileSync(caminho) as unknown as ArrayBuffer)
    
    // 4 abas: as 3 originais + a nova "Lista de compras" (evolução do produto)
    expect(wb.worksheets.map(w => w.name)).toEqual([
      'Resumo por produto',
      'Movimentações',
      'Posição de estoque',
      'Lista de compras',
    ])
    
    expect(wb.getWorksheet('Movimentações')!.rowCount).toBe(5 + 6)
    const posicao = wb.getWorksheet('Posição de estoque')!
    const cores: string[] = []
    posicao.eachRow((row, n) => {
      if (n > 5 && row.getCell(2).value) cores.push((row.getCell(2).fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb ?? 'sem cor')
    })
    expect(cores.filter(c => c === 'FFFDE2E2')).toHaveLength(4) // 2 vencidos + 2 zerados
    expect(cores.filter(c => c === 'FFFEF3C7')).toHaveLength(3) // vencendo
  })

  test('baixa PDF e permite escolher as seções', async ({ page }) => {
    await page.goto('/relatorios')
    await expect(page.locator('main table tbody tr').first()).toBeVisible()
    const { nome, caminho } = await baixar(page, 'Baixar PDF')
    expect(nome).toMatch(/\.pdf$/)
    const pdf = readFileSync(caminho)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(20_000)

    // Desmarca TODAS as 4 seções (o componente tem 4 hoje: resumo, movimentações, posição, compras)
    const SECOES_DO_RELATORIO = [
      'Resumo por produto',
      'Movimentações',
      'Posição de estoque (com alertas)',
      'Lista de compras (reposição)',
    ]
    for (const secao of SECOES_DO_RELATORIO) {
      await page.getByLabel(secao, { exact: true }).uncheck()
    }

    // Com nenhuma seção, o download NÃO deve disparar (asserção comportamental,
    // não dependemos do texto exato do toast de erro).
    let downloadDisparado = false
    page.on('download', () => { downloadDisparado = true })

    await page.getByRole('button', { name: 'Baixar PDF' }).click()
    await page.waitForTimeout(1000) // aguarda a UI reagir

    expect(
      downloadDisparado,
      'com nenhuma seção selecionada, nenhum PDF deve ser baixado',
    ).toBe(false)

    // E deve aparecer algum aviso de erro contendo "seção" ou "selecion" (regex flexível)
    const toastErro = page
      .locator('[aria-live="polite"]')
      .locator('div')
      .filter({ hasText: /seção|selecion/i })
    await expect(toastErro.first()).toBeVisible({ timeout: 5000 })
  })
})