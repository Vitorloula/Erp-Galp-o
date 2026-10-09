/**
 * Leitura de códigos GS1 (DataMatrix / GS1-128 / QR) usados em embalagens de
 * defensivos: extrai GTIN (01), validade (17) e lote (10) para preencher a tela.
 * Códigos comuns (EAN-13 etc.) são devolvidos sem alteração.
 */
export interface CodigoLido {
  /** Código usado para localizar o produto (GTIN quando houver, senão o texto lido). */
  codigo: string
  lote?: string
  /** AAAA-MM-DD */
  validade?: string
  gs1: boolean
}

const GS = '\u001d'

// Tamanho fixo (sem contar os 2 dígitos do AI) dos AIs mais comuns.
const FIXOS: Record<string, number> = { '00': 18, '01': 14, '02': 14, '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6, '20': 2 }
// AIs de tamanho variável que reconhecemos (terminam no separador GS ou no fim).
const VARIAVEIS = new Set(['10', '21', '22', '30', '37', '90', '91', '92', '93', '94', '95', '96', '97', '98', '99'])

function dataGs1(aammdd: string): string | undefined {
  if (!/^\d{6}$/.test(aammdd)) return undefined
  const ano = 2000 + Number(aammdd.slice(0, 2))
  const mes = Number(aammdd.slice(2, 4))
  let dia = Number(aammdd.slice(4, 6))
  if (mes < 1 || mes > 12) return undefined
  if (dia === 0) dia = new Date(ano, mes, 0).getDate() // "00" = último dia do mês
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

function montar(campos: Record<string, string>, original: string): CodigoLido {
  const gtin = campos['01'] ?? campos['02']
  return {
    codigo: gtin ?? original,
    lote: campos['10']?.trim() || undefined,
    validade: campos['17'] ? dataGs1(campos['17']) : undefined,
    gs1: true,
  }
}

export function lerCodigo(bruto: string): CodigoLido {
  let texto = bruto.trim()

  // Formato legível: (01)07891234567895(17)260630(10)ABC123
  if (/^\(\d{2,4}\)/.test(texto)) {
    const campos: Record<string, string> = {}
    for (const m of texto.matchAll(/\((\d{2,4})\)([^(]*)/g)) campos[m[1]] = m[2]
    return montar(campos, texto)
  }

  // Remove identificador de simbologia (]d2, ]C1, ]Q3, ]e0...)
  const comPrefixo = /^\][A-Za-z]\d/.test(texto)
  if (comPrefixo) texto = texto.slice(3)
  if (texto.startsWith(GS)) texto = texto.slice(1)

  // Formato bruto: precisa começar com 01/02 + 14 dígitos para ser considerado GS1.
  const pareceGs1 = (comPrefixo || texto.includes(GS)) ? /^\d{2}/.test(texto) : /^0[12]\d{14}\d{2}/.test(texto)
  if (!pareceGs1) return { codigo: bruto.trim(), gs1: false }

  const campos: Record<string, string> = {}
  let i = 0
  while (i < texto.length) {
    if (texto[i] === GS) { i++; continue }
    const ai = texto.slice(i, i + 2)
    if (ai in FIXOS) {
      campos[ai] = texto.slice(i + 2, i + 2 + FIXOS[ai])
      i += 2 + FIXOS[ai]
    } else if (VARIAVEIS.has(ai)) {
      const fim = texto.indexOf(GS, i + 2)
      campos[ai] = texto.slice(i + 2, fim === -1 ? undefined : fim)
      i = fim === -1 ? texto.length : fim + 1
    } else {
      break // AI desconhecido: para de interpretar, mantém o que já foi lido
    }
  }
  if (!campos['01'] && !campos['02']) return { codigo: bruto.trim(), gs1: false }
  return montar(campos, bruto.trim())
}
