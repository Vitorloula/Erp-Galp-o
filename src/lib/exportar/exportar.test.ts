import ExcelJS from 'exceljs'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hojeISO, somarDias } from '../formato'
import { intervaloRapido } from '../periodos'
import { montarRelatorio } from '../relatorio'
import type { Lote, Movimentacao, Produto, TipoMov } from '../tipos'
import { gerarExcel } from './excel'
import { gerarPdf } from './pdf'

// Estoque de exemplo com um lote em dia, um vencido e um vencendo.
const hoje = hojeISO()
const produto = (id: string, nome: string, unidade: Produto['unidade'] = 'L'): Produto => ({
  id, codigo_interno: 'P000' + id.length, nome, categoria_id: 'cat', unidade, conteudo_embalagem: null, preco_venda: null, custo_ultimo: null,
  rastreio: 'lote', fabricante: null, observacao: null, ativo: true, criado_em: '', codigos: [],
})
const produtos = [produto('a', 'Glifosato 480 SL'), produto('bb', 'Atrazina 500 SC'), produto('ccc', 'Mancozebe 800 WP', 'kg')]
const lote = (lote_id: string, produto_id: string, nome: string, validadeEmDias: number, saldo: number): Lote => ({
  lote_id, produto_id, lote: nome, validade: somarDias(hoje, validadeEmDias), saldo, ultima_movimentacao: null,
})
const lotes = [lote('la', 'a', 'GL1', 200, 240), lote('lb', 'bb', 'AT1', -5, 40), lote('lc', 'ccc', 'MZ1', 10, 75)]
let id = 0
const mov = (diasAtras: number, tipo: TipoMov, lote_id: string, produto_id: string, quantidade: number): Movimentacao => ({
  id: ++id, ocorrido_em: new Date(Date.now() - diasAtras * 86_400_000).toISOString(), registrado_em: new Date().toISOString(), tipo, loja_id: 'loja',
  lote_id, produto_id, quantidade, delta: tipo === 'SAIDA' ? -quantidade : quantidade, documento: null, observacao: null, referencia_id: null,
  origem: 'manual', usuario_id: null, usuario_nome: 'Ana',
})
const movs = [mov(20, 'ENTRADA', 'la', 'a', 300), mov(10, 'SAIDA', 'la', 'a', 60), mov(5, 'ENTRADA', 'lb', 'bb', 40), mov(3, 'ENTRADA', 'lc', 'ccc', 75)]

async function relatorioDemo() {
  return montarRelatorio(intervaloRapido('30dias'), produtos, lotes, movs, () => 'Defensivo agrícola')
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
