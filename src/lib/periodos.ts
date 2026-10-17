import { dataLocal, hojeISO, somarDias } from './formato'

export type PeriodoRapido = 'hoje' | '7dias' | '30dias' | 'mes' | 'mesAnterior' | 'personalizado'

export const PERIODOS: { valor: PeriodoRapido; nome: string }[] = [
  { valor: 'hoje', nome: 'Hoje' },
  { valor: '7dias', nome: 'Últimos 7 dias' },
  { valor: '30dias', nome: 'Últimos 30 dias' },
  { valor: 'mes', nome: 'Mês atual' },
  { valor: 'mesAnterior', nome: 'Mês anterior' },
  { valor: 'personalizado', nome: 'Personalizado' },
]

export interface Intervalo {
  /** AAAA-MM-DD (inclusive) */
  de: string
  /** AAAA-MM-DD (inclusive) */
  ate: string
}

export function intervaloRapido(p: PeriodoRapido, hoje = hojeISO()): Intervalo {
  const d = dataLocal(hoje)
  switch (p) {
    case 'hoje':
      return { de: hoje, ate: hoje }
    case '7dias':
      return { de: somarDias(hoje, -6), ate: hoje }
    case '30dias':
      return { de: somarDias(hoje, -29), ate: hoje }
    case 'mes':
      return { de: hojeISO(new Date(d.getFullYear(), d.getMonth(), 1)), ate: hoje }
    case 'mesAnterior':
      return {
        de: hojeISO(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
        ate: hojeISO(new Date(d.getFullYear(), d.getMonth(), 0)),
      }
    default:
      return { de: somarDias(hoje, -6), ate: hoje }
  }
}

/** Converte o intervalo de datas locais em instantes ISO (início do primeiro dia, fim do último). */
export function intervaloParaInstantes(i: Intervalo): { desde: string; ate: string } {
  const inicio = dataLocal(i.de)
  const fim = dataLocal(i.ate)
  fim.setHours(23, 59, 59, 999)
  return { desde: inicio.toISOString(), ate: fim.toISOString() }
}

export interface PeriodoDaUrl {
  periodo: PeriodoRapido
  intervalo: Intervalo
  /** true só quando `de` e `ate` válidos vieram da URL. */
  personalizado: boolean
}

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/

/** AAAA-MM-DD que existe no calendário (rejeita 2026-02-31, 2026-13-01, etc.). */
function diaValido(iso: string | null | undefined): iso is string {
  if (!iso || !ISO_DIA.test(iso)) return false
  const d = dataLocal(iso)
  return !Number.isNaN(d.getTime()) && hojeISO(d) === iso
}

function lerParam(query: URLSearchParams | Record<string, string | null>, chave: string): string | null {
  if (typeof (query as URLSearchParams).get === 'function') return (query as URLSearchParams).get(chave)
  const valor = (query as Record<string, string | null>)[chave]
  return typeof valor === 'string' ? valor : null
}

/**
 * Lê o período direto da URL (`?de=&ate=`), no mesmo padrão do `?filtro=` do Estoque.
 * Sem params → últimos 7 dias. Datas inválidas, invertidas ou no futuro → últimos 7 dias.
 * Nunca lança: link quebrado não derruba a tela.
 */
export function periodoDaUrl(
  query: URLSearchParams | Record<string, string | null>,
  hoje = hojeISO(),
): PeriodoDaUrl {
  const de = lerParam(query, 'de')
  const ate = lerParam(query, 'ate')
  if (diaValido(de) && diaValido(ate) && de <= ate && ate <= hoje) {
    return { periodo: 'personalizado', intervalo: { de, ate }, personalizado: true }
  }
  return { periodo: '7dias', intervalo: intervaloRapido('7dias', hoje), personalizado: false }
}

/** Chave estável do intervalo (para dependências de efeito): "2026-10-01|2026-10-15". */
export function chaveIntervalo(i: Intervalo): string {
  return `${i.de}|${i.ate}`
}

/**
 * Os filtros da tela são a própria URL (`?de=&ate=&tipo=&q=`) — recarregar ou compartilhar o link
 * mantém tudo. Trocar de filtro escreve com replace; este helper monta a próxima query.
 *
 * Valor vazio ou só com espaços remove o parâmetro: um filtro em branco não deve aparecer na URL
 * (`?q=+` vira lixo no link compartilhado). Espaços nas pontas são aparados antes de gravar.
 */
export function juntarFiltros(params: URLSearchParams, mudancas: Record<string, string | null | undefined>): URLSearchParams {
  const proximo = new URLSearchParams(params)
  for (const [chave, bruto] of Object.entries(mudancas)) {
    const valor = typeof bruto === 'string' ? bruto.trim() : bruto
    if (valor) proximo.set(chave, valor)
    else proximo.delete(chave)
  }
  return proximo
}
