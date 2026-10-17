import type { Worksheet } from 'exceljs'
import { formatarData } from '../formato'
import type { Relatorio } from '../relatorio'
import { CINZA_ARGB, VERDE_ARGB, formatoNumero, linhaGeradoEm } from './comum'

export interface Secoes {
  resumo: boolean
  movimentacoes: boolean
  posicao: boolean
  /** Lista de compras (reposição): o que comprar e quanto, por produto. */
  compras: boolean
}

const FUNDO = {
  vermelho: { fundo: 'FFFDE2E2', fonte: 'FF991B1B' },
  amarelo: { fundo: 'FFFEF3C7', fonte: 'FF92400E' },
}

/** Data AAAA-MM-DD como data real do Excel (sem desvio de fuso). */
function dataExcel(iso: string | null): Date | null {
  if (!iso) return null
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d))
}

/** Data/hora local preservada no Excel (que não tem fuso horário). */
function dataHoraExcel(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()))
}

/**
 * Cabeçalho das planilhas: empresa, título (com ou sem período) e data de geração.
 * @param linha2 texto da linha 2 (ex.: "Movimentações — período de 01/10 a 03/10").
 */
export function montarCabecalho(ws: Worksheet, linha2: string, geradoEm: Date, empresa: string, colunas: { titulo: string; largura: number }[]) {
  const n = colunas.length
  ws.columns = colunas.map(c => ({ width: c.largura }))
  ws.mergeCells(1, 1, 1, n)
  ws.mergeCells(2, 1, 2, n)
  ws.mergeCells(3, 1, 3, n)
  Object.assign(ws.getCell(1, 1), { value: empresa, font: { bold: true, size: 14, color: { argb: VERDE_ARGB } } })
  Object.assign(ws.getCell(2, 1), { value: linha2, font: { bold: true, size: 11 } })
  Object.assign(ws.getCell(3, 1), { value: linhaGeradoEm(geradoEm), font: { size: 9, color: { argb: CINZA_ARGB } } })

  const cab = ws.getRow(5)
  cab.values = colunas.map(c => c.titulo)
  cab.height = 20
  cab.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_ARGB } }
    c.alignment = { vertical: 'middle' }
  })
  ws.views = [{ state: 'frozen', ySplit: 5 }]
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: n } }
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
}

/** Cabeçalho do relatório (mesma saída de antes: título + "período de X a Y"). */
function cabecalhoRelatorio(ws: Worksheet, titulo: string, r: Relatorio, empresa: string, colunas: { titulo: string; largura: number }[]) {
  montarCabecalho(ws, `${titulo} — período de ${formatarData(r.intervalo.de)} a ${formatarData(r.intervalo.ate)}`, r.geradoEm, empresa, colunas)
}

/** Linha fina cinza embaixo de cada célula a partir da linha 5 (inclui a de legenda). */
export function bordas(ws: Worksheet) {
  ws.eachRow((row, i) => {
    if (i < 5) return
    row.eachCell({ includeEmpty: true }, c => {
      c.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } }
    })
  })
}

export async function gerarExcel(r: Relatorio, empresa: string, secoes: Secoes): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = empresa
  wb.created = r.geradoEm

  if (secoes.resumo) {
    const ws = wb.addWorksheet('Resumo por produto')
    cabecalhoRelatorio(ws, 'Resumo por produto', r, empresa, [
      { titulo: 'Código', largura: 10 },
      { titulo: 'Produto', largura: 38 },
      { titulo: 'Categoria', largura: 18 },
      { titulo: 'Unid.', largura: 7 },
      { titulo: 'Saldo inicial', largura: 13 },
      { titulo: 'Entradas', largura: 12 },
      { titulo: 'Saídas', largura: 12 },
      { titulo: 'Ajustes/correções', largura: 16 },
      { titulo: 'Saldo final', largura: 13 },
    ])
    for (const l of r.resumo) {
      const row = ws.addRow([l.codigo, l.produto, l.categoria, l.unidade])
      formatoNumero(row.getCell(5), l.saldoInicial)
      formatoNumero(row.getCell(6), l.entradas)
      formatoNumero(row.getCell(7), l.saidas)
      formatoNumero(row.getCell(8), l.ajustes, true)
      formatoNumero(row.getCell(9), l.saldoFinal)
      row.getCell(9).font = { bold: true }
      if (l.saldoFinal <= 0) row.eachCell(c => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FUNDO.vermelho.fundo } }))
    }
    bordas(ws)
  }

  if (secoes.movimentacoes) {
    const ws = wb.addWorksheet('Movimentações')
    cabecalhoRelatorio(ws, 'Movimentações', r, empresa, [
      { titulo: 'Data/hora', largura: 16 },
      { titulo: 'Nº', largura: 7 },
      { titulo: 'Tipo', largura: 10 },
      { titulo: 'Código', largura: 10 },
      { titulo: 'Produto', largura: 34 },
      { titulo: 'Lote', largura: 12 },
      { titulo: 'Validade', largura: 10 },
      { titulo: 'Quantidade', largura: 12 },
      { titulo: 'Unid.', largura: 7 },
      { titulo: 'Documento', largura: 16 },
      { titulo: 'Usuário', largura: 20 },
      { titulo: 'Observação', largura: 40 },
    ])
    for (const m of r.movimentacoes) {
      const row = ws.addRow([dataHoraExcel(m.data), m.id, m.tipoNome, m.codigo, m.produto, m.lote, dataExcel(m.validade), null, m.unidade, m.documento, m.usuario, m.observacao])
      row.getCell(1).numFmt = 'dd/mm/yyyy hh:mm'
      row.getCell(7).numFmt = '[$-416]mmm"./"yy'
      formatoNumero(row.getCell(8), m.quantidade, true)
      row.getCell(8).font = { bold: true, color: { argb: m.quantidade < 0 ? 'FFB91C1C' : 'FF047857' } }
    }
    bordas(ws)
  }

  if (secoes.posicao) {
    const ws = wb.addWorksheet('Posição de estoque')
    cabecalhoRelatorio(ws, 'Posição de estoque (atual)', r, empresa, [
      { titulo: 'Código', largura: 10 },
      { titulo: 'Produto', largura: 38 },
      { titulo: 'Categoria', largura: 18 },
      { titulo: 'Lote', largura: 12 },
      { titulo: 'Validade', largura: 10 },
      { titulo: 'Saldo', largura: 12 },
      { titulo: 'Unid.', largura: 7 },
      { titulo: 'Situação', largura: 22 },
    ])
    for (const l of r.posicao) {
      const row = ws.addRow([l.codigo, l.produto, l.categoria, l.lote, dataExcel(l.validade), null, l.unidade, l.situacaoTexto])
      row.getCell(5).numFmt = '[$-416]mmm"./"yy'
      formatoNumero(row.getCell(6), l.saldo)
      row.getCell(6).font = { bold: true }
      const cor = l.situacao === 'vencido' || l.situacao === 'zerado' ? FUNDO.vermelho : l.situacao === 'vencendo' ? FUNDO.amarelo : null
      if (cor)
        row.eachCell({ includeEmpty: true }, c => {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cor.fundo } }
          c.font = { ...c.font, color: { argb: cor.fonte } }
        })
    }
    bordas(ws)
    const leg = ws.addRow([])
    leg.getCell(1).value = 'Vermelho: vencido ou sem estoque · Amarelo: vence nos próximos 30 dias'
    leg.getCell(1).font = { italic: true, size: 9, color: { argb: CINZA_ARGB } }
  }

  if (secoes.compras) {
    const ws = wb.addWorksheet('Lista de compras')
    const n = r.compras.length
    cabecalhoRelatorio(ws, `Lista de compras (reposição) — ${n} produto${n === 1 ? '' : 's'}`, r, empresa, [
      { titulo: 'Código', largura: 10 },
      { titulo: 'Produto', largura: 38 },
      { titulo: 'Categoria', largura: 18 },
      { titulo: 'Unid.', largura: 7 },
      { titulo: 'Saldo', largura: 12 },
      { titulo: 'Mínimo', largura: 12 },
      { titulo: 'Cobertura', largura: 11 },
      { titulo: 'Comprar', largura: 13 },
    ])
    if (r.compras.length === 0) {
      const vazio = ws.addRow(['Nenhum produto no ponto de pedido.'])
      vazio.getCell(1).font = { italic: true, size: 9, color: { argb: CINZA_ARGB } }
    }
    for (const c of r.compras) {
      const row = ws.addRow([c.codigo, c.produto, c.categoria, c.unidade])
      formatoNumero(row.getCell(5), c.saldo)
      if (c.minimo !== null) formatoNumero(row.getCell(6), c.minimo)
      if (c.cobertura !== null) {
        row.getCell(7).value = c.cobertura
        row.getCell(7).numFmt = '0.00"×"'
      }
      formatoNumero(row.getCell(8), c.sugestaoCompra)
      row.getCell(8).font = { bold: true, color: { argb: VERDE_ARGB } }
    }
    bordas(ws)
    const leg = ws.addRow([])
    leg.getCell(1).value = 'Quantidade de compra já arredondada pelo conteúdo da embalagem · do mais crítico ao menos crítico'
    leg.getCell(1).font = { italic: true, size: 9, color: { argb: CINZA_ARGB } }
  }

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
