import type { Env } from '../env'
import * as sb from '../supabase'
import { TOOLS, executarTool } from './tools'
import { montarPromptSistema } from './prompt'
import { chamarLLM, type MensagemLLM } from './llm'
import { enviarTexto, enviarBotoes } from '../meta/client'

export interface ContextoMensagem { env: Env; canal: Awaited<ReturnType<typeof sb.buscarCanal>>; telefone: string; nomePerfil: string | null; texto: string; providerId: string }

export async function processarMensagem(ctx: ContextoMensagem): Promise<void> {
  const { env, canal, telefone, nomePerfil, texto, providerId } = ctx
  if (!canal) return

  const contatoId = await sb.buscarOuCriarContato(env, canal.id, canal.empresa_id, telefone, nomePerfil)
  let conversaId = await sb.buscarConversaAtiva(env, canal.id, contatoId)
  if (!conversaId) conversaId = await sb.criarConversa(env, canal.id, canal.empresa_id, contatoId)

  await sb.gravarMensagem(env, conversaId, canal.empresa_id, 'in', 'text', texto, providerId)

  // Histórico curto (últimas 10 mensagens)
  const hist = await carregarHistorico(env, conversaId)

  const mensagens: MensagemLLM[] = [
    { role: 'system', content: montarPromptSistema(canal.politica, canal.escopo_piloto) },
    ...hist,
    { role: 'user', content: texto },
  ]

  let resposta = await chamarLLM(env, mensagens, TOOLS as unknown)
  let tokensEntrada = resposta.tokensEntrada
  let tokensSaida = resposta.tokensSaida

  // Loop de tool calls (máx 3 iterações)
  let iter = 0
  while (resposta.toolCalls.length > 0 && iter < 3) {
    iter++
    mensagens.push({ role: 'assistant', content: resposta.content, tool_calls: resposta.toolCalls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } })) })
    for (const tc of resposta.toolCalls) {
      const r = await executarTool(env, canal.empresa_id, canal.loja_id, tc.name, tc.arguments, { contatoId, conversaId })
      await sb.gravarAcao(env, conversaId, canal.empresa_id, null, tc.name, tc.arguments, r, r.ok ? 'executada' : 'falhou')
      mensagens.push({ role: 'tool', tool_call_id: tc.id, name: tc.name, content: JSON.stringify(r) })
    }
    resposta = await chamarLLM(env, mensagens, TOOLS as unknown)
    tokensEntrada += resposta.tokensEntrada
    tokensSaida += resposta.tokensSaida
  }

  const textoFinal = (resposta.content ?? '').trim() || 'Não consegui responder agora. Posso chamar um atendente?'
  const providerMsgId = await enviarTexto(env, canal.token, canal.phone_number_id, telefone, textoFinal)
  await sb.gravarMensagem(env, conversaId, canal.empresa_id, 'out', 'text', textoFinal, providerMsgId, tokensEntrada, tokensSaida, undefined)

  // handoff
  if (textoFinal.toLowerCase().includes('atendente') || resposta.toolCalls.some(tc => tc.name === 'falar_com_humano')) {
    await sb.pausarConversa(env, conversaId, canal.empresa_id)
  }
}

async function carregarHistorico(env: Env, conversaId: string): Promise<MensagemLLM[]> {
  const url = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/whatsapp_mensagens?conversa_id=eq.${conversaId}&select=direcao,texto&order=criado_em.asc&limit=10`
  const res = await fetch(url, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } })
  if (!res.ok) return []
  const rows = (await res.json()) as Array<{ direcao: string; texto: string | null }>
  return rows.map(r => ({ role: r.direcao === 'in' ? 'user' : 'assistant', content: r.texto ?? '' }))
}
