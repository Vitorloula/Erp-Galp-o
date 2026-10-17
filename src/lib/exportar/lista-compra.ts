import type { ItemCompra } from '../estoque'
import { formatarDataHora, formatarEmbalagens, hojeISO } from '../formato'
import { CINZA_ARGB, CINZA_RGB, VERDE_ARGB, VERDE_RGB, formatoNumero, linhaGeradoEm, textoCobertura, textoNumero } from './comum'
import { bordas, montarCabecalho } from './excel'
import { ESTILO, VERDE } from './pdf'

/**
 * Lista de compras (reposição) fora do relatório de período: o recorte que o operador
 * marcou na tela de Estoque, já com a quantidade arredondada pela embalagem.
 *
 * Aqui só há formatação — saldo, mínimo, cobertura e "comprar" vêm de `ItemCompra`
 * (`montarReposicao`/`sugerirCompra`/`calcularCobertura` em `lib/estoque.ts`).
 */

const COLUNAS = [
  { titulo: 'Código', largura: 12 },
  { titulo: 'Produto', largura: 38 },
  { titulo: 'Categoria', largura: 18 },
  { titulo: 'Unid.', largura: 7 },
  { titulo: 'Saldo', largura: 12 },
  { titulo: 'Mínimo', largura: 12 },
  { titulo: 'Cobertura', largura: 11 },
  { titulo: 'Comprar', largura: 14 },
  { titulo: 'Fornecedor', largura: 24 },
  { titulo: 'Observação', largura: 30 },
] as const

const LEGENDA = 'Quantidade já arredondada pelo conteúdo da embalagem · do mais crítico ao menos crítico'

/** `lista-de-compras_2026-10-03.xlsx` (o dia é o da geração, fuso local). */
export function nomeArquivoListaCompra(ext: 'xlsx' | 'pdf', dia = hojeISO()): string {
  return `lista-de-compras_${dia}.${ext}`
}

/** "2 emb." quando o produto tem conteúdo por embalagem. */
function embalagens(item: ItemCompra): string | null {
  return formatarEmbalagens(item.sugestaoCompra, item.produto.conteudo_embalagem)
}

/** Cobertura em pt-BR (2 casas + "x"); "—" quando o produto não tem mínimo. */
function textoCoberturaItem(c: number | null): string {
  return textoCobertura(c)
}

/** Linha 2 do cabeçalho: título + contagem + data/hora da geração. */
function linha2(itens: readonly ItemCompra[], geradoEm: Date): string {
  const n = itens.length
  return `Lista de compras (reposição) — ${n} produto${n === 1 ? '' : 's'} · ${formatarDataHora(geradoEm.toISOString())}`
}

export interface OpcoesListaCompra {
  /** Momento da geração (default: agora). */
  geradoEm?: Date
}

/** Uma aba "Lista de compras" com as colunas da tela + Fornecedor/Observação em branco. */
export async function gerarListaCompraExcel(itens: readonly ItemCompra[], empresa: string, opcoes: OpcoesListaCompra = {}): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default
  const geradoEm = opcoes.geradoEm ?? new Date()
  const wb = new ExcelJS.Workbook()
  wb.creator = empresa
  wb.created = geradoEm

  const ws = wb.addWorksheet('Lista de compras')
  montarCabecalho(ws, linha2(itens, geradoEm), geradoEm, empresa, COLUNAS.map(c => ({ titulo: c.titulo, largura: c.largura })))

  if (itens.length === 0) {
    const vazio = ws.addRow(['Nenhum produto selecionado para compra.'])
    vazio.getCell(1).font = { italic: true, size: 9, color: { argb: CINZA_ARGB } }
  }

  for (const item of itens) {
    const row = ws.addRow([item.codigo, item.produto.nome, item.categoria, item.unidade])
    formatoNumero(row.getCell(5), item.saldo)
    if (item.minimo !== null) formatoNumero(row.getCell(6), item.minimo)
    if (item.cobertura !== null) {
      row.getCell(7).value = item.cobertura
      row.getCell(7).numFmt = '0.00"×"'
    }
    // "Comprar": número puro para o fornecedor; o texto "8 kg (2 emb.)" aparece no PDF e na legenda.
    const comprar = row.getCell(8)
    formatoNumero(comprar, item.sugestaoCompra)
    comprar.font = { bold: true, color: { argb: VERDE_ARGB } }
    // Fornecedor e Observação ficam em branco para preencher à mão na visita ao fornecedor.
    row.getCell(9).value = null
    row.getCell(10).value = null
  }

  bordas(ws)
  const leg = ws.addRow([])
  leg.getCell(1).value = LEGENDA
  leg.getCell(1).font = { italic: true, size: 9, color: { argb: CINZA_ARGB } }

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/** PDF paisagem com a mesma tabela e o cabeçalho empresa/data (sem período). */
export async function gerarListaCompraPdf(itens: readonly ItemCompra[], empresa: string, opcoes: OpcoesListaCompra = {}): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const geradoEm = opcoes.geradoEm ?? new Date()
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const largura = doc.internal.pageSize.getWidth()
  const altura = doc.internal.pageSize.getHeight()
  const margem = 12

  doc.setFillColor(...VERDE_RGB)
  doc.rect(0, 0, largura, 4, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(15, 23, 42)
  doc.text(empresa, margem, 16)
  doc.setFontSize(11)
  doc.text('Lista de compras (reposição)', margem, 23)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(71, 85, 105)
  doc.text(linhaGeradoEm(geradoEm), margem, 29)

  autoTable(doc, {
    ...ESTILO,
    margin: { left: margem, right: margem },
    startY: 35,
    head: [COLUNAS.map(c => c.titulo)],
    body: itens.length
      ? itens.map(item => {
          const emb = embalagens(item)
          return [
            item.codigo,
            item.produto.nome,
            item.categoria,
            item.unidade,
            textoNumero(item.saldo),
            item.minimo === null ? '—' : textoNumero(item.minimo),
            textoCoberturaItem(item.cobertura),
            `${textoNumero(item.sugestaoCompra)} ${item.unidade}${emb ? ` (${emb})` : ''}`,
            '',
            '',
          ]
        })
      : [[{ content: 'Nenhum produto selecionado para compra.', colSpan: COLUNAS.length, styles: { halign: 'center', textColor: CINZA_RGB } }]],
    columnStyles: {
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right', fontStyle: 'bold', textColor: VERDE },
      8: { cellWidth: 32 },
      9: { cellWidth: 42 },
    },
  })

  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...CINZA_RGB)
    doc.text(LEGENDA, margem, altura - 10)
    doc.setFont('helvetica', 'normal')
    doc.text(empresa, margem, altura - 6)
    doc.text(`Página ${i} de ${paginas}`, largura - margem, altura - 6, { align: 'right' })
  }

  return doc.output('blob')
}
