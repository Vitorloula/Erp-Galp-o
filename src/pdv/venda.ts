/**
 * Regras da venda no caixa, sem dependência de tela nem de rede (testáveis isoladamente).
 * Dinheiro sempre em CENTAVOS inteiros: nada de 0,1 + 0,2 = 0,30000000000000004.
 */

/** Códigos de forma de pagamento da NFC-e. */
export type FormaPagamento = '01' | '03' | '04' | '17' | '99'

export const FORMAS: { valor: FormaPagamento; nome: string; atalho: string }[] = [
  { valor: '01', nome: 'Dinheiro', atalho: 'F5' },
  { valor: '17', nome: 'Pix', atalho: 'F6' },
  { valor: '04', nome: 'Débito', atalho: 'F7' },
  { valor: '03', nome: 'Crédito', atalho: 'F8' },
  { valor: '99', nome: 'Outros', atalho: 'F9' },
]
export const NOME_FORMA = Object.fromEntries(FORMAS.map(f => [f.valor, f.nome])) as Record<FormaPagamento, string>

export interface ItemCarrinho {
  id: string
  produtoId: string
  descricao: string
  unidade: string
  codigoLido: string | null
  loteId: string | null
  quantidade: number
  /** Preço do cadastro na hora da venda (centavos). */
  precoTabela: number
  /** Preço cobrado por unidade, em centavos (pode ter fração: etiqueta de balança). */
  precoUnitario: number
  /** Desconto dado neste item (centavos). */
  descontoItem: number
}

export interface Pagamento {
  id: string
  forma: FormaPagamento
  /** Valor entregue (centavos); no dinheiro pode passar do total e gerar troco. */
  valor: number
}

export const centavos = (reais: number) => Math.round(reais * 100)
export const reais = (c: number) => Math.round(c) / 100
const arredQtd = (q: number) => Math.round(q * 1000) / 1000

/** Valor bruto do item (quantidade × preço), em centavos. */
export const brutoItem = (i: Pick<ItemCarrinho, 'quantidade' | 'precoUnitario'>) => Math.round(i.quantidade * i.precoUnitario)

export interface Totais {
  subtotal: number
  descontoItens: number
  descontoVenda: number
  desconto: number
  total: number
  /** Desconto final de cada item (do item + rateio do desconto da venda), na ordem dos itens. */
  descontos: number[]
}

/**
 * Totais da venda. O desconto dado no total é RATEADO entre os itens, proporcional ao
 * valor de cada um (exigência da NFC-e); os centavos que sobram do arredondamento vão
 * para os maiores itens, e nenhum item fica negativo.
 */
export function calcularTotais(itens: ItemCarrinho[], descontoVenda: number): Totais {
  const brutos = itens.map(brutoItem)
  const liquidos = itens.map((i, k) => Math.max(0, brutos[k] - Math.min(i.descontoItem, brutos[k])))
  const descontoItens = itens.reduce((s, i, k) => s + Math.min(i.descontoItem, brutos[k]), 0)
  const baseRateio = liquidos.reduce((s, v) => s + v, 0)
  const aRatear = Math.max(0, Math.min(descontoVenda, baseRateio))

  // Maiores restos: cada item recebe a parte inteira; os centavos que sobram vão para
  // quem tem a maior fração (empate: o item de maior valor).
  const exatos = liquidos.map(v => (baseRateio ? (aRatear * v) / baseRateio : 0))
  const rateio = exatos.map(Math.floor)
  let sobra = aRatear - rateio.reduce((s, v) => s + v, 0)
  const ordem = exatos.map((_, k) => k).sort((a, b) => exatos[b] - rateio[b] - (exatos[a] - rateio[a]) || liquidos[b] - liquidos[a])
  for (let n = 0; sobra > 0 && n < ordem.length * 2; n++) {
    const k = ordem[n % ordem.length]
    if (rateio[k] < liquidos[k]) {
      rateio[k]++
      sobra--
    }
  }
  const descontos = itens.map((_, k) => brutos[k] - liquidos[k] + rateio[k])
  const subtotal = brutos.reduce((s, v) => s + v, 0)
  const desconto = descontos.reduce((s, v) => s + v, 0)
  return { subtotal, descontoItens, descontoVenda: aRatear, desconto, total: subtotal - desconto, descontos }
}

export interface Fechamento {
  pago: number
  falta: number
  troco: number
  /** Mensagem de erro (ex.: troco em cartão) ou null se pode concluir. */
  erro: string | null
}

/** Confere os pagamentos: só o dinheiro pode passar do total (gera troco). */
export function conferirPagamentos(total: number, pagamentos: Pagamento[]): Fechamento {
  const pago = pagamentos.reduce((s, p) => s + p.valor, 0)
  const dinheiro = pagamentos.filter(p => p.forma === '01').reduce((s, p) => s + p.valor, 0)
  const falta = Math.max(0, total - pago)
  const troco = Math.max(0, pago - total)
  let erro: string | null = null
  if (falta > 0) erro = `Falta receber ${formatarReais(falta)}.`
  else if (troco > dinheiro) erro = 'Só o dinheiro pode dar troco: o valor em cartão/Pix passou do total.'
  return { pago, falta, troco, erro }
}

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const formatarReais = (c: number) => fmt.format(reais(c)).replace(/ /g, ' ')

/** Número da venda como aparece no cupom: caixa 2, venda 123 → "02-000123". */
export const numeroVenda = (caixa: number, numero: number) => `${String(caixa).padStart(2, '0')}-${String(numero).padStart(6, '0')}`

/**
 * Lê o que o operador digitou ou o leitor enviou: "3*7891000000014" vende 3 unidades;
 * "1,5*123" vende 1,5. Sem multiplicador, quantidade 1.
 */
export function lerEntrada(texto: string): { quantidade: number; codigo: string } {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*[*xX]\s*(\S.*)$/.exec(texto)
  if (!m) return { quantidade: 1, codigo: texto.trim() }
  return { quantidade: arredQtd(Number(m[1].replace(',', '.'))), codigo: m[2].trim() }
}

/** Itens iguais (mesmo produto, preço, lote e sem desconto) somam na mesma linha; pesáveis nunca. */
export function adicionarItem(itens: ItemCarrinho[], novo: ItemCarrinho, pesavel: boolean): ItemCarrinho[] {
  if (!pesavel) {
    const k = itens.findIndex(
      i => i.produtoId === novo.produtoId && i.precoUnitario === novo.precoUnitario && i.loteId === novo.loteId && !i.descontoItem && !novo.descontoItem,
    )
    if (k >= 0) return itens.map((i, n) => (n === k ? { ...i, quantidade: arredQtd(i.quantidade + novo.quantidade) } : i))
  }
  return [...itens, novo]
}

/** Gera o evento "venda" no formato que o banco espera (pdv_sincronizar, protocolo 1). */
export function dadosDaVenda(v: {
  caixaId: string
  sessaoId: string
  vendaId: string
  numero: number
  ocorridoEm: string
  itens: ItemCarrinho[]
  descontoVenda: number
  pagamentos: Pagamento[]
}) {
  const t = calcularTotais(v.itens, v.descontoVenda)
  const { troco } = conferirPagamentos(t.total, v.pagamentos)
  return {
    caixa_id: v.caixaId,
    sessao_id: v.sessaoId,
    venda_id: v.vendaId,
    numero: v.numero,
    ocorrido_em: v.ocorridoEm,
    subtotal: reais(t.subtotal),
    desconto: reais(t.desconto),
    total: reais(t.total),
    troco: reais(troco),
    itens: v.itens.map((i, k) => ({
      id: i.id,
      ordem: k + 1,
      produto_id: i.produtoId,
      descricao: i.descricao,
      codigo_lido: i.codigoLido,
      quantidade: i.quantidade,
      unidade: i.unidade,
      preco_tabela: reais(i.precoTabela),
      preco_unitario: Math.round(i.precoUnitario * 100) / 10000,
      desconto: reais(t.descontos[k]),
      total: reais(brutoItem(i) - t.descontos[k]),
      lote_id: i.loteId,
    })),
    pagamentos: v.pagamentos.map(p => ({ id: p.id, forma: p.forma, valor: reais(p.valor) })),
  }
}

/** UUID versão 7: começa pelo horário (ordem natural) e é gerado no aparelho, sem internet. */
export function uuidv7(agora = Date.now()): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  let t = agora
  for (let i = 5; i >= 0; i--) {
    b[i] = t % 256
    t = Math.floor(t / 256)
  }
  b[6] = (b[6] & 0x0f) | 0x70
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
