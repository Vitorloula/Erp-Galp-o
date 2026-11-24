import type { Env } from '../env'

export async function verificarAssinatura(request: Request, env: Env, body: string): Promise<boolean> {
  const sig = request.headers.get('x-hub-signature-256')
  if (!sig || !env.META_APP_SECRET) return false
  const expected = 'sha256=' + (await hmacSha256Hex(env.META_APP_SECRET, body))
  return timingSafeEqual(sig, expected)
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
