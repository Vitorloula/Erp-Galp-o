import { describe, expect, it } from 'vitest'
import { montarDadosNFCe, serieNFCe } from './nfce'
import type { Produto } from './tipos'

const produto = (extra: Partial<Produto> = {}): Produto => ({
  id: 'p1', codigo_interno: 'P1', nome: 'Glifosato', categoria_id: null, unidade: 'L',
  conteudo_embalagem: null, estoque_minimo: null, preco_venda: null, custo_ultimo: null,
  ncm: null, cfop: null, cst_csosn: null, origem: null, unidade_tributavel: null, cest: null,
  rastreio: 'lote', pesavel: false, codigo_balanca: null, controla_estoque: true,
  fabricante: null, observacao: null, ativo: true, criado_em: '', codigos: [], ...extra,
})

describe('NFC-e', () => {
  it('serieNFCe: número do caixa vira a série com 3 dígitos', () => {
    expect(serieNFCe(1)).toBe('001')
    expect(serieNFCe(42)).toBe('042')
    expect(serieNFCe(999)).toBe('999')
  })

  it('montarDadosNFCe: monta a nota com série, total e itens fiscais', () => {
    const dados = montarDadosNFCe({
      vendaId: 'v1',
      numero: '02-000123',
      caixaNumero: 2,
      total: 25.9,
      emitidaEm: '2026-10-21',
      itens: [{ produto: produto({ nome: 'Glifosato 480 SL', ncm: '38089199', cfop: '5102', cst_csosn: '102', origem: 0 }), quantidade: 1, valor: 25.9 }],
    })
    expect(dados.serie).toBe('002')
    expect(dados.total).toBe(25.9)
    expect(dados.itens[0]).toEqual({
      codigo: 'P1', nome: 'Glifosato 480 SL', ncm: '38089199', cfop: '5102', cst: '102', origem: 0,
      unidade: 'L', quantidade: 1, valor: 25.9,
    })
  })

  it('montarDadosNFCe: produto sem campos fiscais sai com null', () => {
    const dados = montarDadosNFCe({
      vendaId: 'v2', numero: '01-000001', caixaNumero: 1, total: 10, emitidaEm: '2026-10-21',
      itens: [{ produto: produto(), quantidade: 1, valor: 10 }],
    })
    expect(dados.itens[0].ncm).toBeNull()
    expect(dados.itens[0].cfop).toBeNull()
    expect(dados.itens[0].cst).toBeNull()
    expect(dados.itens[0].origem).toBeNull()
  })
})
