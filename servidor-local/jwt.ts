import { createHmac, timingSafeEqual } from 'node:crypto'

/** JWT HS256 (mesmo algoritmo do Supabase), assinado com o segredo do servidor local. */

const b64 = (dados: string | Buffer) => Buffer.from(dados).toString('base64url')

export function assinarJwt(claims: Record<string, unknown>, segredo: string): string {
  const corpo = `${b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64(JSON.stringify(claims))}`
  return `${corpo}.${b64(createHmac('sha256', segredo).update(corpo).digest())}`
}

export type ResultadoJwt =
  | { ok: true; claims: Record<string, unknown> }
  | { ok: false; motivo: 'invalido' | 'expirado' }

export function verificarJwt(token: string, segredo: string): ResultadoJwt {
  const partes = token.split('.')
  if (partes.length !== 3) return { ok: false, motivo: 'invalido' }
  const esperada = createHmac('sha256', segredo).update(`${partes[0]}.${partes[1]}`).digest()
  const recebida = Buffer.from(partes[2], 'base64url')
  if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) return { ok: false, motivo: 'invalido' }
  let claims: Record<string, unknown>
  try {
    claims = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'))
  } catch {
    return { ok: false, motivo: 'invalido' }
  }
  if (typeof claims.exp === 'number' && claims.exp <= Math.floor(Date.now() / 1000)) return { ok: false, motivo: 'expirado' }
  return { ok: true, claims }
}
