import { sb, traduzirErro } from './cliente'

export interface CanalWhatsapp {
  id: string
  empresa_id: string
  loja_id: string
  phone_number_id: string | null
  modo: 'coexistence' | 'api'
  status: 'pendente' | 'conectado' | 'desconectado' | 'erro'
  politica: Record<string, unknown>
}

export interface ConversaWhatsapp {
  id: string
  canal_id: string
  contato_id: string
  telefone: string
  nome_perfil: string | null
  estado: 'bot' | 'humano' | 'encerrada'
  atualizado_em: string
  preview: string | null
}

export interface MensagemWhatsapp {
  id: string
  direcao: 'in' | 'out'
  tipo: string
  texto: string | null
  criado_em: string
}

export interface PedidoWhatsapp {
  id: string
  numero: number
  status: 'aguardando_confirmacao' | 'confirmado' | 'separado' | 'retirado' | 'cancelado'
  retirada_ou_entrega: 'retirada' | 'entrega'
  total_centavos: number
  criado_em: string
  contato_telefone: string | null
  itens: { nome: string; qtd: number; subtotal_centavos: number }[]
}

export async function criarCanal(empresaId: string, lojaId: string, phoneNumberId: string, modo: 'coexistence' | 'api', politica: Record<string, unknown>): Promise<CanalWhatsapp> {
  const { data, error } = await sb.from('canais_whatsapp').insert({
    empresa_id: empresaId,
    loja_id: lojaId,
    phone_number_id: phoneNumberId,
    modo,
    status: 'conectado',
    politica,
  }).select('id, empresa_id, loja_id, phone_number_id, modo, status, politica').single()
  if (error) throw traduzirErro(error)
  const r = data as Record<string, unknown>
  return {
    id: String(r.id),
    empresa_id: String(r.empresa_id),
    loja_id: String(r.loja_id),
    phone_number_id: (r.phone_number_id as string | null) ?? null,
    modo: (r.modo as 'coexistence' | 'api') ?? modo,
    status: (r.status as CanalWhatsapp['status']) ?? 'conectado',
    politica: (r.politica as Record<string, unknown>) ?? {},
  }
}

export async function atualizarCanal(canalId: string, patch: { status?: CanalWhatsapp['status']; politica?: Record<string, unknown>; escopo_piloto?: Record<string, unknown> }): Promise<void> {
  const { error } = await sb.from('canais_whatsapp').update({ ...patch, atualizado_em: new Date().toISOString() }).eq('id', canalId)
  if (error) throw traduzirErro(error)
}

export async function removerCanal(canalId: string): Promise<void> {
  const { error } = await sb.from('canais_whatsapp').delete().eq('id', canalId)
  if (error) throw traduzirErro(error)
}

export async function listarCanais(empresaId: string): Promise<CanalWhatsapp[]> {
  const { data, error } = await sb
    .from('canais_whatsapp')
    .select('id, empresa_id, loja_id, phone_number_id, modo, status, politica')
    .eq('empresa_id', empresaId)
    .order('criado_em', { ascending: false })
  if (error) throw traduzirErro(error)
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    id: String(r.id),
    empresa_id: String(r.empresa_id),
    loja_id: String(r.loja_id),
    phone_number_id: (r.phone_number_id as string | null) ?? null,
    modo: (r.modo as 'coexistence' | 'api') ?? 'api',
    status: (r.status as CanalWhatsapp['status']) ?? 'pendente',
    politica: (r.politica as Record<string, unknown>) ?? {},
  }))
}

export interface ResumoUso {
  dias: { dia: string; in: number; out: number; tokens: number; custo: number; pedidos: number }[]
  totais: { in: number; out: number; tokens: number; custo: number; pedidos: number; conversas: number; bot: number; humano: number; encerrada: number }
  topSemResposta: string[]
}

export async function resumoUso(empresaId: string, lojaId?: string, dias = 30): Promise<ResumoUso> {
  const desde = new Date()
  desde.setDate(desde.getDate() - (dias - 1))
  desde.setHours(0, 0, 0, 0)
  const desdeIso = desde.toISOString()

  const canais = await listarCanais(empresaId)
  const canalIds = (lojaId ? canais.filter(c => c.loja_id === lojaId) : canais).map(c => c.id)
  if (!canalIds.length) {
    return { dias: [], totais: { in: 0, out: 0, tokens: 0, custo: 0, pedidos: 0, conversas: 0, bot: 0, humano: 0, encerrada: 0 }, topSemResposta: [] }
  }

  // conversas dos canais
  const { data: convs } = await sb.from('whatsapp_conversas').select('id, estado, canal_id').in('canal_id', canalIds)
  const convList = (convs ?? []) as Record<string, unknown>[]
  const convIds = convList.map(c => String(c.id))

  // mensagens
  let msgs: Record<string, unknown>[] = []
  if (convIds.length) {
    const { data } = await sb.from('whatsapp_mensagens').select('conversa_id, direcao, texto, tokens_entrada, tokens_saida, custo_usd, criado_em').in('conversa_id', convIds).gte('criado_em', desdeIso)
    msgs = (data ?? []) as Record<string, unknown>[]
  }

  // pedidos whatsapp da loja/empresa
  let q = sb.from('pedidos').select('id, criado_em').eq('empresa_id', empresaId).eq('origem', 'whatsapp').gte('criado_em', desdeIso)
  if (lojaId) q = q.eq('loja_id', lojaId)
  const { data: peds } = await q
  const pedidos = (peds ?? []) as Record<string, unknown>[]

  // agrupa por dia
  const mapa = new Map<string, { in: number; out: number; tokens: number; custo: number; pedidos: number }>()
  for (let i = 0; i < dias; i++) {
    const d = new Date(desde)
    d.setDate(d.getDate() + i)
    const key = d.toISOString().slice(0, 10)
    mapa.set(key, { in: 0, out: 0, tokens: 0, custo: 0, pedidos: 0 })
  }
  for (const m of msgs) {
    const key = String(m.criado_em).slice(0, 10)
    if (!mapa.has(key)) continue
    const b = mapa.get(key)!
    if (m.direcao === 'in') b.in++
    else b.out++
    b.tokens += Number(m.tokens_entrada ?? 0) + Number(m.tokens_saida ?? 0)
    b.custo += Number(m.custo_usd ?? 0)
  }
  for (const p of pedidos) {
    const key = String(p.criado_em).slice(0, 10)
    if (mapa.has(key)) mapa.get(key)!.pedidos++
  }

  const diasArr = [...mapa.entries()].map(([dia, v]) => ({ dia, ...v }))

  const totais = diasArr.reduce((a, d) => ({
    in: a.in + d.in, out: a.out + d.out, tokens: a.tokens + d.tokens,
    custo: a.custo + d.custo, pedidos: a.pedidos + d.pedidos,
    conversas: convList.length,
    bot: convList.filter(c => c.estado === 'bot').length,
    humano: convList.filter(c => c.estado === 'humano').length,
    encerrada: convList.filter(c => c.estado === 'encerrada').length,
  }), { in: 0, out: 0, tokens: 0, custo: 0, pedidos: 0, conversas: convList.length, bot: convList.filter(c => c.estado === 'bot').length, humano: convList.filter(c => c.estado === 'humano').length, encerrada: convList.filter(c => c.estado === 'encerrada').length })

  // top perguntas sem resposta: in seguida de out contendo "atendente" ou "não consegui"
  const porConversa = new Map<string, Record<string, unknown>[]>()
  for (const m of msgs) {
    const cid = String(m.conversa_id)
    if (!porConversa.has(cid)) porConversa.set(cid, [])
    porConversa.get(cid)!.push(m)
  }
  const semResposta: string[] = []
  for (const arr of porConversa.values()) {
    arr.sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)))
    for (let i = 0; i < arr.length; i++) {
      const m = arr[i]
      if (m.direcao !== 'in') continue
      const prox = arr[i + 1]
      const textoOut = prox && prox.direcao === 'out' ? String(prox.texto ?? '') : ''
      if (/atendente|não consegui|nao consegui/i.test(textoOut)) {
        semResposta.push(String(m.texto ?? ''))
      }
    }
  }

  return { dias: diasArr, totais, topSemResposta: semResposta.slice(0, 10) }
}
export async function listarConversas(empresaId: string, lojaId?: string): Promise<ConversaWhatsapp[]> {
  let q = sb
    .from('whatsapp_conversas')
    .select('id, canal_id, contato_id, estado, atualizado_em, whatsapp_contatos(telefone_e164, nome_perfil), canais_whatsapp(loja_id)')
    .order('atualizado_em', { ascending: false })
    .limit(100)
  const { data, error } = await q
  if (error) throw traduzirErro(error)
  const convs = (data ?? []) as Record<string, unknown>[]
  // filtra por empresa (via canal)
  const canais = await listarCanais(empresaId)
  const canalIds = new Set(canais.map(c => c.id))
  const filtradas = convs.filter(c => canalIds.has(String(c.canal_id)))
  const filtradasLoja = lojaId ? filtradas.filter(c => {
    const cn = c.canais_whatsapp as Record<string, unknown> | null
    return cn?.loja_id === lojaId
  }) : filtradas

  // preview: última mensagem de cada conversa
  const ids = filtradasLoja.map(c => String(c.id))
  const previews = new Map<string, string>()
  if (ids.length) {
    const { data: msgs } = await sb
      .from('whatsapp_mensagens')
      .select('conversa_id, texto, criado_em')
      .in('conversa_id', ids)
      .order('criado_em', { ascending: false })
    for (const m of (msgs ?? []) as Record<string, unknown>[]) {
      const cid = String(m.conversa_id)
      if (!previews.has(cid) && m.texto) previews.set(cid, String(m.texto))
    }
  }

  return filtradasLoja.map(c => {
    const contato = c.whatsapp_contatos as Record<string, unknown> | null
    return {
      id: String(c.id),
      canal_id: String(c.canal_id),
      contato_id: String(c.contato_id),
      telefone: String(contato?.telefone_e164 ?? ''),
      nome_perfil: (contato?.nome_perfil as string | null) ?? null,
      estado: (c.estado as ConversaWhatsapp['estado']) ?? 'bot',
      atualizado_em: String(c.atualizado_em),
      preview: previews.get(String(c.id)) ?? null,
    }
  })
}

export async function listarMensagens(conversaId: string): Promise<MensagemWhatsapp[]> {
  const { data, error } = await sb
    .from('whatsapp_mensagens')
    .select('id, direcao, tipo, texto, criado_em')
    .eq('conversa_id', conversaId)
    .order('criado_em', { ascending: true })
  if (error) throw traduzirErro(error)
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    id: String(r.id),
    direcao: (r.direcao as 'in' | 'out') ?? 'in',
    tipo: String(r.tipo ?? 'text'),
    texto: (r.texto as string | null) ?? null,
    criado_em: String(r.criado_em),
  }))
}

export async function pausarConversa(conversaId: string): Promise<void> {
  const { error } = await sb.from('whatsapp_conversas').update({ estado: 'humano', atualizado_em: new Date().toISOString() }).eq('id', conversaId)
  if (error) throw traduzirErro(error)
}

export async function retomarConversa(conversaId: string): Promise<void> {
  const { error } = await sb.from('whatsapp_conversas').update({ estado: 'bot', atualizado_em: new Date().toISOString() }).eq('id', conversaId)
  if (error) throw traduzirErro(error)
}

export async function encerrarConversa(conversaId: string): Promise<void> {
  const { error } = await sb.from('whatsapp_conversas').update({ estado: 'encerrada', atualizado_em: new Date().toISOString() }).eq('id', conversaId)
  if (error) throw traduzirErro(error)
}

export async function listarPedidos(empresaId: string, lojaId?: string, status?: string): Promise<PedidoWhatsapp[]> {
  let q = sb.from('pedidos').select('id, numero, status, retirada_ou_entrega, total_centavos, criado_em, whatsapp_contatos(telefone_e164), pedidos_itens(nome_snapshot, qtd, subtotal_centavos)').eq('empresa_id', empresaId).order('criado_em', { ascending: false }).limit(100)
  if (lojaId) q = q.eq('loja_id', lojaId)
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw traduzirErro(error)
  return ((data ?? []) as Record<string, unknown>[]).map(r => {
    const contato = r.whatsapp_contatos as Record<string, unknown> | null
    const itens = (r.pedidos_itens as Record<string, unknown>[] | null) ?? []
    return {
      id: String(r.id),
      numero: Number(r.numero),
      status: (r.status as PedidoWhatsapp['status']) ?? 'aguardando_confirmacao',
      retirada_ou_entrega: (r.retirada_ou_entrega as 'retirada' | 'entrega') ?? 'retirada',
      total_centavos: Number(r.total_centavos ?? 0),
      criado_em: String(r.criado_em),
      contato_telefone: (contato?.telefone_e164 as string | null) ?? null,
      itens: itens.map(i => ({
        nome: String(i.nome_snapshot),
        qtd: Number(i.qtd),
        subtotal_centavos: Number(i.subtotal_centavos),
      })),
    }
  })
}

export async function confirmarPedido(pedidoId: string): Promise<void> {
  const { error } = await sb.rpc('confirmar_pedido', { p_empresa: (await sb.from('pedidos').select('empresa_id').eq('id', pedidoId).single()).data?.empresa_id, p_pedido: pedidoId, p_usuario: (await sb.auth.getUser()).data.user?.id })
  if (error) throw traduzirErro(error)
}

export async function cancelarPedido(pedidoId: string, motivo: string): Promise<void> {
  const { error } = await sb.from('pedidos').update({ status: 'cancelado', observacao: motivo, atualizado_em: new Date().toISOString() }).eq('id', pedidoId)
  if (error) throw traduzirErro(error)
}
