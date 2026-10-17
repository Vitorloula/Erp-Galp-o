import { describe, expect, it } from 'vitest'
import {
  abaixoDoMinimo,
  calcularCobertura,
  encontrarPorCodigo,
  montarLinhasEstoque,
  montarReposicao,
  precisaRepor,
  resumirProduto,
  situacaoLote,
  situacaoReposicao,
  sugerirCompra,
} from './estoque'
import { canonizarCodigo, exibirCodigo, formatarValidade, grupoDoTipo, lerNumero } from './formato'
import { permissoes } from './permissoes'
import { lerCodigo } from './gs1'
import { intervaloRapido } from './periodos'
import type { Lote, Produto } from './tipos'

const HOJE = '2026-10-03'
const lote = (saldo: number, validade: string | null, extra: Partial<Lote> = {}): Lote => ({
  lote_id: Math.random().toString(), produto_id: 'p1', lote: '', validade, saldo, ultima_movimentacao: null, ...extra,
})
const produto = (id: string, extra: Partial<Produto> = {}): Produto => ({
  id, codigo_interno: 'P' + id, nome: 'Produto ' + id, categoria_id: null, unidade: 'L', conteudo_embalagem: null, estoque_minimo: null,
  preco_venda: null, custo_ultimo: null, rastreio: 'lote', pesavel: false, codigo_balanca: null, controla_estoque: true, fabricante: null,
  observacao: null, ativo: true, criado_em: '', codigos: [], ...extra,
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
  it('encontra produto por EAN-13, GTIN-14, código da caixa ou código interno', () => {
    const codigos = [{ codigo: '07891000000014', fator: 1 }, { codigo: '17891000000011', fator: 12 }]
    const lista = [produto('1', { codigos, codigo_interno: 'P0001' })]
    expect(encontrarPorCodigo(lista, '7891000000014')).toMatchObject({ produto: { id: '1' }, fator: 1 })
    expect(encontrarPorCodigo(lista, '07891000000014')?.produto.id).toBe('1')
    expect(encontrarPorCodigo(lista, '17891000000011')?.fator).toBe(12) // caixa com 12
    expect(encontrarPorCodigo(lista, 'p0001')?.produto.id).toBe('1')
    expect(encontrarPorCodigo(lista, '123')).toBeUndefined()
  })
  it('normaliza códigos como o banco e exibe como na embalagem', () => {
    expect(canonizarCodigo(' 7891000000014 ')).toBe('07891000000014')
    expect(canonizarCodigo('12345670')).toBe('00000012345670')
    expect(canonizarCodigo('abc-1')).toBe('ABC-1')
    expect(exibirCodigo('07891000000014')).toBe('7891000000014')
    expect(exibirCodigo('17891000000011')).toBe('17891000000011')
  })
})

describe('reposição (ponto de pedido)', () => {
  it('classifica o saldo contra o mínimo; sem mínimo nunca alerta', () => {
    expect(situacaoReposicao(3, 10)).toBe('abaixo')
    expect(situacaoReposicao(10, 10)).toBe('no_minimo')
    expect(situacaoReposicao(11, 10)).toBe('acima')
    expect(situacaoReposicao(0, null)).toBe('sem_minimo')
    expect(situacaoReposicao(0, 0)).toBe('sem_minimo')
    expect(situacaoReposicao(0, Number.NaN)).toBe('sem_minimo')
  })
  it('abaixoDoMinimo responde o alerta do painel e do filtro "Repor"', () => {
    expect(abaixoDoMinimo(3, 10)).toBe(true)
    expect(abaixoDoMinimo(10, 10)).toBe(true) // no mínimo já é hora de comprar
    expect(abaixoDoMinimo(11, 10)).toBe(false)
    expect(abaixoDoMinimo(0, null)).toBe(false) // null = sem alerta (registros antigos)
    expect(abaixoDoMinimo(0, undefined)).toBe(false)
    expect(abaixoDoMinimo(0, 0)).toBe(false)
  })
  it('sugere compra completando o mínimo, arredondando pela embalagem', () => {
    expect(sugerirCompra(3, 10, null)).toBe(7)
    expect(sugerirCompra(3, 10, 4)).toBe(8) // 7 → 2 embalagens de 4
    expect(sugerirCompra(12, 10, 4)).toBe(0)
    expect(sugerirCompra(0, null, 4)).toBe(0)
    expect(sugerirCompra(0, 10, 0)).toBe(10)
  })
  it('calcula a cobertura (saldo / mínimo)', () => {
    expect(calcularCobertura(15, 10)).toBe(1.5)
    expect(calcularCobertura(5, 10)).toBe(0.5)
    expect(calcularCobertura(5, null)).toBeNull()
  })
  it('monta a lista de reposição por produto, do mais crítico para o menos crítico', () => {
    const produtos = [
      produto('1', { estoque_minimo: 10 }),
      produto('2', { estoque_minimo: 5 }),
      produto('3'), // sem mínimo: fica fora da lista
      produto('4', { estoque_minimo: 20, controla_estoque: false }), // serviço: fora
    ]
    const lotes = [
      lote(2, null, { produto_id: '1' }),
      lote(3, null, { produto_id: '1' }),
      lote(10, null, { produto_id: '2' }),
      lote(0, null, { produto_id: '3' }),
    ]
    const itens = montarReposicao(produtos, lotes, HOJE)
    expect(itens.map(i => [i.produto.id, i.saldo, i.minimo, i.situacao])).toEqual([
      ['1', 5, 10, 'abaixo'],
    ])
    const comSemMinimo = montarReposicao(produtos, lotes, HOJE, { incluirSemMinimo: true })
    expect(comSemMinimo.map(i => i.produto.id)).toEqual(['1', '3'])
    // Produto '2' está acima do mínimo: não precisa comprar.
    expect(precisaRepor(montarReposicao([produtos[1]], lotes, HOJE))).toEqual([])
  })
  it('produto exatamente no mínimo aparece para repor', () => {
    const itens = montarReposicao([produto('1', { estoque_minimo: 4 })], [lote(4, null, { produto_id: '1' })], HOJE)
    expect(itens.map(i => i.situacao)).toEqual(['no_minimo'])
    expect(precisaRepor(itens)).toHaveLength(1)
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

describe('permissões por papel', () => {
  it('espelham as regras do banco', () => {
    expect(permissoes('dono', 'ativa')).toMatchObject({ movimentar: true, convidarGerente: true, gerenciarEquipe: true, corrigirLote: true })
    expect(permissoes('gerente', 'ativa')).toMatchObject({ movimentar: true, convidar: true, convidarGerente: false, gerenciarEquipe: false })
    expect(permissoes('estoquista', 'ativa')).toMatchObject({ movimentar: true, cadastrarProduto: true, corrigirLote: false, convidar: false })
    expect(permissoes('caixa', 'ativa')).toMatchObject({ movimentar: false, cadastrarProduto: false, convidar: false })
  })
  it('assinatura vencida deixa tudo somente leitura (carência ainda grava)', () => {
    expect(permissoes('dono', 'atrasada').movimentar).toBe(true)
    expect(permissoes('dono', 'somente_leitura')).toMatchObject({ gravavel: false, movimentar: false, convidar: false })
  })
})

describe('tipos de movimentação nos relatórios', () => {
  it('agrupa em entradas, saídas e ajustes', () => {
    expect(['ENTRADA', 'DEVOLUCAO', 'TRANSF_ENTRADA', 'CANCELAMENTO_VENDA'].map(t => grupoDoTipo(t as never))).toEqual(['entrada', 'entrada', 'entrada', 'entrada'])
    expect(['SAIDA', 'VENDA', 'TRANSF_SAIDA'].map(t => grupoDoTipo(t as never))).toEqual(['saida', 'saida', 'saida'])
    expect(['AJUSTE', 'CORRECAO'].map(t => grupoDoTipo(t as never))).toEqual(['ajuste', 'ajuste'])
  })
})
