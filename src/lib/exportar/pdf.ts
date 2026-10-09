import { formatarData, formatarDataHora, formatarNumero, formatarValidade } from '../formato'
import type { Relatorio } from '../relatorio'
import type { Secoes } from './excel'

type RGB = [number, number, number]
const VERDE: RGB = [4, 120, 87]
const VERMELHO: RGB = [253, 226, 226]
const AMARELO: RGB = [254, 243, 199]

// As fontes padrão do PDF não têm o sinal "−" (U+2212); usamos o hífen comum.
const num = (n: number, sinal = false) => (sinal && n > 0 ? '+' : '') + formatarNumero(n)

export async function gerarPdf(r: Relatorio, empresa: string, secoes: Secoes): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const largura = doc.internal.pageSize.getWidth()
  const altura = doc.internal.pageSize.getHeight()
  const margem = 12
  const finalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  // Cabeçalho
  doc.setFillColor(...VERDE)
  doc.rect(0, 0, largura, 4, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(15, 23, 42)
  doc.text(empresa, margem, 16)
  doc.setFontSize(11)
  doc.text('Relatório de estoque e movimentações', margem, 23)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(71, 85, 105)
  doc.text(`Período: ${formatarData(r.intervalo.de)} a ${formatarData(r.intervalo.ate)}   ·   Gerado em ${formatarDataHora(r.geradoEm.toISOString())}`, margem, 29)
  doc.text(
    `Lançamentos no período: ${r.totais.entradas} entrada(s), ${r.totais.saidas} saída(s), ${r.totais.correcoes} correção(ões)`,
    margem,
    34,
  )
  let y = 40

  const titulo = (texto: string) => {
    if (y > altura - 30) {
      doc.addPage()
      y = 16
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(15, 23, 42)
    doc.text(texto, margem, y)
    y += 3
  }

  const estilo = {
    styles: { fontSize: 7.5, cellPadding: 1.4, lineColor: [226, 232, 240] as RGB, lineWidth: 0.1 },
    headStyles: { fillColor: VERDE, textColor: 255, fontStyle: 'bold' as const },
    alternateRowStyles: { fillColor: [248, 250, 252] as RGB },
    margin: { left: margem, right: margem },
  }

  if (secoes.resumo) {
    titulo('Resumo por produto')
    autoTable(doc, {
      ...estilo,
      startY: y,
      head: [['Código', 'Produto', 'Categoria', 'Unid.', 'Saldo inicial', 'Entradas', 'Saídas', 'Correções', 'Saldo final']],
      body: r.resumo.map(l => [l.codigo, l.produto, l.categoria, l.unidade, num(l.saldoInicial), num(l.entradas), num(l.saidas), num(l.correcoes, true), num(l.saldoFinal)]),
      columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right', fontStyle: 'bold' } },
    })
    y = finalY() + 10
  }

  if (secoes.movimentacoes) {
    titulo('Movimentações do período')
    autoTable(doc, {
      ...estilo,
      startY: y,
      head: [['Data/hora', 'Nº', 'Tipo', 'Produto', 'Lote', 'Val.', 'Quantidade', 'Documento', 'Usuário', 'Observação']],
      body: r.movimentacoes.length
        ? r.movimentacoes.map(m => [
            formatarDataHora(m.data.toISOString()),
            String(m.id),
            m.tipoNome,
            m.produto,
            m.lote,
            formatarValidade(m.validade),
            `${num(m.quantidade, true)} ${m.unidade}`,
            m.documento,
            m.usuario,
            m.observacao,
          ])
        : [[{ content: 'Nenhuma movimentação no período.', colSpan: 10, styles: { halign: 'center', textColor: [100, 116, 139] } }]],
      columnStyles: { 1: { halign: 'right' }, 6: { halign: 'right', fontStyle: 'bold' }, 9: { cellWidth: 55 } },
      didParseCell: d => {
        if (d.section === 'body' && d.column.index === 6 && r.movimentacoes[d.row.index])
          d.cell.styles.textColor = r.movimentacoes[d.row.index].quantidade < 0 ? [185, 28, 28] : VERDE
      },
    })
    y = finalY() + 10
  }

  if (secoes.posicao) {
    titulo('Posição de estoque atual')
    autoTable(doc, {
      ...estilo,
      startY: y,
      head: [['Código', 'Produto', 'Categoria', 'Lote', 'Validade', 'Saldo', 'Situação']],
      body: r.posicao.map(l => [l.codigo, l.produto, l.categoria, l.lote, formatarValidade(l.validade), `${num(l.saldo)} ${l.unidade}`, l.situacaoTexto]),
      columnStyles: { 5: { halign: 'right', fontStyle: 'bold' } },
      didParseCell: d => {
        if (d.section !== 'body') return
        const s = r.posicao[d.row.index]?.situacao
        if (s === 'vencido' || s === 'zerado') {
          d.cell.styles.fillColor = VERMELHO
          d.cell.styles.textColor = [153, 27, 27]
        } else if (s === 'vencendo') {
          d.cell.styles.fillColor = AMARELO
          d.cell.styles.textColor = [146, 64, 14]
        }
      },
    })
    y = finalY() + 5
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(100, 116, 139)
    if (y < altura - 12) doc.text('Vermelho: vencido ou sem estoque  ·  Amarelo: vence nos próximos 30 dias', margem, y)
  }

  // Rodapé com numeração
  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    doc.text(empresa, margem, altura - 6)
    doc.text(`Página ${i} de ${paginas}`, largura - margem, altura - 6, { align: 'right' })
  }

  return doc.output('blob')
}
