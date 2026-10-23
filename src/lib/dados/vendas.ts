import { buscarTudo, exigir, num, numOuNulo, sb, traduzirErro } from './cliente'
import type { Produto } from '../tipos'

export interface Caixa {
  id: string
  loja_id: string
  numero: number
  nome: string
  ativo: boolean
  dispositivo_em: string | null
}

export interface Venda {
  id: string
  caixa_id: string
  numero: number
  ocorrido_em: string
  operador_nome: string | null
  subtotal: number
  desconto: number
  total: number
  troco: number
  status: 'concluida' | 'cancelada'
  cancelada_em: string | null
  cancelada_por_nome: string | null
  motivo_cancelamento: string | null
  relogio_suspeito: boolean
  nfce_status: 'pendente' | 'emitida' | 'cancelada' | 'erro'
  nfce_chave: string | null
  nfce_qrcode: string | null
  cliente_cpf: string | null
}

export interface ItemVenda {
  id: string
  ordem: number
  descricao: string
  quantidade: number
  unidade: string
  preco_unitario: number
  desconto: number
  total: number
}

export interface PagamentoVenda {
  forma: string
  valor: number
}

export interface Sessao {
  id: string
  caixa_id: string
  operador_nome: string | null
  aberta_em: string
  fechada_em: string | null
  valor_abertura: number
  fechamento: { contado: Record<string, number>; esperado: Record<string, number>; diferenca_dinheiro: number } | null
}

export interface Divergencia {
  id: string
  tipo: string
  descricao: string
  venda_id: string | null
  produto_id: string | null
  criado_em: string
  resolvida_em: string | null
  resolvida_por_nome: string | null
  resolucao: string | null
}

const paraVenda = (r: Record<string, unknown>): Venda => ({
  ...(r as unknown as Venda),
  numero: num(r.numero),
  subtotal: num(r.subtotal),
  desconto: num(r.desconto),
  total: num(r.total),
  troco: num(r.troco),
  nfce_status: (r.nfce_status as Venda['nfce_status']) ?? 'pendente',
  nfce_chave: (r.nfce_chave as string | null) ?? null,
  nfce_qrcode: (r.nfce_qrcode as string | null) ?? null,
  cliente_cpf: (r.cliente_cpf as string | null) ?? null,
})

export async function listarCaixas(empresaId: string, lojaId?: string): Promise<Caixa[]> {
  let q = sb.from('caixas').select('id, loja_id, numero, nome, ativo, dispositivo_em').eq('empresa_id', empresaId)
  if (lojaId) q = q.eq('loja_id', lojaId)
  return (exigir(await q.order('numero')) as Caixa[]).map(c => ({ ...c, numero: num(c.numero) }))
}

export async function salvarCaixa(empresaId: string, lojaId: string, dados: { nome: string; ativo?: boolean }, id?: string) {
  if (!dados.nome.trim()) throw new Error('Informe o nome do caixa.')
  const r = id
    ? await sb.from('caixas').update({ nome: dados.nome.trim(), ativo: dados.ativo ?? true }).eq('id', id).select('id').single()
    : await sb.from('caixas').insert({ empresa_id: empresaId, loja_id: lojaId, nome: dados.nome.trim() }).select('id').single()
  if (r.error) throw r.error.code === 'PGRST116' ? new Error('Somente dono ou gerente cadastram caixas.') : traduzirErro(r.error)
}

export function listarVendas(empresaId: string, lojaId: string, f: { desde: string; ate: string }): Promise<Venda[]> {
  return buscarTudo(
    (de, ate) =>
      sb
        .from('vendas')
        .select('id, caixa_id, numero, ocorrido_em, operador_nome, subtotal, desconto, total, troco, status, cancelada_em, cancelada_por_nome, motivo_cancelamento, relogio_suspeito, nfce_status, nfce_chave, nfce_qrcode, cliente_cpf')
        .eq('empresa_id', empresaId)
        .eq('loja_id', lojaId)
        .gte('ocorrido_em', f.desde)
        .lte('ocorrido_em', f.ate)
        .order('ocorrido_em', { ascending: false })
        .range(de, ate),
    paraVenda,
  )
}

export async function pagamentosDasVendas(vendaIds: string[]): Promise<(PagamentoVenda & { venda_id: string })[]> {
  if (!vendaIds.length) return []
  const linhas: (PagamentoVenda & { venda_id: string })[] = []
  // Em blocos, para a URL não ficar grande demais.
  for (let i = 0; i < vendaIds.length; i += 150) {
    const r = exigir(await sb.from('vendas_pagamentos').select('venda_id, forma, valor').in('venda_id', vendaIds.slice(i, i + 150))) as {
      venda_id: string
      forma: string
      valor: unknown
    }[]
    linhas.push(...r.map(p => ({ ...p, valor: num(p.valor) })))
  }
  return linhas
}

export async function detalheDaVenda(vendaId: string): Promise<{ itens: ItemVenda[]; pagamentos: PagamentoVenda[] }> {
  const [itens, pagamentos] = await Promise.all([
    sb.from('vendas_itens').select('id, ordem, descricao, quantidade, unidade, preco_unitario, desconto, total').eq('venda_id', vendaId).order('ordem'),
    sb.from('vendas_pagamentos').select('forma, valor').eq('venda_id', vendaId),
  ])
  return {
    itens: (exigir(itens) as ItemVenda[]).map(i => ({ ...i, quantidade: num(i.quantidade), preco_unitario: num(i.preco_unitario), desconto: num(i.desconto), total: num(i.total) })),
    pagamentos: (exigir(pagamentos) as PagamentoVenda[]).map(p => ({ ...p, valor: num(p.valor) })),
  }
}

export async function cancelarVenda(vendaId: string, motivo: string) {
  if (motivo.trim().length < 3) throw new Error('Informe o motivo do cancelamento.')
  exigir(await sb.rpc('cancelar_venda', { p_venda: vendaId, p_motivo: motivo.trim() }))
}

/** Registra o resultado da emissão da NFC-e numa venda (chave/QR Code/estado). */
export async function salvarNFCe(vendaId: string, dados: { status: 'emitida' | 'cancelada' | 'erro'; chave?: string | null; qrcode?: string | null }) {
  exigir(
    await sb
      .from('vendas')
      .update({ nfce_status: dados.status, nfce_chave: dados.chave ?? null, nfce_qrcode: dados.qrcode ?? null })
      .eq('id', vendaId)
      .select('id')
      .single(),
  )
}

/** Estado da NFC-e de uma venda, para o cancelamento. */
export async function buscarVendaParaCancelamento(vendaId: string): Promise<{ nfce_status: Venda['nfce_status']; nfce_chave: string | null } | null> {
  const r = await sb.from('vendas').select('nfce_status, nfce_chave').eq('id', vendaId).single()
  if (r.error) return null
  return { nfce_status: (r.data.nfce_status as Venda['nfce_status']) ?? 'pendente', nfce_chave: (r.data.nfce_chave as string | null) ?? null }
}

/** Venda aguardando emissão da NFC-e (para a fila). */
export interface VendaPendenteNFCe {
  id: string
  caixa_id: string
  numero: number
  total: number
  ocorrido_em: string
  cliente_cpf: string | null
}

/** Vendas com NFC-e pendente, na ordem em que aconteceram. */
export function listarVendasPendentes(empresaId: string, lojaId: string): Promise<VendaPendenteNFCe[]> {
  return buscarTudo(
    (de, ate) =>
      sb
        .from('vendas')
        .select('id, caixa_id, numero, total, ocorrido_em, cliente_cpf')
        .eq('empresa_id', empresaId)
        .eq('loja_id', lojaId)
        .eq('nfce_status', 'pendente')
        .order('ocorrido_em')
        .range(de, ate),
    r => ({ id: r.id as string, caixa_id: r.caixa_id as string, numero: num(r.numero), total: num(r.total), ocorrido_em: r.ocorrido_em as string, cliente_cpf: (r.cliente_cpf as string | null) ?? null }),
  )
}

/** Item da venda com os campos fiscais do produto (para montar a NFC-e). */
export interface ItemFiscalVenda {
  produto: Pick<Produto, 'codigo_interno' | 'nome' | 'unidade' | 'ncm' | 'cfop' | 'cst_csosn' | 'origem' | 'ibs_aliquota' | 'cbs_aliquota'> | null
  quantidade: number
  valor: number
}

/** Itens da venda já cruzados com o produto (NCM/CFOP/CST/origem/IBS/CBS). */
export async function itensFiscaisDaVenda(vendaId: string): Promise<ItemFiscalVenda[]> {
  const itens = exigir(await sb.from('vendas_itens').select('produto_id, quantidade, total').eq('venda_id', vendaId)) as {
    produto_id: string
    quantidade: number
    total: number
  }[]
  const ids = [...new Set(itens.map(i => i.produto_id))]
  const produtos = ids.length
    ? (exigir(await sb.from('produtos').select('id, codigo_interno, nome, unidade, ncm, cfop, cst_csosn, origem, ibs_aliquota, cbs_aliquota').in('id', ids)) as Record<string, unknown>[])
    : []
  const porId = new Map(produtos.map(p => [p.id as string, p]))
  return itens.map(i => {
    const p = porId.get(i.produto_id)
    return {
      produto: p
        ? {
            codigo_interno: p.codigo_interno as string,
            nome: p.nome as string,
            unidade: p.unidade as Produto['unidade'],
            ncm: (p.ncm as string | null) ?? null,
            cfop: (p.cfop as string | null) ?? null,
            cst_csosn: (p.cst_csosn as string | null) ?? null,
            origem: numOuNulo(p.origem),
            ibs_aliquota: numOuNulo(p.ibs_aliquota),
            cbs_aliquota: numOuNulo(p.cbs_aliquota),
          }
        : null,
      quantidade: num(i.quantidade),
      valor: num(i.total),
    }
  })
}

export async function listarSessoes(empresaId: string, lojaId: string, f: { desde: string; ate: string }): Promise<Sessao[]> {
  const sessoes = exigir(
    await sb
      .from('sessoes_caixa')
      .select('id, caixa_id, operador_nome, aberta_em, fechada_em, valor_abertura')
      .eq('empresa_id', empresaId)
      .eq('loja_id', lojaId)
      .gte('aberta_em', f.desde)
      .lte('aberta_em', f.ate)
      .order('aberta_em', { ascending: false }),
  ) as Omit<Sessao, 'fechamento'>[]
  const ids = sessoes.map(s => s.id)
  const fechamentos = ids.length
    ? (exigir(await sb.from('sessoes_caixa_fechamentos').select('sessao_id, contado, esperado, diferenca_dinheiro').in('sessao_id', ids)) as {
        sessao_id: string
        contado: Record<string, number>
        esperado: Record<string, number>
        diferenca_dinheiro: unknown
      }[])
    : []
  const porSessao = new Map(fechamentos.map(f => [f.sessao_id, f]))
  return sessoes.map(s => {
    const f = porSessao.get(s.id)
    return {
      ...s,
      valor_abertura: num(s.valor_abertura),
      fechamento: f ? { contado: f.contado, esperado: f.esperado, diferenca_dinheiro: num(f.diferenca_dinheiro) } : null,
    }
  })
}

export async function listarDivergencias(empresaId: string, lojaId: string, abertas: boolean): Promise<Divergencia[]> {
  let q = sb
    .from('divergencias')
    .select('id, tipo, descricao, venda_id, produto_id, criado_em, resolvida_em, resolvida_por_nome, resolucao')
    .eq('empresa_id', empresaId)
    .eq('loja_id', lojaId)
  q = abertas ? q.is('resolvida_em', null) : q.not('resolvida_em', 'is', null)
  return exigir(await q.order('criado_em', { ascending: false }).limit(500)) as Divergencia[]
}

export async function contarDivergenciasAbertas(empresaId: string, lojaId: string): Promise<number> {
  const { count, error } = await sb
    .from('divergencias')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .eq('loja_id', lojaId)
    .is('resolvida_em', null)
  if (error) throw traduzirErro(error)
  return count ?? 0
}

export async function resolverDivergencia(id: string, resolucao: string) {
  exigir(await sb.rpc('resolver_divergencia', { p_divergencia: id, p_resolucao: resolucao.trim() }))
}
