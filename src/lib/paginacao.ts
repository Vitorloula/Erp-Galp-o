export interface Pagina<T> {
  itens: T[]
  pagina: number
  porPagina: number
  total: number
  totalPaginas: number
  primeiro: number
  ultimo: number
}

/** Paginação pura para listas grandes (produtos, inventário, etc.). */
export function paginar<T>(itens: readonly T[], pagina: number, porPagina = 50): Pagina<T> {
  const tamanho = Math.max(1, Math.floor(porPagina))
  const total = itens.length
  const totalPaginas = Math.max(1, Math.ceil(total / tamanho))
  const atual = Math.min(Math.max(1, Math.floor(pagina) || 1), totalPaginas)
  const inicio = (atual - 1) * tamanho
  return {
    itens: itens.slice(inicio, inicio + tamanho),
    pagina: atual,
    porPagina: tamanho,
    total,
    totalPaginas,
    primeiro: total === 0 ? 0 : inicio + 1,
    ultimo: Math.min(inicio + tamanho, total),
  }
}
