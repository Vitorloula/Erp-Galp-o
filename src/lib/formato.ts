import type { Categoria, TipoMov, Unidade } from './tipos'

export const UNIDADES: { valor: Unidade; nome: string }[] = [
  { valor: 'L', nome: 'Litros (L)' },
  { valor: 'ml', nome: 'Mililitros (ml)' },
  { valor: 'kg', nome: 'Quilos (kg)' },
  { valor: 'g', nome: 'Gramas (g)' },
  { valor: 't', nome: 'Toneladas (t)' },
  { valor: 'sc', nome: 'Sacos (sc)' },
  { valor: 'gl', nome: 'Galões (gl)' },
  { valor: 'cx', nome: 'Caixas (cx)' },
  { valor: 'un', nome: 'Unidades (un)' },
]

export const CATEGORIAS: { valor: Categoria; nome: string }[] = [
  { valor: 'defensivo', nome: 'Defensivo agrícola' },
  { valor: 'fertilizante', nome: 'Fertilizante' },
  { valor: 'adjuvante', nome: 'Adjuvante' },
  { valor: 'semente', nome: 'Semente' },
  { valor: 'outro', nome: 'Outro' },
]

export const NOME_CATEGORIA = Object.fromEntries(CATEGORIAS.map(c => [c.valor, c.nome])) as Record<Categoria, string>

export const NOME_TIPO: Record<TipoMov, string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  CORRECAO: 'Correção',
}

const MESES = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.']

const pad = (n: number) => String(n).padStart(2, '0')

/** Data local de hoje no formato AAAA-MM-DD. */
export function hojeISO(base = new Date()): string {
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`
}

/** Converte AAAA-MM-DD em Date local (meia-noite), sem o desvio de fuso do new Date('AAAA-MM-DD'). */
export function dataLocal(iso: string): Date {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(a, m - 1, d)
}

export function somarDias(iso: string, dias: number): string {
  const d = dataLocal(iso)
  d.setDate(d.getDate() + dias)
  return hojeISO(d)
}

/** Diferença em dias inteiros entre duas datas AAAA-MM-DD (b - a). */
export function diferencaDias(a: string, b: string): number {
  return Math.round((dataLocal(b).getTime() - dataLocal(a).getTime()) / 86_400_000)
}

/** Formato amigável já usado pela empresa: "jun./26". */
export function formatarValidade(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [a, m] = iso.split('-').map(Number)
  return `${MESES[m - 1]}/${String(a).slice(-2)}`
}

/** 30/06/2026 */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—'
  if (iso.length === 10) {
    const [a, m, d] = iso.split('-')
    return `${d}/${m}/${a}`
  }
  const dt = new Date(iso)
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`
}

/** 03/10/2026 14:05 */
export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const dt = new Date(iso)
  return `${formatarData(iso)} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

export function formatarHora(iso: string): string {
  const dt = new Date(iso)
  return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

const fmtNumero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 })

export function formatarNumero(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return fmtNumero.format(n === 0 ? 0 : n)
}

export function formatarQtd(n: number, unidade: Unidade | string): string {
  return `${formatarNumero(n)} ${unidade}`
}

export function formatarDelta(n: number, unidade: Unidade | string): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatarNumero(Math.abs(n))} ${unidade}`
}

/** Quantidade de embalagens correspondente (ex.: "6 emb."), quando o produto tem conteúdo por embalagem. */
export function formatarEmbalagens(n: number, conteudo: number | null): string | null {
  if (!conteudo || n <= 0) return null
  return `${formatarNumero(Math.round((n / conteudo) * 100) / 100)} emb.`
}

/**
 * Lê números digitados no padrão brasileiro ou internacional:
 * "1.234,5" → 1234.5 · "2,5" → 2.5 · "2.5" → 2.5 · "-3" → -3.
 * Retorna null se não for um número válido.
 */
export function lerNumero(texto: string | number | null | undefined): number | null {
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null
  if (!texto) return null
  let t = texto.trim().replace(/\s/g, '')
  if (!t) return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if ((t.match(/\./g) ?? []).length > 1) t = t.replace(/\./g, '')
  if (!/^[-+]?\d*\.?\d+$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Arredonda para 3 casas (precisão do banco). */
export function arred(n: number): number {
  return Math.round(n * 1000) / 1000
}

export function normalizarBusca(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}
