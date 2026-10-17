import { formatarData, formatarDataHora, formatarValidade } from '../formato'
import type { Relatorio } from '../relatorio'
import { CINZA_RGB, ESTILO_TABELA_PDF, VERDE_RGB, textoCobertura, textoGeradoEm, textoNumero } from './comum'
import type { Secoes } from './excel'

/**
 * Peças reaproveitadas pela lista de compras avulsa (`lista-compra.ts`):
 * monta o documento com margens, rodapé numerado e as funções `titulo`/`legenda`.
 */
export const ESTILO = ESTILO_TABELA_PDF
export const VERDE = VERDE_RGB
export const CINZA = CINZA_RGB

/** Mesma saída de antes (`pdf.ts`): `num` e `cobertura` locais agora vêm de `comum.ts`. */
const num = textoNumero
const cobertura = textoCobertura

export async function gerarPdf(r: Relatorio, empresa: string, secoes: Secoes): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const largura = doc.internal.pageSize.getWidth()
  const altura = doc.internal.pageSize.getHeight()
  const margem = 12
  const finalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  const estilo = { ...ESTILO, margin: { left: margem, right: margem } }

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
  doc.text(`Período: ${formatarData(r.intervalo.de)} a ${formatarData(r.intervalo.ate)}   ·   Gerado em ${textoGeradoEm(r.geradoEm)}`, margem, 29)
  const lancamentos = `Lançamentos no período: ${r.totais.entradas} entrada(s), ${r.totais.saidas} saída(s), ${r.totais.ajustes} ajuste(s)/correção(ões)`
  doc.text(secoes.compras ? `${lancamentos}   ·   Lista de compras: ${r.compras.length} produto(s)` : lancamentos, margem, 34)
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

  const legenda = (texto: string) => {
    if (y > altura - 12) return
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...CINZA)
    doc.text(texto, margem, y)
  }

  if (secoes.resumo) {
    titulo('Resumo por produto')
    autoTable(doc, {
      ...estilo,
      startY: y,
      head: [['Código', 'Produto', 'Categoria', 'Unid.', 'Saldo inicial', 'Entradas', 'Saídas', 'Ajustes', 'Saldo final']],
      body: r.resumo.map(l => [l.codigo, l.produto, l.categoria, l.unidade, num(l.saldoInicial), num(l.entradas), num(l.saidas), num(l.ajustes, true), num(l.saldoFinal)]),
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
        : [[{ content: 'Nenhuma movimentação no período.', colSpan: 10, styles: { halign: 'center', textColor: CINZA } }]],
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
          d.cell.styles.fillColor = [253, 226, 226]
          d.cell.styles.textColor = [153, 27, 27]
        } else if (s === 'vencendo') {
          d.cell.styles.fillColor = [254, 243, 199]
          d.cell.styles.textColor = [146, 64, 14]
        }
      },
    })
    y = finalY() + 5
    legenda('Vermelho: vencido ou sem estoque  ·  Amarelo: vence nos próximos 30 dias')
    y += 10
  }

  if (secoes.compras) {
    titulo('Compras (reposição)')
    autoTable(doc, {
      ...estilo,
      startY: y,
      head: [['Código', 'Produto', 'Categoria', 'Unid.', 'Saldo', 'Mínimo', 'Cobertura', 'Comprar']],
      body: r.compras.length
        ? r.compras.map(c => [
            c.codigo,
            c.produto,
            c.categoria,
            c.unidade,
            num(c.saldo),
            c.minimo === null ? '—' : num(c.minimo),
            cobertura(c.cobertura),
            `${num(c.sugestaoCompra)} ${c.unidade}`,
          ])
        : [[{ content: 'Nenhum produto no ponto de pedido.', colSpan: 8, styles: { halign: 'center', textColor: CINZA } }]],
      columnStyles: {
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right', fontStyle: 'bold', textColor: VERDE },
      },
    })
    y = finalY() + 5
    legenda('Quantidade já arredondada pelo conteúdo da embalagem  ·  do mais crítico ao menos crítico')
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
