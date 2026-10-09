import { diferencaDias, hojeISO, normalizarBusca } from './formato'
import type { Lote, Produto } from './tipos'

/** Janela do alerta amarelo (vencimento próximo). */
export const DIAS_ALERTA = 30

/**
 * vencido  → linha vermelha (validade já passou)
 * zerado   → linha vermelha (sem estoque)
 * vencendo → linha amarela (vence nos próximos 30 dias)
 * ok       → sem alerta
 */
export type Situacao = 'vencido' | 'zerado' | 'vencendo' | 'ok'

export const PRIORIDADE: Record<Situacao, number> = { vencido: 0, zerado: 1, vencendo: 2, ok: 3 }

export function diasParaVencer(validade: string | null, hoje = hojeISO()): number | null {
  return validade ? diferencaDias(hoje, validade) : null
}

export function situacaoValidade(validade: string | null, hoje = hojeISO()): Situacao {
  const dias = diasParaVencer(validade, hoje)
  if (dias === null) return 'ok'
  if (dias < 0) return 'vencido'
  if (dias <= DIAS_ALERTA) return 'vencendo'
  return 'ok'
}

export function situacaoLote(lote: Pick<Lote, 'saldo' | 'validade'>, hoje = hojeISO()): Situacao {
  if (lote.saldo <= 0) return 'zerado'
  return situacaoValidade(lote.validade, hoje)
}

export function descreverSituacao(situacao: Situacao, validade: string | null, hoje = hojeISO()): string {
  const dias = diasParaVencer(validade, hoje)
  switch (situacao) {
    case 'zerado':
      return 'Sem estoque'
    case 'vencido':
      return dias === -1 ? 'Venceu ontem' : `Vencido há ${Math.abs(dias ?? 0)} dias`
    case 'vencendo':
      return dias === 0 ? 'Vence hoje' : dias === 1 ? 'Vence amanhã' : `Vence em ${dias} dias`
    default:
      return 'Em dia'
  }
}

/** Ordena lotes por validade (FEFO: primeiro que vence, primeiro que sai). Sem validade vai por último. */
export function ordenarFefo<T extends Pick<Lote, 'validade' | 'lote'>>(lotes: T[]): T[] {
  return [...lotes].sort((a, b) => {
    if (a.validade === b.validade) return a.lote.localeCompare(b.lote)
    if (!a.validade) return 1
    if (!b.validade) return -1
    return a.validade.localeCompare(b.validade)
  })
}

/** Uma linha da tela de estoque: um lote com saldo, ou o produto zerado. */
export interface LinhaEstoque {
  chave: string
  produto: Produto
  lote: Lote | null
  saldo: number
  validade: string | null
  situacao: Situacao
}

/**
 * Monta as linhas no mesmo padrão da planilha da empresa:
 * uma linha por produto/lote com saldo; produtos sem saldo aparecem em uma linha vermelha.
 */
export function montarLinhasEstoque(produtos: Produto[], lotes: Lote[], hoje = hojeISO()): LinhaEstoque[] {
  const porProduto = agruparLotes(lotes)
  const linhas: LinhaEstoque[] = []
  for (const produto of produtos) {
    const comSaldo = ordenarFefo((porProduto.get(produto.id) ?? []).filter(l => l.saldo > 0))
    if (comSaldo.length === 0) {
      if (!produto.ativo) continue
      linhas.push({ chave: produto.id, produto, lote: null, saldo: 0, validade: null, situacao: 'zerado' })
      continue
    }
    for (const lote of comSaldo) {
      linhas.push({
        chave: lote.lote_id,
        produto,
        lote,
        saldo: lote.saldo,
        validade: lote.validade,
        situacao: situacaoLote(lote, hoje),
      })
    }
  }
  return linhas
}

export function agruparLotes(lotes: Lote[]): Map<string, Lote[]> {
  const mapa = new Map<string, Lote[]>()
  for (const l of lotes) {
    const lista = mapa.get(l.produto_id)
    if (lista) lista.push(l)
    else mapa.set(l.produto_id, [l])
  }
  return mapa
}

export interface ResumoProduto {
  saldo: number
  proximaValidade: string | null
  situacao: Situacao
  lotesComSaldo: number
}

/** Situação consolidada do produto: a pior situação entre seus lotes com saldo. */
export function resumirProduto(lotesDoProduto: Lote[], hoje = hojeISO()): ResumoProduto {
  const comSaldo = ordenarFefo(lotesDoProduto.filter(l => l.saldo > 0))
  const saldo = comSaldo.reduce((s, l) => s + l.saldo, 0)
  if (comSaldo.length === 0) return { saldo: 0, proximaValidade: null, situacao: 'zerado', lotesComSaldo: 0 }
  let situacao: Situacao = 'ok'
  for (const l of comSaldo) {
    const s = situacaoLote(l, hoje)
    if (PRIORIDADE[s] < PRIORIDADE[situacao]) situacao = s
  }
  return {
    saldo: Math.round(saldo * 1000) / 1000,
    proximaValidade: comSaldo.find(l => l.validade)?.validade ?? null,
    situacao,
    lotesComSaldo: comSaldo.length,
  }
}

/** Busca por nome, código interno, código de barras ou fabricante (sem acentos). */
export function produtoCombina(produto: Produto, termo: string): boolean {
  const t = normalizarBusca(termo)
  if (!t) return true
  return [produto.nome, produto.codigo_interno, produto.codigo_barras ?? '', produto.fabricante ?? '']
    .some(campo => normalizarBusca(campo).includes(t))
}

const soDigitos = (s: string) => /^\d+$/.test(s)

/** Compara códigos de barras tolerando zeros à esquerda (EAN-13 x GTIN-14). */
export function mesmoCodigo(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const x = a.trim().toUpperCase()
  const y = b.trim().toUpperCase()
  if (x === y) return true
  if (soDigitos(x) && soDigitos(y)) return x.replace(/^0+/, '') === y.replace(/^0+/, '')
  return false
}

export function encontrarPorCodigo(produtos: Produto[], codigo: string): Produto | undefined {
  return (
    produtos.find(p => mesmoCodigo(p.codigo_barras, codigo)) ??
    produtos.find(p => p.codigo_interno.toUpperCase() === codigo.trim().toUpperCase())
  )
}
