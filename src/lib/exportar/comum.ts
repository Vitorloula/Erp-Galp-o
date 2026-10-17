/**
 * Peças comuns dos exportadores (Excel e PDF): cores, números e cabeçalhos.
 * Mover para cá NÃO altera a saída atual de `excel.ts`/`pdf.ts` — os testes
 * de `exportar.test.ts` garantem o formato (aba "Lista de compras", A5 = 'Código',
 * fgColor FF047857, contagem de linhas).
 */
import type { Cell } from 'exceljs'
import { formatarDataHora, formatarNumero } from '../formato'

/** Verde da marca em ARGB (Excel) e RGB (jsPDF). */
export const VERDE_ARGB = 'FF047857'
export const VERDE_RGB: [number, number, number] = [4, 120, 87]
export const CINZA_ARGB = 'FF64748B'
export const CINZA_RGB: [number, number, number] = [100, 116, 139]

/** Número pt-BR com sinal opcional, como já aparece nos relatórios. */
export function textoNumero(n: number, sinal = false): string {
  return (sinal && n > 0 ? '+' : '') + formatarNumero(n)
}

/** Cobertura "1,6x" (o "x" é ASCII: a fonte padrão do PDF só cobre WinAnsi). */
export function textoCobertura(c: number | null): string {
  if (c === null) return '—'
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(c)}x`
}

/** Data/hora local legível ("03/10/2026 14:05"). */
export function textoGeradoEm(d: Date): string {
  return formatarDataHora(d.toISOString())
}

/** Linha de geração do cabeçalho das planilhas ("Gerado em …"). */
export function linhaGeradoEm(d: Date): string {
  return `Gerado em ${textoGeradoEm(d)}`
}

/** Escreve um número na célula com o formato do Excel (inteiro ou até 3 casas). */
export function formatoNumero(cell: Cell, valor: number, sinal = false) {
  cell.value = valor
  const base = Number.isInteger(valor) ? '#,##0' : '#,##0.0##'
  cell.numFmt = sinal ? `+${base};-${base};0` : base
}

/** Estilo base do autoTable do jsPDF (fonte, cor de linha, cabeçalho verde). */
export const ESTILO_TABELA_PDF = {
  styles: { fontSize: 7.5, cellPadding: 1.4, lineColor: [226, 232, 240] as [number, number, number], lineWidth: 0.1 },
  headStyles: { fillColor: VERDE_RGB, textColor: 255, fontStyle: 'bold' as const },
  alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
}
