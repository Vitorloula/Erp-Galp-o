import ExcelJS from 'exceljs'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { calcularCobertura, sugerirCompra } from '../estoque'
import { hojeISO, somarDias } from '../formato'
import { intervaloRapido } from '../periodos'
import { montarRelatorio } from '../relatorio'
import type { Lote, Movimentacao, Produto, TipoMov } from '../tipos'
import { gerarExcel } from './excel'
import { gerarPdf } from './pdf'

// Estoque de exemplo com um lote em dia, um vencido e um vencendo.
const hoje = hojeISO()
const produto = (id: string, nome: string, unidade: Produto['unidade'] = 'L', extra: Partial<Produto> = {}): Produto => ({
  id, codigo_interno: 'P000' + id.length, nome, categoria_id: 'cat', unidade, conteudo_embalagem: null, preco_venda: null, custo_ultimo: null,
  rastreio: 'lote', pesavel: false, codigo_balanca: null, controla_estoque: true, fabricante: null, observacao: null, ativo: true, criado_em: '', codigos: [], ...extra,
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

// Estoque com reposição: 'p' abaixo do mínimo (com embalagem de 4), 'q' exatamente no mínimo,
// 'x' acima do mínimo (fora da lista) e 'z' sem mínimo (fora da lista).
const produtosRepor = [
  produto('p', 'Acefato 750 SP', 'kg', { estoque_minimo: 10, conteudo_embalagem: 4 }),
  produto('q', 'Oleo mineral', 'L', { estoque_minimo: 20 }),
  produto('x', 'Enxofre 800', 'kg', { estoque_minimo: 5 }),
  produto('z', 'Produto sem mínimo', 'L'),
]
const lotesRepor = [
  lote('lp', 'p', 'AC1', 300, 3),
  lote('lq', 'q', 'OM1', 300, 20),
  lote('lx', 'x', 'EN1', 300, 50),
  lote('lz', 'z', 'SM1', 300, 5),
]

async function relatorioReposicao() {
  return montarRelatorio(intervaloRapido('30dias'), produtosRepor, lotesRepor, [], () => 'Defensivo agrícola')
}

const TODAS = { resumo: true, movimentacoes: true, posicao: true, compras: true }
const SEM_COMPRAS = { resumo: true, movimentacoes: true, posicao: true, compras: false }
const SO_COMPRAS = { resumo: false, movimentacoes: false, posicao: false, compras: true }

async function lerWb(blob: Blob) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(await blob.arrayBuffer()) as unknown as ArrayBuffer)
  return wb
}

describe('exportação', () => {
  it('gera Excel com 4 abas, validade como data real e linhas coloridas', async () => {
    const r = await relatorioDemo()
    const blob = await gerarExcel(r, 'Empresa Teste', TODAS)
    const buf = Buffer.from(await blob.arrayBuffer())
    if (process.env.SALVAR_EXEMPLOS) writeFileSync(join(process.env.SALVAR_EXEMPLOS, 'exemplo.xlsx'), buf)

    const wb = await lerWb(blob)
    expect(wb.worksheets.map(w => w.name)).toEqual(['Resumo por produto', 'Movimentações', 'Posição de estoque', 'Lista de compras'])

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

    const movsWs = wb.getWorksheet('Movimentações')!
    expect(movsWs.rowCount).toBe(5 + r.movimentacoes.length)
  })

  it('aba "Lista de compras": só quem está no ponto de pedido, com valores de lib/estoque', async () => {
    const r = await relatorioReposicao()
    // CA-2: só abaixo/no mínimo, ordenado do mais crítico (menor cobertura) para o menos crítico.
    expect(r.compras.map(c => c.produto)).toEqual(['Acefato 750 SP', 'Oleo mineral'])
    expect(r.compras.map(c => c.situacao)).toEqual(['abaixo', 'no_minimo'])
    // CA-3: mesmas funções de lib/estoque.ts.
    expect(r.compras[0].sugestaoCompra).toBe(sugerirCompra(3, 10, 4)) // 7 → 8 (2 embalagens de 4)
    expect(r.compras[0].cobertura).toBe(calcularCobertura(3, 10))
    expect(r.compras[1].sugestaoCompra).toBe(sugerirCompra(20, 20, null)) // 0
    expect(r.compras[1].cobertura).toBe(calcularCobertura(20, 20))

    const wb = await lerWb(await gerarExcel(r, 'Empresa Teste', TODAS))
    const ws = wb.getWorksheet('Lista de compras')!
    expect(ws).toBeTruthy()
    expect(ws.getCell('A5').value).toBe('Código')
    expect(ws.getRow(5).values).toEqual([undefined, 'Código', 'Produto', 'Categoria', 'Unid.', 'Saldo', 'Mínimo', 'Cobertura', 'Comprar'])
    expect((ws.getCell('A5').fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FF047857') // cabeçalho verde
    const primeira = ws.getRow(6)
    expect(primeira.getCell(2).value).toBe('Acefato 750 SP')
    expect(primeira.getCell(5).value).toBe(3) // saldo
    expect(primeira.getCell(6).value).toBe(10) // mínimo
    expect(primeira.getCell(7).value).toBe(0.3) // cobertura 3/10
    expect(primeira.getCell(8).value).toBe(8) // comprar
    expect(ws.getRow(7).getCell(2).value).toBe('Oleo mineral')
    // 5 linhas de cabeçalho + dados + 1 linha de legenda.
    expect(ws.rowCount).toBe(5 + r.compras.length + 1)
  })

  it('sem a seção compras nenhuma aba extra é criada', async () => {
    const r = await relatorioDemo()
    const wb = await lerWb(await gerarExcel(r, 'Empresa Teste', SEM_COMPRAS))
    expect(wb.worksheets.map(w => w.name)).toEqual(['Resumo por produto', 'Movimentações', 'Posição de estoque'])
    expect(wb.getWorksheet('Lista de compras')).toBeUndefined()
  })

  it('lista de compras vazia ainda gera a aba com o aviso', async () => {
    const r = await relatorioDemo() // nenhum produto com mínimo definido
    expect(r.compras).toEqual([])
    const wb = await lerWb(await gerarExcel(r, 'Empresa Teste', SO_COMPRAS))
    expect(wb.worksheets.map(w => w.name)).toEqual(['Lista de compras'])
    const ws = wb.getWorksheet('Lista de compras')!
    expect(ws.getCell('A6').value).toBe('Nenhum produto no ponto de pedido.')
  })

  it('gera PDF', async () => {
    const r = await relatorioDemo()
    const blob = await gerarPdf(r, 'Empresa Teste', TODAS)
    const buf = Buffer.from(await blob.arrayBuffer())
    if (process.env.SALVAR_EXEMPLOS) writeFileSync(join(process.env.SALVAR_EXEMPLOS, 'exemplo.pdf'), buf)
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buf.length).toBeGreaterThan(5000)
  })

  it('PDF cresce com a seção de compras', async () => {
    const r = await relatorioReposicao()
    const comCompras = Buffer.from(await (await gerarPdf(r, 'Empresa Teste', TODAS)).arrayBuffer())
    const semCompras = Buffer.from(await (await gerarPdf(r, 'Empresa Teste', SEM_COMPRAS)).arrayBuffer())
    expect(comCompras.subarray(0, 5).toString()).toBe('%PDF-')
    // A tabela de compras (e a legenda) só existem quando a seção está marcada.
    expect(comCompras.length).toBeGreaterThan(semCompras.length)
  })
})
