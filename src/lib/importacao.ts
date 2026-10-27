import type { LinhaImportacao } from './dados/catalogo'
import { canonizarCodigo, UNIDADES } from './formato'
import type { CodigoProduto, Rastreio, Unidade } from './tipos'

export interface LeituraImportacao {
  linhas: LinhaImportacao[]
  erros: string[]
}

const UNIDADES_VALIDAS = new Set(UNIDADES.map(u => u.valor))

const ALIASES: Record<string, string[]> = {
  nome: ['nome', 'produto', 'descricao', 'descrição'],
  codigo_interno: ['codigo_interno', 'codigo interno', 'codigo', 'código', 'cod', 'sku'],
  codigo_barras: ['codigo_barras', 'codigo de barras', 'ean', 'gtin', 'barras'],
  categoria: ['categoria', 'grupo', 'familia', 'família'],
  unidade: ['unidade', 'unid', 'un', 'umed'],
  conteudo_embalagem: ['conteudo_embalagem', 'conteudo por embalagem', 'conteudo', 'embalagem'],
  preco_venda: ['preco_venda', 'preco de venda', 'preco', 'preço', 'valor', 'valor_venda'],
  estoque_minimo: ['estoque_minimo', 'estoque minimo', 'estoque mínimo', 'minimo', 'mínimo', 'ponto_pedido'],
  quantidade: ['quantidade', 'saldo', 'saldo_inicial', 'estoque_inicial', 'qtd', 'quantidade_inicial'],
  lote: ['lote', 'numero_lote', 'número lote', 'batch'],
  validade: ['validade', 'vencimento', 'data_validade', 'data de validade'],
  fabricante: ['fabricante', 'marca', 'fornecedor'],
  observacao: ['observacao', 'observação', 'obs', 'nota'],
  controla_estoque: ['controla_estoque', 'controla estoque', 'estoque'],
  rastreio: ['rastreio', 'controlar_lote', 'controla_lote', 'lote_serie'],
}

/** Remove acentos, baixa a caixa e troca qualquer separador por "_". */
export function normalizarCabecalho(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function chaveDoCabecalho(titulo: string): string | null {
  const t = normalizarCabecalho(titulo)
  for (const [chave, aliases] of Object.entries(ALIASES)) {
    if (aliases.some(a => normalizarCabecalho(a) === t)) return chave
  }
  return null
}

/** Detecta o separador olhando o cabeçalho fora das aspas. */
export function detectarSeparador(texto: string): string {
  const primeira = texto.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? ''
  const fora = primeira.replace(/"[^"]*"/g, '')
  const opcoes = [';', ',', '\t']
  return opcoes.reduce((melhor, atual) => (fora.split(atual).length > fora.split(melhor).length ? atual : melhor), ';')
}

/** Lê CSV (separador ; , ou tab) com aspas, quebras de linha e BOM. */
export function lerCSV(texto: string): string[][] {
  const limpo = texto.replace(/^\uFEFF/, '')
  const separador = detectarSeparador(limpo)
  const linhas: string[][] = []
  let linha: string[] = []
  let campo = ''
  let entreAspas = false

  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i]
    if (entreAspas) {
      if (c === '"') {
        if (limpo[i + 1] === '"') {
          campo += '"'
          i++
        } else {
          entreAspas = false
        }
      } else {
        campo += c
      }
      continue
    }
    if (c === '"') {
      entreAspas = true
    } else if (c === separador) {
      linha.push(campo)
      campo = ''
    } else if (c === '\n') {
      linha.push(campo.replace(/\r$/, ''))
      linhas.push(linha)
      linha = []
      campo = ''
    } else {
      campo += c
    }
  }
  if (campo.length > 0 || linha.length > 0) {
    linha.push(campo.replace(/\r$/, ''))
    linhas.push(linha)
  }
  return linhas.filter(l => l.some(c => c.trim() !== ''))
}

function valorCelula(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    const obj = v as { text?: string; result?: unknown; richText?: { text: string }[]; hyperlink?: string }
    if (Array.isArray(obj.richText)) return obj.richText.map(r => r.text).join('')
    if (obj.text !== undefined) return String(obj.text)
    if (obj.result !== undefined) return valorCelula(obj.result)
    if (obj.hyperlink) return obj.hyperlink
  }
  return String(v)
}

/** Lê .xlsx (primeira aba) ou .csv/.tsv. O ExcelJS é carregado só quando necessário. */
export async function lerArquivo(arquivo: File): Promise<string[][]> {
  const nome = arquivo.name.toLowerCase()
  if (nome.endsWith('.csv') || nome.endsWith('.tsv') || nome.endsWith('.txt')) return lerCSV(await arquivo.text())
  if (nome.endsWith('.xlsx')) {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await arquivo.arrayBuffer())
    const ws = wb.worksheets[0]
    if (!ws) return []
    const linhas: string[][] = []
    ws.eachRow({ includeEmpty: false }, row => {
      const valores: string[] = []
      row.eachCell({ includeEmpty: true }, cell => valores.push(valorCelula(cell.value)))
      linhas.push(valores)
    })
    return linhas.filter(l => l.some(c => c.trim() !== ''))
  }
  throw new Error('Envie um arquivo .xlsx ou .csv.')
}

/** Números no formato brasileiro (1.234,56) ou internacional (1234.56). */
export function numeroPlanilha(valor: string | undefined | null): number | null {
  if (valor === null || valor === undefined) return null
  const t = valor
    .toString()
    .trim()
    .replace(/^R\$\s*/i, '')
    .replace(/\s/g, '')
  if (!t) return null
  let normalizado = t
  if (t.includes(',') && t.includes('.')) normalizado = t.replace(/\./g, '').replace(',', '.')
  else normalizado = t.replace(',', '.')
  const n = Number(normalizado)
  return Number.isFinite(n) ? n : null
}

/** Aceita AAAA-MM-DD, DD/MM/AAAA e serial do Excel. */
export function dataPlanilha(valor: string | undefined | null): string | null {
  if (valor === null || valor === undefined) return null
  const t = valor.toString().trim()
  if (!t) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const br = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t)
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const dias = Number(t)
    if (dias > 20000 && dias < 60000) {
      const data = new Date(Date.UTC(1899, 11, 30) + dias * 86_400_000)
      return data.toISOString().slice(0, 10)
    }
  }
  return null
}

function booleano(valor: string | undefined, padrao: boolean): boolean {
  if (!valor || !valor.trim()) return padrao
  const t = normalizarCabecalho(valor)
  if (['nao', 'n', '0', 'false', 'falso', 'off'].includes(t)) return false
  if (['sim', 's', '1', 'true', 'verdadeiro', 'on'].includes(t)) return true
  return padrao
}

function rastreioDe(valor: string | undefined, lote: string, validade: string | null): Rastreio {
  const t = normalizarCabecalho(valor ?? '')
  if (t === 'serie') return 'serie'
  if (t === 'lote' || t === 'sim' || t === '1') return 'lote'
  if (t === 'nenhum' || t === 'nao' || t === '0') return 'nenhum'
  return lote || validade ? 'lote' : 'nenhum'
}

/** Converte a tabela (cabeçalho + linhas) em linhas validadas e mensagens de erro por linha. */
export function mapearLinhas(tabela: string[][]): LeituraImportacao {
  const erros: string[] = []
  if (tabela.length < 2) return { linhas: [], erros: ['A planilha precisa ter o cabeçalho e pelo menos uma linha de produto.'] }

  const cabecalho = tabela[0].map(chaveDoCabecalho)
  if (!cabecalho.includes('nome')) return { linhas: [], erros: ['A planilha precisa ter a coluna "nome".'] }

  const col = (linha: string[], chave: string) => {
    const i = cabecalho.indexOf(chave)
    return i >= 0 ? (linha[i] ?? '').trim() : ''
  }

  const linhas: LinhaImportacao[] = []
  const codigosVistos = new Set<string>()
  const internosVistos = new Set<string>()

  for (let i = 1; i < tabela.length; i++) {
    const bruta = tabela[i]
    const numeroLinha = i + 1
    const nome = col(bruta, 'nome')
    if (!nome) {
      erros.push(`Linha ${numeroLinha}: informe o nome do produto.`)
      continue
    }

    const unidadeTxt = col(bruta, 'unidade') || 'un'
    if (!UNIDADES_VALIDAS.has(unidadeTxt as Unidade)) {
      erros.push(`Linha ${numeroLinha}: unidade "${unidadeTxt}" inválida. Use uma de: ${UNIDADES.map(u => u.valor).join(', ')}.`)
      continue
    }

    const preco = numeroPlanilha(col(bruta, 'preco_venda'))
    if (col(bruta, 'preco_venda') && (preco === null || preco < 0)) {
      erros.push(`Linha ${numeroLinha}: preço de venda inválido.`)
      continue
    }
    const minimo = numeroPlanilha(col(bruta, 'estoque_minimo'))
    if (col(bruta, 'estoque_minimo') && (minimo === null || minimo < 0)) {
      erros.push(`Linha ${numeroLinha}: estoque mínimo inválido.`)
      continue
    }
    const quantidade = numeroPlanilha(col(bruta, 'quantidade')) ?? 0
    if (quantidade < 0) {
      erros.push(`Linha ${numeroLinha}: quantidade inicial não pode ser negativa.`)
      continue
    }
    const embalagem = numeroPlanilha(col(bruta, 'conteudo_embalagem'))
    if (col(bruta, 'conteudo_embalagem') && (embalagem === null || embalagem <= 0)) {
      erros.push(`Linha ${numeroLinha}: conteúdo por embalagem inválido.`)
      continue
    }

    const lote = col(bruta, 'lote').toUpperCase()
    const validade = dataPlanilha(col(bruta, 'validade'))
    if (col(bruta, 'validade') && !validade) {
      erros.push(`Linha ${numeroLinha}: validade inválida. Use AAAA-MM-DD ou DD/MM/AAAA.`)
      continue
    }

    const controla = booleano(col(bruta, 'controla_estoque'), true)
    if (!controla && quantidade > 0) {
      erros.push(`Linha ${numeroLinha}: produto sem controle de estoque não pode ter quantidade inicial.`)
      continue
    }

    const codigoInterno = col(bruta, 'codigo_interno').toUpperCase()
    if (codigoInterno && internosVistos.has(codigoInterno)) {
      erros.push(`Linha ${numeroLinha}: código interno ${codigoInterno} repetido no arquivo.`)
      continue
    }

    const codigos: CodigoProduto[] = []
    const codigosDaLinha = new Set<string>()
    let codigoRepetido = false
    for (const bruto of col(bruta, 'codigo_barras').split(/[;,|]/)) {
      const limpo = bruto.trim()
      if (!limpo) continue
      const codigo = canonizarCodigo(limpo)
      if (codigosVistos.has(codigo) || codigosDaLinha.has(codigo)) {
        erros.push(`Linha ${numeroLinha}: código de barras ${limpo} repetido no arquivo.`)
        codigoRepetido = true
        break
      }
      codigosDaLinha.add(codigo)
      codigos.push({ codigo, fator: 1 })
    }
    if (codigoRepetido) continue

    for (const codigo of codigosDaLinha) codigosVistos.add(codigo)
    if (codigoInterno) internosVistos.add(codigoInterno)

    linhas.push({
      linha: numeroLinha,
      nome,
      codigo_interno: codigoInterno,
      categoria: col(bruta, 'categoria'),
      unidade: unidadeTxt,
      conteudo_embalagem: embalagem,
      preco_venda: preco,
      estoque_minimo: minimo !== null && minimo > 0 ? minimo : null,
      quantidade,
      lote,
      validade,
      fabricante: col(bruta, 'fabricante'),
      observacao: col(bruta, 'observacao'),
      controla_estoque: controla,
      rastreio: rastreioDe(col(bruta, 'rastreio'), lote, validade),
      codigos,
    })
  }

  return { linhas, erros }
}

export const COLUNAS_MODELO = [
  'nome',
  'codigo_interno',
  'codigo_barras',
  'categoria',
  'unidade',
  'conteudo_embalagem',
  'preco_venda',
  'estoque_minimo',
  'quantidade',
  'lote',
  'validade',
  'fabricante',
  'controla_estoque',
  'rastreio',
]

/** Modelo CSV pronto para baixar e preencher no Excel. */
export function modeloCSV(): string {
  return [
    COLUNAS_MODELO.join(';'),
    'Produto exemplo;P0001;7891000000000;Defensivo agrícola;L;20;32,90;10;100;LOTE-EXEMPLO;31/12/2027;Fabricante;sim;lote',
  ].join('\r\n')
}
