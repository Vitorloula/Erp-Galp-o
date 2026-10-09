/**
 * Etiqueta de balança (EAN-13 que começa com "2"): traz o código do produto (PLU) e
 * o preço total ou o peso. O formato varia entre balanças, por isso é configurável por
 * empresa (empresas.config.balanca). Padrão: "2" + PLU de 4 dígitos + 5 dígitos de
 * valor nas posições 8–12 + dígito verificador.
 *
 *   2 0042 0 01234 7  →  PLU 0042, R$ 12,34 (tipo "preco") ou 1,234 kg (tipo "peso")
 */

export interface ConfigBalanca {
  prefixo: string
  digitos_codigo: number
  tipo: 'preco' | 'peso'
  /** Quantos dígitos de valor, logo antes do verificador (padrão 5). */
  digitos_valor?: number
}

export interface EtiquetaBalanca {
  plu: string
  /** Preço total em centavos (tipo "preco") */
  precoTotal?: number
  /** Peso em kg (tipo "peso") */
  peso?: number
}

export function digitoEan13(doze: string): number {
  const soma = doze.split('').reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0)
  return (10 - (soma % 10)) % 10
}

export function lerEtiquetaBalanca(codigo: string, config: ConfigBalanca | undefined | null): EtiquetaBalanca | null {
  if (!config) return null
  const c = codigo.trim()
  if (!/^\d{13}$/.test(c) || !c.startsWith(config.prefixo)) return null
  if (digitoEan13(c.slice(0, 12)) !== Number(c[12])) return null
  const inicio = config.prefixo.length
  const plu = c.slice(inicio, inicio + config.digitos_codigo)
  const dv = config.digitos_valor ?? 5
  const valor = Number(c.slice(12 - dv, 12))
  return config.tipo === 'peso' ? { plu, peso: valor / 1000 } : { plu, precoTotal: valor }
}

/** O PLU da etiqueta corresponde ao código de balança do produto? (ignora zeros à esquerda) */
export const mesmoPlu = (plu: string, codigoBalanca: string | null) =>
  !!codigoBalanca && plu.replace(/^0+/, '') === codigoBalanca.replace(/^0+/, '')
