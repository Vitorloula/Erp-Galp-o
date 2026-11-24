import type { Env } from './env'
import type { MetaWebhookPayload } from './meta/types'
import { verificarAssinatura } from './meta/verify'
import { buscarCanal } from './supabase'
import { processarMensagem } from './agent/runtime'

export interface FilaMensagem { phoneNumberId: string; de: string; nomePerfil: string | null; texto: string; providerId: string; timestamp: string }

export async function consumirFila(batch: MessageBatch<FilaMensagem>, env: Env): Promise<void> {
  for (const msg of batch.messages) {
    try {
      const m = msg.body
      const canal = await buscarCanal(env, m.phoneNumberId)
      if (!canal) { msg.ack(); continue }
      await processarMensagem({ env, canal, telefone: m.de, nomePerfil: m.nomePerfil, texto: m.texto, providerId: m.providerId })
      msg.ack()
    } catch (e) {
      console.error('falha ao processar mensagem', e)
      msg.retry()
    }
  }
}

export async function enfileirarWebhook(request: Request, env: Env): Promise<Response> {
  const body = await request.text()
  if (!(await verificarAssinatura(request, env, body))) {
    return new Response('assinatura inválida', { status: 401 })
  }
  const payload = JSON.parse(body) as MetaWebhookPayload
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value
      const phoneNumberId = v.metadata?.phone_number_id
      if (!phoneNumberId) continue
      for (const c of v.contacts ?? []) {
        // só para capturar nome; não enfileira aqui
        void c
      }
      for (const m of v.messages ?? []) {
        const texto = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? ''
        const contato = v.contacts?.find(c => c.wa_id === m.from)
        await env.FILA.send({
          phoneNumberId,
          de: m.from,
          nomePerfil: contato?.profile?.name ?? null,
          texto,
          providerId: m.id,
          timestamp: m.timestamp,
        })
      }
    }
  }
  return new Response('OK', { status: 200 })
}
