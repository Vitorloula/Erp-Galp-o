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
