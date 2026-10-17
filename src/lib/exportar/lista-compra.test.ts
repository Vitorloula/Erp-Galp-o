import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { filtrarItensCompra, montarReposicao } from '../estoque'
import { hojeISO, somarDias } from '../formato'
import type { Lote, Produto } from '../tipos'
import { gerarListaCompraExcel, gerarListaCompraPdf, nomeArquivoListaCompra } from './lista-compra'

const hoje = hojeISO()
const produto = (id: string, nome: string, extra: Partial<Produto> = {}): Produto => ({
  id,
  codigo_interno: 'P000' + id.length,
  nome,
  categoria_id: 'cat',
  unidade: 'L',
  conteudo_embalagem: null,
  estoque_minimo: null,
  preco_venda: null,
  custo_ultimo: null,
  rastreio: 'lote',
  pesavel: false,
  codigo_balanca: null,
  controla_estoque: true,
  fabricante: null,
  observacao: null,
  ativo: true,
  criado_em: '',
  codigos: [],
  ...extra,
})
const lote = (produto_id: string, saldo: number): Lote => ({
  lote_id: `lote-${produto_id}`,
  produto_id,
  lote: 'L1',
  validade: somarDias(hoje, 365),
  saldo,
  ultima_movimentacao: null,
})

// 'p' abaixo do mínimo (embalagem de 4), 'q' exatamente no mínimo, 'x' acima (fora da reposição).
const produtos = [
  produto('p', 'Acefato 750 SP', { codigo_interno: 'P0001', estoque_minimo: 10, conteudo_embalagem: 4, unidade: 'kg' }),
  produto('q', 'Oleo mineral', { codigo_interno: 'P0002', estoque_minimo: 20 }),
  produto('x', 'Enxofre 800', { codigo_interno: 'P0003', estoque_minimo: 5 }),
]
const lotes = [lote('p', 3), lote('q', 20), lote('x', 50)]
const reposicao = montarReposicao(produtos, lotes, hoje)
const nomeCategoria = () => 'Defensivo agrícola'

describe('filtrarItensCompra (lista de compras)', () => {
  it('mantém a ordem por cobertura (mais crítico primeiro) e preserva quem está no mínimo', () => {
    const itens = filtrarItensCompra(reposicao, new Set(['q', 'p']), nomeCategoria)
    // "p" (cobertura 0,3) vem antes de "q" (cobertura 1), independente da ordem do Set.
    expect(itens.map(i => i.produto.nome)).toEqual(['Acefato 750 SP', 'Oleo mineral'])
    expect(itens.map(i => i.situacao)).toEqual(['abaixo', 'no_minimo'])
    // Item no mínimo é preservado mesmo com sugestão de compra 0.
    expect(itens[1].sugestaoCompra).toBe(0)
  })

  it('não recalcula nada: copia saldo, mínimo, cobertura e sugestão de lib/estoque.ts', () => {
    const [primeiro] = filtrarItensCompra(reposicao, new Set(['p']), nomeCategoria)
    const origem = reposicao.find(i => i.produto.id === 'p')!
    expect(primeiro).toMatchObject({
      codigo: 'P0001',
      produto: { id: 'p' },
      categoria: 'Defensivo agrícola',
      unidade: 'kg',
      saldo: origem.saldo,
      minimo: origem.minimo,
      cobertura: origem.cobertura,
      sugestaoCompra: origem.sugestaoCompra,
      situacao: 'abaixo',
    })
    expect(primeiro.sugestaoCompra).toBe(8) // 7 → 2 embalagens de 4
  })

  it('Set vazio devolve lista vazia; id inexistente é ignorado', () => {
    expect(filtrarItensCompra(reposicao, new Set(), nomeCategoria)).toEqual([])
    expect(filtrarItensCompra(reposicao, new Set(['nao-existe']), nomeCategoria)).toEqual([])
    expect(filtrarItensCompra(reposicao, new Set(['nao-existe', 'q']), nomeCategoria).map(i => i.produto.id)).toEqual(['q'])
  })

  it('produto fora do ponto de pedido não entra mesmo que esteja na seleção', () => {
    const acima = montarReposicao([produto('x', 'Enxofre 800', { estoque_minimo: 5 })], [lote('x', 50)], hoje)
    expect(acima).toEqual([])
    expect(filtrarItensCompra(acima, new Set(['x']), nomeCategoria)).toEqual([])
  })
})

describe('nomeArquivoListaCompra', () => {
  it('usa o dia ISO informado (ou hoje) e a extensão pedida', () => {
    expect(nomeArquivoListaCompra('xlsx', '2026-10-03')).toBe('lista-de-compras_2026-10-03.xlsx')
    expect(nomeArquivoListaCompra('pdf', '2026-10-03')).toBe('lista-de-compras_2026-10-03.pdf')
    expect(nomeArquivoListaCompra('pdf')).toMatch(/^lista-de-compras_\d{4}-\d{2}-\d{2}\.pdf$/)
  })
})

async function lerWb(blob: Blob) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(await blob.arrayBuffer()) as unknown as ArrayBuffer)
  return wb
}

describe('exportar lista de compras', () => {
  const itens = filtrarItensCompra(reposicao, new Set(['p', 'q']), nomeCategoria)
  const geradoEm = new Date('2026-10-03T14:05:00')

  it('Excel: 1 aba "Lista de compras" com cabeçalho, valores e colunas em branco', async () => {
    const wb = await lerWb(await gerarListaCompraExcel(itens, 'Empresa Teste — Matriz', { geradoEm }))
    expect(wb.worksheets.map(w => w.name)).toEqual(['Lista de compras'])

    const ws = wb.getWorksheet('Lista de compras')!
    expect(ws.getCell('A1').value).toBe('Empresa Teste — Matriz')
    expect(String(ws.getCell('A2').value)).toContain('Lista de compras (reposição) — 2 produtos')
    expect(String(ws.getCell('A3').value)).toMatch(/^Gerado em /)
    expect(ws.getRow(5).values).toEqual([
      undefined,
      'Código',
      'Produto',
      'Categoria',
      'Unid.',
      'Saldo',
      'Mínimo',
      'Cobertura',
      'Comprar',
      'Fornecedor',
      'Observação',
    ])
    expect((ws.getCell('A5').fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FF047857')

    const primeira = ws.getRow(6)
    expect(primeira.getCell(2).value).toBe('Acefato 750 SP')
    expect(primeira.getCell(3).value).toBe('Defensivo agrícola')
    expect(primeira.getCell(5).value).toBe(3)
    expect(primeira.getCell(6).value).toBe(10)
    expect(primeira.getCell(7).value).toBe(0.3)
    expect(primeira.getCell(8).value).toBe(8)
    expect(primeira.getCell(9).value).toBeNull()
    expect(primeira.getCell(10).value).toBeNull()

    expect(ws.getRow(7).getCell(2).value).toBe('Oleo mineral')
    // 5 linhas de cabeçalho + 2 produtos + 1 legenda.
    expect(ws.rowCount).toBe(5 + itens.length + 1)
  })

  it('Excel: sem seleção a aba ainda é gerada com o aviso', async () => {
    const wb = await lerWb(await gerarListaCompraExcel([], 'Empresa Teste', { geradoEm }))
    const ws = wb.getWorksheet('Lista de compras')!
    expect(ws.getCell('A6').value).toBe('Nenhum produto selecionado para compra.')
  })

  it('PDF: assinatura %PDF- e tamanho suficiente, com e sem itens', async () => {
    const pdf = Buffer.from(await (await gerarListaCompraPdf(itens, 'Empresa Teste — Matriz', { geradoEm })).arrayBuffer())
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(5000)
    const vazio = Buffer.from(await (await gerarListaCompraPdf([], 'Empresa Teste', { geradoEm })).arrayBuffer())
    expect(vazio.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
