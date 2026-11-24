import type { Env } from '../env'

const BASE = (env: Env) => `https://graph.facebook.com/${env.META_GRAPH_VERSION}`

export async function enviarTexto(env: Env, token: string, phoneNumberId: string, para: string, texto: string): Promise<string | null> {
  return enviar(env, token, phoneNumberId, {
    messaging_product: 'whatsapp',
    to: para,
    type: 'text',
    text: { body: texto, preview_url: false },
  })
}

export async function enviarBotoes(env: Env, token: string, phoneNumberId: string, para: string, texto: string, botoes: Array<{ id: string; titulo: string }>): Promise<string | null> {
  return enviar(env, token, phoneNumberId, {
    messaging_product: 'whatsapp',
    to: para,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: texto },
      action: { buttons: botoes.map(b => ({ type: 'reply', reply: { id: b.id, title: b.titulo.slice(0, 20) } })) },
    },
  })
}

async function enviar(env: Env, token: string, phoneNumberId: string, payload: Record<string, unknown>): Promise<string | null> {
  const res = await fetch(`${BASE(env)}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  if (!res.ok) return null
  const json = (await res.json()) as { messages?: Array<{ id: string }> }
  return json.messages?.[0]?.id ?? null
}
