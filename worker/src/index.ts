import { Hono } from 'hono'
import type { Env } from './env'
import { enfileirarWebhook, consumirFila } from './queue'

const app = new Hono<{ Bindings: Env }>()

app.get('/webhook/:canal', (c) => {
  const mode = c.req.query('hub.mode')
  const token = c.req.query('hub.verify_token')
  const challenge = c.req.query('hub.challenge')
  if (mode === 'subscribe' && token && token === c.env.META_VERIFY_TOKEN) {
    return c.text(challenge ?? '', 200)
  }
  return c.text('forbidden', 403)
})

app.post('/webhook/:canal', async (c) => enfileirarWebhook(c.req.raw, c.env))

// Simulador (dev): POST { phoneNumberId, de, texto } sem assinatura
app.get('/dev/simular', (c) => c.json({ uso: 'POST /dev/simular com body JSON: { phoneNumberId, de, texto, nomePerfil? }', exemplo: { phoneNumberId: '1234567890', de: '5511999999999', texto: 'voces tem racao?' } }))
app.post('/dev/simular', async (c) => {
  if (c.env.SIMULADOR_ATIVO !== 'true') return c.text('desligado', 403)
  const body = (await c.req.json()) as { phoneNumberId: string; de: string; texto: string; nomePerfil?: string }
  await c.env.FILA.send({ phoneNumberId: body.phoneNumberId, de: body.de, nomePerfil: body.nomePerfil ?? null, texto: body.texto, providerId: `sim-${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000)) })
  return c.json({ ok: true })
})

app.get('/', (c) => c.json({ ok: true, servico: 'erp-galpao-whatsapp', health: '/health', simulador: 'POST /dev/simular' }))

app.get('/health', (c) => c.json({ ok: true, env: c.env.ENV }))

export default {
  fetch: app.fetch,
  queue: consumirFila,
}
