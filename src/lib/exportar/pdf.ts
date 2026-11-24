import { formatarData, formatarDataHora, formatarNumero, formatarValidade } from '../formato'
import { formatarReais } from '../../pdv/venda'
import type { Relatorio } from '../relatorio'
import { CINZA_RGB, ESTILO_TABELA_PDF, VERDE_RGB, textoCobertura, textoGeradoEm, textoNumero } from './comum'
import type { Secoes } from './excel'

export const ESTILO = ESTILO_TABELA_PDF
export const VERDE = VERDE_RGB
export const CINZA = CINZA_RGB

const num = textoNumero
const cobertura = textoCobertura

export async function gerarPdf(r: Relatorio, empresa: string, secoes: Secoes): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const largura = doc.internal.pageSize.getWidth()
  const altura = doc.internal.pageSize.getHeight()
  const margem = 12
  const finalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  const estilo = { ...ESTILO, margin: { left: margem, right: margem, top: 16 } }

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

  const garantirEspaco = (necessario: number) => {
    if (y + necessario > altura - 12) {
      doc.addPage()
      y = 16
    }
  }

  const titulo = (texto: string) => {
    garantirEspaco(12)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(15, 23, 42)
    doc.text(texto, margem, y)
    y += 7
  }

  const legenda = (texto: string) => {
    garantirEspaco(6)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...CINZA)
    doc.text(texto, margem, y)
    y += 6
  }

  const fimTabela = (extra = 8) => {
    y = finalY() + extra
    if (y > altura - 12) {
      doc.addPage()
      y = 16
    }
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
    fimTabela(10)
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
    fimTabela(10)
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
    fimTabela(5)
    legenda('Vermelho: vencido ou sem estoque  ·  Amarelo: vence nos próximos 30 dias')
    fimTabela(6)
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
    fimTabela(5)
    legenda('Quantidade já arredondada pelo conteúdo da embalagem  ·  do mais crítico ao menos crítico')
    fimTabela(6)
  }

  if (secoes.resultado && r.resultado) {
    const res = r.resultado
    titulo('Resultado')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(15, 23, 42)
    const kpis = [
      `Faturamento bruto: ${formatarReais(res.faturamentoBruto)}`,
      `CMV: ${formatarReais(res.cmv)}`,
      `Lucro: ${formatarReais(res.lucro)}`,
      `Margem: ${formatarNumero(res.margem)}%`,
    ]
    for (const linha of kpis) {
      garantirEspaco(6)
      doc.text(linha, margem, y)
      y += 5
    }
    y += 4
    garantirEspaco(12)
    autoTable(doc, {
      ...estilo,
      startY: y,
      head: [['Produto', 'Faturamento', 'CMV', 'Lucro', 'Margem']],
      body: res.porProduto.length
        ? res.porProduto.map(p => [p.produto, formatarReais(p.faturamento), formatarReais(p.cmv), formatarReais(p.lucro), `${formatarNumero(p.margem)}%`])
        : [[{ content: 'Sem resultado no período.', colSpan: 5, styles: { halign: 'center', textColor: CINZA } }]],
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right', fontStyle: 'bold' },
        4: { halign: 'right' },
      },
    })
    fimTabela(5)
    if (res.valorSemCusto > 0) {
      legenda(`Itens sem custo cadastrado: ${formatarReais(res.valorSemCusto)} não entram no CMV.`)
      fimTabela(6)
    }
  }

  if (secoes.servicos && r.servicos) {
    const linhas = r.servicos.linhas.map(l => [
      l.os,
      l.cliente,
      l.aparelho,
      l.status,
      formatarData(l.recebidaEm),
      formatarData(l.prazo),
      formatarData(l.entregueEm),
      l.tecnico,
      formatarReais(l.total),
    ])
    titulo('Serviços')
    autoTable(doc, {
      ...estilo,
      startY: y,
      head: [['OS', 'Cliente', 'Aparelho', 'Status', 'Recebida em', 'Prazo', 'Entregue em', 'Técnico', 'Total']],
      body: linhas.length
        ? [
            ...linhas,
            [
              { content: 'TOTAL', colSpan: 8, styles: { fontStyle: 'bold' } },
              { content: formatarReais(r.servicos.faturamento), styles: { fontStyle: 'bold', halign: 'right' } },
            ],
          ]
        : [[{ content: 'Nenhuma ordem de serviço no período.', colSpan: 9, styles: { halign: 'center', textColor: CINZA } }]],
      columnStyles: { 8: { halign: 'right', fontStyle: 'bold' } },
    })
    fimTabela(5)
    legenda(`Faturamento no período: ${formatarReais(r.servicos.faturamento)}`)
    fimTabela(6)
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
