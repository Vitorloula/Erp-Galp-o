import { centavos } from '../pdv/venda'
import type { Venda } from './dados/vendas'

/**
 * Cálculo do resultado bruto (faturamento, CMV, lucro e margem) — puro, para a
 * tela e os testes. Todos os valores monetários saem em CENTAVOS inteiros,
 * como em `pdv/venda.ts` (`formatarReais` recebe centavos).
 */

/** Venda já restrita ao período que o helper precisa (evita acoplar ao tipo completo). */
export type VendaResultado = Pick<Venda, 'id' | 'total' | 'status'>

/** Item da venda com o custo que o trigger gravou no momento da venda. */
export interface ItemResultado {
  venda_id: string
  produto_id: string | null
  descricao: string
  quantidade: number
  total: number
  custo_unitario: number | null
}

export interface LinhaResultadoProduto {
  produto_id: string | null
  /** Código interno preenchido pela tela (o item da venda só guarda a descrição). */
  codigo: string
  produto: string
  faturamento: number
  cmv: number
  lucro: number
  /** Percentual (ex.: 50 = 50%), uma casa decimal. */
  margem: number
}

export interface Resultado {
  faturamentoBruto: number
  cmv: number
  lucro: number
  /** Percentual (ex.: 50 = 50%), uma casa decimal. */
  margem: number
  canceladas: number
  /** Total dos itens sem custo cadastrado — alimenta o aviso da tela. */
  valorSemCusto: number
  porProduto: LinhaResultadoProduto[]
}

const percentual = (lucro: number, faturamento: number) =>
  faturamento === 0 ? 0 : Math.round((lucro / faturamento) * 1000) / 10

/**
 * Monta o resultado de um período.
 * - Sem `produtoId`: faturamento é a soma de `vendas.total` das concluídas.
 * - Com `produtoId`: faturamento é a soma dos itens daquele produto (uma venda
 *   pode ter outros produtos), então o recorte bate com o filtro da tela.
 */
export function montarResultado(
  vendas: readonly VendaResultado[],
  itens: readonly ItemResultado[],
  produtoId?: string | null,
): Resultado {
  const concluidas = vendas.filter(v => v.status === 'concluida')
  const idsConcluidas = new Set(concluidas.map(v => v.id))
  const doPeriodo = itens.filter(i => idsConcluidas.has(i.venda_id) && (!produtoId || i.produto_id === produtoId))

  const faturamentoBruto = produtoId
    ? doPeriodo.reduce((soma, item) => soma + centavos(item.total), 0)
    : concluidas.reduce((soma, venda) => soma + centavos(venda.total), 0)

  let cmv = 0
  let valorSemCusto = 0
  const porProduto = new Map<string, LinhaResultadoProduto>()

  for (const item of doPeriodo) {
    const chave = item.produto_id ?? 'avulso'
    const linha = porProduto.get(chave) ?? {
      produto_id: item.produto_id,
      codigo: '',
      produto: item.produto_id ? item.descricao : 'Item avulso',
      faturamento: 0,
      cmv: 0,
      lucro: 0,
      margem: 0,
    }
    linha.faturamento += centavos(item.total)
    if (item.custo_unitario === null) {
      // Sem custo: fica fora do CMV e entra no aviso (o lucro fica superestimado).
      valorSemCusto += centavos(item.total)
    } else {
      const custo = Math.round(item.quantidade * item.custo_unitario * 100)
      linha.cmv += custo
      cmv += custo
    }
    porProduto.set(chave, linha)
  }

  const lucro = faturamentoBruto - cmv
  const linhas = [...porProduto.values()]
    .map(l => ({ ...l, lucro: l.faturamento - l.cmv, margem: percentual(l.faturamento - l.cmv, l.faturamento) }))
    .sort((a, b) => b.faturamento - a.faturamento || a.produto.localeCompare(b.produto, 'pt-BR'))

  return {
    faturamentoBruto,
    cmv,
    lucro,
    margem: percentual(lucro, faturamentoBruto),
    canceladas: vendas.filter(v => v.status === 'cancelada').length,
    valorSemCusto,
    porProduto: linhas,
  }
}
