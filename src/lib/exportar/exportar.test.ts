import ExcelJS from 'exceljs'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { criarRepositorioDemo } from '../dados/demo'
import { intervaloParaInstantes, intervaloRapido } from '../periodos'
import { montarRelatorio } from '../relatorio'
import { gerarExcel } from './excel'
import { gerarPdf } from './pdf'

class MemoriaStorage implements Storage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  clear() { this.m.clear() }
  getItem(k: string) { return this.m.get(k) ?? null }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  removeItem(k: string) { this.m.delete(k) }
  setItem(k: string, v: string) { this.m.set(k, v) }
}

async function relatorioDemo() {
  const repo = criarRepositorioDemo(new MemoriaStorage())
  const iv = intervaloRapido('30dias')
  return montarRelatorio(iv, await repo.listarProdutos(), await repo.listarLotes(), await repo.listarMovimentacoes({ desde: intervaloParaInstantes(iv).desde }))
}

const TODAS = { resumo: true, movimentacoes: true, posicao: true }

describe('exportação', () => {
  it('gera Excel com 3 abas, validade como data real e linhas coloridas', async () => {
    const r = await relatorioDemo()
    const blob = await gerarExcel(r, 'Empresa Teste', TODAS)
    const buf = Buffer.from(await blob.arrayBuffer())
    if (process.env.SALVAR_EXEMPLOS) writeFileSync(join(process.env.SALVAR_EXEMPLOS, 'exemplo.xlsx'), buf)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    expect(wb.worksheets.map(w => w.name)).toEqual(['Resumo por produto', 'Movimentações', 'Posição de estoque'])

    const pos = wb.getWorksheet('Posição de estoque')!
    expect(pos.getCell('A1').value).toBe('Empresa Teste')
    expect(pos.getRow(5).values).toContain('Validade')
    const linhas = r.posicao.map((l, i) => ({ l, row: pos.getRow(6 + i) }))
    const vencido = linhas.find(x => x.l.situacao === 'vencido')!
    const vencendo = linhas.find(x => x.l.situacao === 'vencendo')!
    const ok = linhas.find(x => x.l.situacao === 'ok')!
    const fundo = (row: ExcelJS.Row) => (row.getCell(2).fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb
    expect(fundo(vencido.row)).toBe('FFFDE2E2') // linha vermelha
    expect(fundo(vencendo.row)).toBe('FFFEF3C7') // linha amarela
    expect(fundo(ok.row)).toBeUndefined()
    expect(vencido.row.getCell(5).value).toBeInstanceOf(Date) // validade é data real
    expect(vencido.row.getCell(5).numFmt).toBe('[$-416]mmm"./"yy') // exibida como "set./26"

    const movs = wb.getWorksheet('Movimentações')!
    expect(movs.rowCount).toBe(5 + r.movimentacoes.length)
  })

  it('gera PDF', async () => {
    const r = await relatorioDemo()
    const blob = await gerarPdf(r, 'Empresa Teste', TODAS)
    const buf = Buffer.from(await blob.arrayBuffer())
    if (process.env.SALVAR_EXEMPLOS) writeFileSync(join(process.env.SALVAR_EXEMPLOS, 'exemplo.pdf'), buf)
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buf.length).toBeGreaterThan(5000)
  })
})
