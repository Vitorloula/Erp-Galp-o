import { describe, expect, it } from 'vitest'
import { criarRepositorioDemo } from './dados/demo'
import { encontrarPorCodigo, montarLinhasEstoque, resumirProduto, situacaoLote } from './estoque'
import { formatarValidade, lerNumero } from './formato'
import { lerCodigo } from './gs1'
import { intervaloRapido } from './periodos'
import type { Lote, Produto } from './tipos'

const HOJE = '2026-10-03'
const lote = (saldo: number, validade: string | null, extra: Partial<Lote> = {}): Lote => ({
  lote_id: Math.random().toString(), produto_id: 'p1', lote: '', validade, criado_em: '', saldo, ultima_movimentacao: null, ...extra,
})
const produto = (id: string, extra: Partial<Produto> = {}): Produto => ({
  id, codigo_interno: 'P' + id, codigo_barras: null, nome: 'Produto ' + id, categoria: 'defensivo', unidade: 'L',
  conteudo_embalagem: null, fabricante: null, observacao: null, ativo: true, criado_em: '', ...extra,
})

describe('formato', () => {
  it('exibe validade no padrão da empresa', () => {
    expect(formatarValidade('2026-06-30')).toBe('jun./26')
    expect(formatarValidade('2027-01-01')).toBe('jan./27')
    expect(formatarValidade(null)).toBe('—')
  })
  it('lê números em padrão brasileiro', () => {
    expect(lerNumero('1.234,5')).toBe(1234.5)
    expect(lerNumero('2,5')).toBe(2.5)
    expect(lerNumero('2.5')).toBe(2.5)
    expect(lerNumero('-3')).toBe(-3)
    expect(lerNumero('abc')).toBeNull()
    expect(lerNumero('')).toBeNull()
  })
})

describe('alertas de estoque', () => {
  it('vermelho: zerado ou vencido; amarelo: vence em até 30 dias', () => {
    expect(situacaoLote(lote(0, '2027-01-01'), HOJE)).toBe('zerado')
    expect(situacaoLote(lote(10, '2026-10-02'), HOJE)).toBe('vencido')
    expect(situacaoLote(lote(10, '2026-10-03'), HOJE)).toBe('vencendo')
    expect(situacaoLote(lote(10, '2026-11-02'), HOJE)).toBe('vencendo')
    expect(situacaoLote(lote(10, '2026-11-03'), HOJE)).toBe('ok')
    expect(situacaoLote(lote(10, null), HOJE)).toBe('ok')
  })
  it('monta uma linha por lote com saldo e uma linha vermelha para produto zerado', () => {
    const produtos = [produto('1'), produto('2'), produto('3', { ativo: false })]
    const lotes = [lote(5, '2026-12-01', { produto_id: '1' }), lote(3, '2026-10-20', { produto_id: '1' }), lote(0, '2026-01-01', { produto_id: '2' })]
    const linhas = montarLinhasEstoque(produtos, lotes, HOJE)
    expect(linhas.map(l => [l.produto.id, l.saldo, l.situacao])).toEqual([
      ['1', 3, 'vencendo'], // FEFO: o que vence primeiro aparece primeiro
      ['1', 5, 'ok'],
      ['2', 0, 'zerado'],
    ])
  })
  it('resumo do produto pega a pior situação entre os lotes com saldo', () => {
    const r = resumirProduto([lote(5, '2026-09-01'), lote(10, '2027-01-01'), lote(0, '2026-01-01')], HOJE)
    expect(r).toMatchObject({ saldo: 15, situacao: 'vencido', proximaValidade: '2026-09-01', lotesComSaldo: 2 })
  })
  it('encontra produto por EAN-13, GTIN-14 ou código interno', () => {
    const lista = [produto('1', { codigo_barras: '7891000000014', codigo_interno: 'P0001' })]
    expect(encontrarPorCodigo(lista, '7891000000014')?.id).toBe('1')
    expect(encontrarPorCodigo(lista, '07891000000014')?.id).toBe('1')
    expect(encontrarPorCodigo(lista, 'p0001')?.id).toBe('1')
    expect(encontrarPorCodigo(lista, '123')).toBeUndefined()
  })
})

describe('leitura GS1', () => {
  it('lê formato com parênteses', () => {
    expect(lerCodigo('(01)07891000000014(17)260630(10)ab12')).toEqual({ codigo: '07891000000014', validade: '2026-06-30', lote: 'ab12', gs1: true })
  })
  it('lê DataMatrix bruto com separador GS e dia 00 = fim do mês', () => {
    expect(lerCodigo(']d2010789100000001417260200' + '10LT-9\u001d21XYZ')).toEqual({ codigo: '07891000000014', validade: '2026-02-28', lote: 'LT-9', gs1: true })
  })
  it('mantém EAN-13 comum', () => {
    expect(lerCodigo('7891000000014')).toEqual({ codigo: '7891000000014', gs1: false })
  })
})

describe('períodos', () => {
  it('calcula últimos 7 dias, mês atual e mês anterior', () => {
    expect(intervaloRapido('7dias', HOJE)).toEqual({ de: '2026-09-27', ate: HOJE })
    expect(intervaloRapido('mes', HOJE)).toEqual({ de: '2026-10-01', ate: HOJE })
    expect(intervaloRapido('mesAnterior', HOJE)).toEqual({ de: '2026-09-01', ate: '2026-09-30' })
  })
})

class MemoriaStorage implements Storage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  clear() { this.m.clear() }
  getItem(k: string) { return this.m.get(k) ?? null }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  removeItem(k: string) { this.m.delete(k) }
  setItem(k: string, v: string) { this.m.set(k, v) }
}

describe('repositório de demonstração aplica as regras do banco', () => {
  it('entrada, saída, saldo insuficiente e correção', async () => {
    const repo = criarRepositorioDemo(new MemoriaStorage())
    const p = await repo.salvarProduto({ codigo_interno: '', codigo_barras: null, nome: ' Teste  X ', categoria: 'outro', unidade: 'kg', conteudo_embalagem: null, fabricante: null, observacao: null, ativo: true })
    expect(p.nome).toBe('Teste X')
    expect(p.codigo_interno).toMatch(/^P\d{4}$/)

    const idEntrada = await repo.registrarEntrada({ produtoId: p.id, lote: ' l1 ', validade: '2027-01-31', quantidade: 10 })
    await repo.registrarEntrada({ produtoId: p.id, lote: 'L1', validade: '2027-01-31', quantidade: 5 })
    let lotes = (await repo.listarLotes()).filter(l => l.produto_id === p.id)
    expect(lotes).toHaveLength(1)
    expect(lotes[0]).toMatchObject({ lote: 'L1', saldo: 15 })

    const idSaida = await repo.registrarSaida({ loteId: lotes[0].lote_id, quantidade: 4 })
    await expect(repo.registrarSaida({ loteId: lotes[0].lote_id, quantidade: 12 })).rejects.toThrow('Saldo insuficiente')
    await expect(repo.registrarCorrecao({ loteId: lotes[0].lote_id, quantidade: 1, observacao: '' })).rejects.toThrow('motivo')
    await repo.registrarCorrecao({ loteId: lotes[0].lote_id, quantidade: 1, observacao: 'Saída eram 3', referenciaId: idSaida })

    lotes = (await repo.listarLotes()).filter(l => l.produto_id === p.id)
    expect(lotes[0].saldo).toBe(12)
    const movs = await repo.listarMovimentacoes({ produtoId: p.id })
    expect(movs.map(m => m.tipo)).toEqual(['CORRECAO', 'SAIDA', 'ENTRADA', 'ENTRADA'])
    expect(movs.at(-1)!.id).toBe(idEntrada)
  })

  it('dados de exemplo têm itens vencidos, vencendo e zerados', async () => {
    const repo = criarRepositorioDemo(new MemoriaStorage())
    const linhas = montarLinhasEstoque(await repo.listarProdutos(), await repo.listarLotes())
    const sit = new Set(linhas.map(l => l.situacao))
    expect(sit).toEqual(new Set(['vencido', 'zerado', 'vencendo', 'ok']))
    expect(linhas.every(l => l.saldo >= 0)).toBe(true)
  })
})
