import { describe, expect, it } from 'vitest'
import { montarResultado, type ItemResultado, type VendaResultado } from './resultado'

const venda = (id: string, total: number, status: VendaResultado['status'] = 'concluida'): VendaResultado => ({ id, total, status })
const item = (venda_id: string, dados: Partial<ItemResultado> = {}): ItemResultado => ({
  venda_id,
  produto_id: 'p1',
  descricao: 'Glifosato 480 SL',
  quantidade: 1,
  total: 0,
  custo_unitario: null,
  ...dados,
})

describe('montarResultado', () => {
  it('soma só as vendas concluídas e conta as canceladas', () => {
    const vendas = [venda('v1', 40), venda('v2', 60), venda('v3', 100, 'cancelada')]
    const itens = [
      item('v1', { quantidade: 2, total: 40, custo_unitario: 10 }),
      item('v2', { quantidade: 3, total: 60, custo_unitario: 10 }),
      item('v3', { quantidade: 1, total: 100, custo_unitario: 10 }),
    ]
    const r = montarResultado(vendas, itens)
    expect(r.faturamentoBruto).toBe(10_000) // R$ 100,00 em centavos
    expect(r.canceladas).toBe(1)
    expect(r.porProduto).toHaveLength(1)
  })

  it('calcula o CMV pela quantidade × custo gravado no item', () => {
    const r = montarResultado([venda('v1', 40)], [item('v1', { quantidade: 2, total: 40, custo_unitario: 10 })])
    expect(r.cmv).toBe(2_000) // 2 × R$ 10,00
    expect(r.lucro).toBe(2_000)
    expect(r.margem).toBe(50)
  })

  it('item sem custo fica fora do CMV e entra no aviso', () => {
    const itens = [
      item('v1', { produto_id: 'p1', quantidade: 2, total: 40, custo_unitario: null }),
      item('v1', { produto_id: 'p2', descricao: 'MAP', quantidade: 1, total: 25, custo_unitario: 5 }),
    ]
    const r = montarResultado([venda('v1', 65)], itens)
    expect(r.valorSemCusto).toBe(4_000)
    expect(r.cmv).toBe(500) // só o MAP
    expect(r.porProduto.find(p => p.produto_id === 'p1')?.cmv).toBe(0)
    expect(r.porProduto.find(p => p.produto_id === 'p2')?.cmv).toBe(500)
  })

  it('sem faturamento a margem é 0', () => {
    const r = montarResultado([], [])
    expect(r).toMatchObject({ faturamentoBruto: 0, cmv: 0, lucro: 0, margem: 0, canceladas: 0, valorSemCusto: 0, porProduto: [] })
  })

  it('dois itens do mesmo produto agregam em uma linha', () => {
    const itens = [
      item('v1', { quantidade: 2, total: 40, custo_unitario: 10 }),
      item('v1', { quantidade: 1, total: 20, custo_unitario: 10 }),
    ]
    const r = montarResultado([venda('v1', 60)], itens)
    expect(r.porProduto).toHaveLength(1)
    expect(r.porProduto[0]).toMatchObject({ faturamento: 6_000, cmv: 3_000, lucro: 3_000, margem: 50 })
  })

  it('com filtro de produto, o faturamento é o dos itens daquele produto', () => {
    const itens = [
      item('v1', { produto_id: 'p1', quantidade: 1, total: 20, custo_unitario: 10 }),
      item('v1', { produto_id: 'p2', descricao: 'MAP', quantidade: 1, total: 25, custo_unitario: 5 }),
    ]
    const r = montarResultado([venda('v1', 45)], itens, 'p1')
    expect(r.faturamentoBruto).toBe(2_000)
    expect(r.cmv).toBe(1_000)
    expect(r.porProduto.map(p => p.produto_id)).toEqual(['p1'])
  })

  it('item avulso (sem produto) aparece como "Item avulso"', () => {
    const r = montarResultado([venda('v1', 5)], [item('v1', { produto_id: null, descricao: 'Diversos', quantidade: 1, total: 5 })])
    expect(r.porProduto[0]).toMatchObject({ produto: 'Item avulso', produto_id: null })
  })
})
