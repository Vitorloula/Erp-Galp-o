import { describe, expect, it } from 'vitest'
import { digitoEan13, lerEtiquetaBalanca, mesmoPlu } from './balanca'
import { adicionarItem, calcularTotais, conferirPagamentos, dadosDaVenda, lerEntrada, numeroVenda, uuidv7, type ItemCarrinho } from './venda'

const item = (precoUnitario: number, quantidade = 1, extra: Partial<ItemCarrinho> = {}): ItemCarrinho => ({
  id: uuidv7(), produtoId: 'p' + precoUnitario, descricao: 'Item', unidade: 'un', codigoLido: null, loteId: null,
  quantidade, precoTabela: precoUnitario, precoUnitario, descontoItem: 0, ...extra,
})

describe('totais da venda', () => {
  it('soma itens em centavos, sem erro de arredondamento', () => {
    const t = calcularTotais([item(10, 1), item(20, 1), item(549, 3)], 0)
    expect(t).toMatchObject({ subtotal: 1677, desconto: 0, total: 1677 })
  })

  it('desconto no total é rateado entre os itens, proporcional ao valor, sem sobrar centavo', () => {
    const t = calcularTotais([item(1000), item(2000), item(3000)], 100)
    expect(t.descontos).toEqual([17, 33, 50])
    expect(t.descontos.reduce((s, v) => s + v, 0)).toBe(100)
    expect(t.total).toBe(5900)
    const dif = calcularTotais([item(333), item(333), item(334)], 10)
    expect(dif.descontos.reduce((s, v) => s + v, 0)).toBe(10)
  })

  it('desconto do item e da venda somam; nenhum item fica negativo', () => {
    const t = calcularTotais([item(1000, 1, { descontoItem: 200 }), item(500)], 2000)
    expect(t.total).toBe(0)
    expect(t.descontos).toEqual([1000, 500])
  })
})

describe('pagamento', () => {
  it('dinheiro dá troco; cartão não', () => {
    expect(conferirPagamentos(1677, [{ id: '1', forma: '01', valor: 2000 }])).toMatchObject({ troco: 323, falta: 0, erro: null })
    expect(conferirPagamentos(1677, [{ id: '1', forma: '03', valor: 2000 }]).erro).toMatch(/Só o dinheiro pode dar troco/)
    expect(conferirPagamentos(1677, [{ id: '1', forma: '17', valor: 1000 }])).toMatchObject({ falta: 677, erro: 'Falta receber R$ 6,77.' })
    expect(conferirPagamentos(1677, [{ id: '1', forma: '04', valor: 1000 }, { id: '2', forma: '01', valor: 1000 }])).toMatchObject({ troco: 323, erro: null })
  })
})

describe('entrada do leitor/teclado', () => {
  it('multiplicador antes do código', () => {
    expect(lerEntrada('7891000000014')).toEqual({ quantidade: 1, codigo: '7891000000014' })
    expect(lerEntrada('3*7891000000014')).toEqual({ quantidade: 3, codigo: '7891000000014' })
    expect(lerEntrada('1,5 x 123')).toEqual({ quantidade: 1.5, codigo: '123' })
  })
  it('mesmo produto soma na linha; pesável e item com desconto não', () => {
    const a = item(500)
    let itens = adicionarItem([], a, false)
    itens = adicionarItem(itens, { ...item(500), produtoId: a.produtoId }, false)
    expect(itens).toHaveLength(1)
    expect(itens[0].quantidade).toBe(2)
    expect(adicionarItem(itens, { ...item(500), produtoId: a.produtoId }, true)).toHaveLength(2)
  })
  it('número da venda no cupom', () => {
    expect(numeroVenda(2, 123)).toBe('02-000123')
  })
})

describe('etiqueta de balança', () => {
  const config = { prefixo: '2', digitos_codigo: 4, tipo: 'preco' as const }
  const etiqueta = (doze: string) => doze + digitoEan13(doze)
  it('lê PLU e preço total', () => {
    expect(lerEtiquetaBalanca(etiqueta('200420001234'), config)).toEqual({ plu: '0042', precoTotal: 1234 })
    expect(mesmoPlu('0042', '42')).toBe(true)
  })
  it('lê peso quando a balança imprime peso', () => {
    expect(lerEtiquetaBalanca(etiqueta('200420001234'), { ...config, tipo: 'peso' })).toEqual({ plu: '0042', peso: 1.234 })
  })
  it('ignora código comum e etiqueta com dígito errado', () => {
    expect(lerEtiquetaBalanca('7891000000014', config)).toBeNull()
    expect(lerEtiquetaBalanca('2004200012340', config)).toBeNull()
    expect(lerEtiquetaBalanca(etiqueta('200420001234'), null)).toBeNull()
  })
})

describe('evento de venda para o banco', () => {
  it('preço por kg derivado da etiqueta fecha exatamente com o valor impresso', () => {
    // R$ 12,34 de queijo a R$ 9,99/kg: 1,235 kg, preço ajustado para fechar em 12,34
    const qtd = Math.round((1234 / 999) * 1000) / 1000
    const precoUnitario = 1234 / qtd
    const d = dadosDaVenda({
      caixaId: 'c', sessaoId: 's', vendaId: 'v', numero: 7, ocorridoEm: '2026-10-10T12:00:00Z',
      itens: [item(precoUnitario, qtd, { precoTabela: 999, unidade: 'kg' })], descontoVenda: 0, pagamentos: [{ id: 'p', forma: '01', valor: 1500 }],
    })
    expect(d.itens[0]).toMatchObject({ quantidade: 1.235, total: 12.34, preco_tabela: 9.99 })
    expect(d).toMatchObject({ total: 12.34, troco: 2.66, subtotal: 12.34 })
  })

  it('itens fecham com o total e os pagamentos com o total + troco (regras do servidor)', () => {
    const d = dadosDaVenda({
      caixaId: 'c', sessaoId: 's', vendaId: 'v', numero: 1, ocorridoEm: '2026-10-10T12:00:00Z',
      itens: [item(1999, 3), item(549, 2, { descontoItem: 50 })], descontoVenda: 333, pagamentos: [{ id: 'p', forma: '01', valor: 10000 }],
    })
    const somaItens = Math.round(d.itens.reduce((s, i) => s + i.total, 0) * 100) / 100
    expect(somaItens).toBe(d.total)
    expect(Math.round((100 - d.troco) * 100) / 100).toBe(d.total)
  })
})

describe('uuidv7', () => {
  it('é um UUID versão 7 e cresce com o tempo', () => {
    const a = uuidv7(1_700_000_000_000)
    const b = uuidv7(1_700_000_000_001)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(a < b).toBe(true)
  })
})
