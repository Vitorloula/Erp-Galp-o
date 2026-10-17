import { describe, expect, it } from 'vitest'
import { calcularCobertura, sugerirCompra } from './estoque'
import { intervaloRapido } from './periodos'
import { montarRelatorio } from './relatorio'
import type { Lote, Movimentacao, Produto } from './tipos'

const lote = (produto_id: string, saldo: number): Lote => ({
  lote_id: produto_id + '-' + saldo,
  produto_id,
  lote: 'L1',
  validade: null,
  saldo,
  ultima_movimentacao: null,
})
const produto = (id: string, extra: Partial<Produto> = {}): Produto => ({
  id,
  codigo_interno: 'P' + id,
  nome: 'Produto ' + id,
  categoria_id: null,
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
const mov: Movimentacao = {
  id: 1,
  ocorrido_em: new Date().toISOString(),
  registrado_em: new Date().toISOString(),
  tipo: 'ENTRADA',
  loja_id: 'l1',
  lote_id: 'p1-10',
  produto_id: 'p1',
  quantidade: 10,
  delta: 10,
  documento: null,
  observacao: null,
  referencia_id: null,
  origem: 'manual',
  usuario_id: null,
  usuario_nome: null,
}

const intervalo = intervaloRapido('30dias')

describe('relatório: lista de compras (reposição)', () => {
  it('traz só os produtos no ponto de pedido, do mais crítico ao menos crítico', () => {
    const produtos = [
      produto('p1', { estoque_minimo: 20 }), // saldo 10 → cobertura 0,5 (mais crítico)
      produto('p2', { estoque_minimo: 4, conteudo_embalagem: 3 }), // saldo 1 → cobertura 0,25
      produto('p3', { estoque_minimo: 5 }), // saldo 5 → no mínimo, cobertura 1
      produto('p4', { estoque_minimo: 2 }), // saldo 10 → acima, fora
      produto('p5'), // sem mínimo, fora
    ]
    const lotes = [lote('p1', 10), lote('p2', 1), lote('p3', 5), lote('p4', 10), lote('p5', 0)]
    const r = montarRelatorio(intervalo, produtos, lotes, [], () => 'Cat')

    expect(r.compras.map(c => c.produto)).toEqual(['Produto p2', 'Produto p1', 'Produto p3'])
    expect(r.compras.map(c => c.situacao)).toEqual(['abaixo', 'abaixo', 'no_minimo'])
    // Nenhuma regra nova: os números são os mesmos de lib/estoque.ts.
    expect(r.compras.find(c => c.produto === 'Produto p2')).toMatchObject({
      saldo: 1,
      minimo: 4,
      cobertura: calcularCobertura(1, 4),
      sugestaoCompra: sugerirCompra(1, 4, 3), // 3 → 1 embalagem de 3
      unidade: 'L',
      categoria: 'Cat',
    })
  })

  it('sem produtos no ponto de pedido a lista vem vazia', () => {
    const r = montarRelatorio(intervalo, [produto('p1', { estoque_minimo: 5 })], [lote('p1', 50)], [], () => 'Cat')
    expect(r.compras).toEqual([])
  })

  it('respeita o filtro de produto', () => {
    const produtos = [produto('p1', { estoque_minimo: 20 }), produto('p2', { estoque_minimo: 20 })]
    const lotes = [lote('p1', 1), lote('p2', 2)]
    const r = montarRelatorio(intervalo, produtos, lotes, [mov], () => 'Cat', 'p1')
    expect(r.compras.map(c => c.produto)).toEqual(['Produto p1'])
  })
})
