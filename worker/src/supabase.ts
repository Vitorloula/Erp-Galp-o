import type { Env } from './env'

const REST = (env: Env) => `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1`

function headers(env: Env, extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
    ...extra,
  }
}

export async function buscarCanal(env: Env, phoneNumberId: string): Promise<{ id: string; empresa_id: string; loja_id: string; phone_number_id: string; token: string; politica: Record<string, unknown>; escopo_piloto: Record<string, unknown> } | null> {
  const url = `${REST(env)}/canais_whatsapp?phone_number_id=eq.${encodeURIComponent(phoneNumberId)}&select=id,empresa_id,loja_id,phone_number_id,politica,escopo_piloto&limit=1`
  const res = await fetch(url, { headers: headers(env) })
  if (!res.ok) return null
  const rows = (await res.json()) as Array<Record<string, unknown>>
  const r = rows[0]
  if (!r) return null
  // TODO: buscar o business token (Meta) de uma tabela de segredos ou do cofre; por enquanto env.
  return {
    id: String(r.id),
    empresa_id: String(r.empresa_id),
    loja_id: String(r.loja_id),
    phone_number_id: String(r.phone_number_id ?? phoneNumberId),
    token: env.SUPABASE_SERVICE_ROLE_KEY, // placeholder: substituir pelo business token Meta do canal
    politica: (r.politica as Record<string, unknown>) ?? {},
    escopo_piloto: (r.escopo_piloto as Record<string, unknown>) ?? {},
  }
}

export async function buscarOuCriarContato(env: Env, canalId: string, empresaId: string, telefone: string, nomePerfil: string | null): Promise<string> {
  const sel = `${REST(env)}/whatsapp_contatos?canal_id=eq.${canalId}&telefone_e164=eq.${encodeURIComponent(telefone)}&select=id&limit=1`
  const r1 = await fetch(sel, { headers: headers(env) })
  const rows = r1.ok ? ((await r1.json()) as Array<{ id: string }>) : []
  if (rows[0]) return rows[0].id
  const res = await fetch(`${REST(env)}/whatsapp_contatos`, {
    method: 'POST',
    headers: headers(env, { prefer: 'return=representation' }),
    body: JSON.stringify({ canal_id: canalId, empresa_id: empresaId, telefone_e164: telefone, nome_perfil: nomePerfil }),
  })
  const created = (await res.json()) as Array<{ id: string }>
  return created[0].id
}

export async function criarConversa(env: Env, canalId: string, empresaId: string, contatoId: string): Promise<string> {
  const res = await fetch(`${REST(env)}/whatsapp_conversas`, {
    method: 'POST',
    headers: headers(env, { prefer: 'return=representation' }),
    body: JSON.stringify({ canal_id: canalId, empresa_id: empresaId, contato_id: contatoId, estado: 'bot' }),
  })
  const rows = (await res.json()) as Array<{ id: string }>
  return rows[0].id
}

export async function gravarMensagem(env: Env, conversaId: string, empresaId: string, direcao: 'in' | 'out', tipo: string, texto: string | null, providerId: string | null, tokensEntrada?: number, tokensSaida?: number, custo?: number): Promise<string> {
  const res = await fetch(`${REST(env)}/whatsapp_mensagens`, {
    method: 'POST',
    headers: headers(env, { prefer: 'return=representation' }),
    body: JSON.stringify({
      conversa_id: conversaId,
      empresa_id: empresaId,
      direcao,
      tipo,
      texto,
      provider_id: providerId,
      tokens_entrada: tokensEntrada ?? null,
      tokens_saida: tokensSaida ?? null,
      custo_usd: custo ?? null,
    }),
  })
  const rows = (await res.json()) as Array<{ id: string }>
  return rows[0].id
}

export async function gravarAcao(env: Env, conversaId: string, empresaId: string, mensagemId: string | null, tool: string, argumentos: unknown, resultado: unknown, status: 'proposta' | 'executada' | 'falhou'): Promise<void> {
  await fetch(`${REST(env)}/whatsapp_acoes`, {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify({ conversa_id: conversaId, empresa_id: empresaId, mensagem_id: mensagemId, tool, argumentos, resultado, status }),
  })
}

export async function catalogoPublico(env: Env, empresaId: string, lojaId: string, busca: string | null, limite = 8): Promise<Array<{ produto_id: string; codigo_interno: string; nome: string; preco_venda_centavos: number; disponibilidade: string }>> {
  const res = await fetch(`${REST(env)}/rpc/catalogo_publico`, {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify({ p_empresa: empresaId, p_loja: lojaId, p_busca: busca, p_limite: limite }),
  })
  if (!res.ok) return []
  return (await res.json()) as Array<{ produto_id: string; codigo_interno: string; nome: string; preco_venda_centavos: number; disponibilidade: string }>
}

export async function buscarConversaAtiva(env: Env, canalId: string, contatoId: string): Promise<string | null> {
  const url = `${REST(env)}/whatsapp_conversas?canal_id=eq.${canalId}&contato_id=eq.${contatoId}&estado=in.(bot,humano)&select=id&order=criado_em.desc&limit=1`
  const res = await fetch(url, { headers: headers(env) })
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{ id: string }>
  return rows[0]?.id ?? null
}

export async function criarPedido(env: Env, empresaId: string, lojaId: string, contatoId: string | null, conversaId: string | null, retiradaOuEntrega: 'retirada' | 'entrega', enderecoEntrega: string | null, observacao: string | null, itens: Array<{ produto_id: string; qtd: number }>): Promise<{ pedido_id: string; numero: number } | null> {
  const res = await fetch(`${REST(env)}/rpc/criar_pedido`, {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify({
      p_empresa: empresaId,
      p_loja: lojaId,
      p_contato: contatoId,
      p_conversa: conversaId,
      p_retirada_ou_entrega: retiradaOuEntrega,
      p_endereco_entrega: enderecoEntrega,
      p_observacao: observacao,
      p_itens: itens.map(i => ({ produto_id: i.produto_id, qtd: i.qtd })),
    }),
  })
  if (!res.ok) return null
  const id = (await res.json()) as string
  // buscar número
  const r2 = await fetch(`${REST(env)}/pedidos?id=eq.${id}&select=numero`, { headers: headers(env) })
  const rows = r2.ok ? ((await r2.json()) as Array<{ numero: number }>) : []
  return { pedido_id: id, numero: rows[0]?.numero ?? 0 }
}

export async function consultarPedido(env: Env, empresaId: string, numero: number): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${REST(env)}/rpc/consultar_pedido`, {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify({ p_empresa: empresaId, p_numero: numero }),
  })
  if (!res.ok) return null
  return (await res.json()) as Record<string, unknown>
}
export async function pausarConversa(env: Env, conversaId: string, empresaId: string): Promise<void> {
  await fetch(`${REST(env)}/whatsapp_conversas?id=eq.${conversaId}`, {
    method: 'PATCH',
    headers: headers(env),
    body: JSON.stringify({ empresa_id: empresaId, estado: 'humano', atualizado_em: new Date().toISOString() }),
  })
}
