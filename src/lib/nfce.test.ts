import { describe, expect, it } from 'vitest'
import { emitirVenda, montarDadosNFCe, serieNFCe, type DadosNFCe, type EmissorNFCe } from './nfce'
import type { Produto } from './tipos'

const produto = (extra: Partial<Produto> = {}): Produto => ({
  id: 'p1', codigo_interno: 'P1', nome: 'Glifosato', categoria_id: null, unidade: 'L',
  conteudo_embalagem: null, estoque_minimo: null, preco_venda: null, custo_ultimo: null,
  ncm: null, cfop: null, cst_csosn: null, origem: null, unidade_tributavel: null, cest: null,
  ibs_aliquota: null, cbs_aliquota: null,
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
      itens: [{ produto: produto({ nome: 'Glifosato 480 SL', ncm: '38089199', cfop: '5102', cst_csosn: '102', origem: 0, ibs_aliquota: 0.5, cbs_aliquota: 1.2 }), quantidade: 1, valor: 25.9 }],
    })
    expect(dados.serie).toBe('002')
    expect(dados.total).toBe(25.9)
    expect(dados.itens[0]).toEqual({
      codigo: 'P1', nome: 'Glifosato 480 SL', ncm: '38089199', cfop: '5102', cst: '102', origem: 0,
      ibs: 0.5, cbs: 1.2, unidade: 'L', quantidade: 1, valor: 25.9,
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
    expect(dados.itens[0].ibs).toBeNull()
    expect(dados.itens[0].cbs).toBeNull()
  })

  it('emitirVenda: repassa o resultado do emissor com o id da venda', async () => {
    const emissor: EmissorNFCe = {
      configurado: true,
      async emitir() { return { status: 'emitida', chave: '3526...', qrcode: 'https://consulta?p=3526' } },
    }
    const dados: DadosNFCe = montarDadosNFCe({ vendaId: 'v1', numero: '01-000001', caixaNumero: 1, total: 10, emitidaEm: '2026-10-21', itens: [] })
    const r = await emitirVenda(emissor, dados)
    expect(r.vendaId).toBe('v1')
    expect(r.status).toBe('emitida')
    expect(r.chave).toBe('3526...')
    expect(r.qrcode).toBe('https://consulta?p=3526')
  })

  it('emitirVenda: emissor desligado devolve nao_configurado', async () => {
    const emissor: EmissorNFCe = {
      configurado: false,
      async emitir() { return { status: 'nao_configurado', mensagem: 'NFC-e não configurada' } },
    }
    const dados: DadosNFCe = montarDadosNFCe({ vendaId: 'v1', numero: '01-000001', caixaNumero: 1, total: 10, emitidaEm: '2026-10-21', itens: [] })
    const r = await emitirVenda(emissor, dados)
    expect(r.status).toBe('nao_configurado')
  })
})
