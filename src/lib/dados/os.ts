import { buscarTudo, exigir, num, numOuNulo, sb, traduzirErro } from './cliente'
import { osCombina } from '../servicos'
import type { DadosOS, ItemOS, ItemOSDados, OS, PagamentoOS, StatusOS } from '../tipos'

/**
 * Módulo Serviços (T-038): online-first, sem fila offline (Decisão 8) — as regras
 * (papel, transição, pagamento, baixa FEFO) ficam todas no banco.
 */

const COLUNAS_OS =
  'id, loja_id, numero, status, cliente_nome, cliente_telefone, cliente_documento, aparelho_tipo, aparelho_marca_modelo, aparelho_serie_imei, aparelho_cor, aparelho_acessorios, aparelho_estado, defeito_relatado, diagnostico, prazo_prometido, valor_mao_de_obra, desconto, garantia_dias, tecnico_id, tecnico_nome, criado_em, criado_por_nome, orcado_em, aprovada_em, aprovada_por_nome, pronta_em, entregue_em, entregue_por_nome, cancelada_em, cancelada_por_nome, motivo_cancelamento'

function paraOS(r: Record<string, unknown>): OS {
  return {
    ...(r as unknown as OS),
    numero: num(r.numero),
    valor_mao_de_obra: num(r.valor_mao_de_obra),
    desconto: num(r.desconto),
    garantia_dias: numOuNulo(r.garantia_dias),
  }
}

export interface FiltroOS {
  status?: StatusOS
  /** Grupo de trabalho (atalhos do Painel e chip composto da lista). */
  grupo?: 'em_andamento'
  /** Atrasadas: prazo vencido e não entregue/cancelada. */
  atrasadas?: boolean
  /** OS sem prazo prometido. */
  semPrazo?: boolean
  /** Texto livre: cliente, telefone, IMEI, marca/modelo, defeito ou número. */
  texto?: string
}

/**
 * Ordens da loja, das mais recentes para as mais antigas. Status é filtrado no
 * banco; grupo/atrasadas/sem prazo/busca ficam no aparelho (usa os helpers puros
 * de `lib/servicos.ts`, atrasada precisa de "hoje" local).
 */
export function listarOrdens(empresaId: string, lojaId: string, f: FiltroOS = {}, limite = 1000): Promise<OS[]> {
  return buscarTudo(
    (de, ate) => {
      let q = sb.from('ordens_servico').select(COLUNAS_OS).eq('empresa_id', empresaId).eq('loja_id', lojaId)
      if (f.status) q = q.eq('status', f.status)
      return q.order('numero', { ascending: false }).range(de, ate)
    },
    paraOS,
    limite,
  ).then(ordens => {
    const hoje = new Date().toISOString().slice(0, 10)
    return ordens.filter(os => {
      if (f.grupo === 'em_andamento' && !['aberta', 'em_diagnostico', 'em_execucao'].includes(os.status)) return false
      if (f.atrasadas && !(os.prazo_prometido && os.prazo_prometido < hoje && os.status !== 'entregue' && os.status !== 'cancelada'))
        return false
      if (f.semPrazo && !(!os.prazo_prometido && os.status !== 'entregue' && os.status !== 'cancelada')) return false
      if (f.texto && !osCombina(os, f.texto)) return false
      return true
    })
  })
}

/** Recebe o aparelho e abre a OS (numeração e carimbos vêm do servidor). */
export async function criarOrdem(empresaId: string, lojaId: string, dados: DadosOS): Promise<{ id: string; numero: number }> {
  const r = await sb
    .from('ordens_servico')
    .insert({
      empresa_id: empresaId,
      loja_id: lojaId,
      cliente_nome: dados.cliente_nome.trim(),
      cliente_telefone: dados.cliente_telefone.trim() || null,
      cliente_documento: dados.cliente_documento.trim() || null,
      aparelho_tipo: dados.aparelho_tipo.trim() || null,
      aparelho_marca_modelo: dados.aparelho_marca_modelo.trim() || null,
      aparelho_serie_imei: dados.aparelho_serie_imei.trim() || null,
      aparelho_cor: dados.aparelho_cor.trim() || null,
      aparelho_senha: dados.aparelho_senha.trim() || null,
      aparelho_acessorios: dados.aparelho_acessorios.trim() || null,
      aparelho_estado: dados.aparelho_estado.trim() || null,
      defeito_relatado: dados.defeito_relatado.trim() || null,
      prazo_prometido: dados.prazo_prometido || null,
      tecnico_nome: dados.tecnico_nome.trim() || null,
    })
    .select('id, numero')
    .single()
  if (r.error) throw traduzirErro(r.error)
  return { id: r.data.id as string, numero: num(r.data.numero) }
}

export interface DetalheOS {
  os: OS
  itens: ItemOS[]
  pagamentos: PagamentoOS[]
}

/** OS completa (com a senha do aparelho, oculta na tela), itens e pagamentos. */
export async function detalheDaOrdem(osId: string): Promise<DetalheOS> {
  const [osR, itensR, pagamentosR] = await Promise.all([
    sb.from('ordens_servico').select(`${COLUNAS_OS}, aparelho_senha`).eq('id', osId).single(),
    sb
      .from('os_itens')
      .select('id, os_id, ordem, origem, produto_id, descricao, quantidade, preco_unitario, total, baixado_em')
      .eq('os_id', osId)
      .order('ordem'),
    sb.from('os_pagamentos').select('id, forma, valor, registrado_em, registrado_por_nome').eq('os_id', osId).order('registrado_em'),
  ])
  if (osR.error) throw traduzirErro(osR.error)
  const itens = ((exigir(itensR) ?? []) as Record<string, unknown>[]).map(r => ({
    id: r.id as string,
    os_id: r.os_id as string,
    ordem: num(r.ordem),
    origem: r.origem as ItemOS['origem'],
    produto_id: (r.produto_id as string | null) ?? null,
    descricao: r.descricao as string,
    quantidade: num(r.quantidade),
    preco_unitario: num(r.preco_unitario),
    total: num(r.total),
    baixado_em: (r.baixado_em as string | null) ?? null,
    garantia_meses: null as number | null,
  }))
  // A garantia das peças (meses) alimenta a sugestão de garantia da OS (Decisão 11).
  const idsProduto = [...new Set(itens.filter(i => i.produto_id).map(i => i.produto_id as string))]
  if (idsProduto.length) {
    const garantias = (exigir(await sb.from('produtos').select('id, garantia_meses').in('id', idsProduto)) ?? []) as Record<
      string,
      unknown
    >[]
    const porProduto = new Map(garantias.map(g => [g.id as string, numOuNulo(g.garantia_meses)]))
    for (const i of itens) if (i.produto_id) i.garantia_meses = porProduto.get(i.produto_id) ?? null
  }
  return {
    os: paraOS(osR.data as Record<string, unknown>),
    itens,
    pagamentos: ((exigir(pagamentosR) ?? []) as Record<string, unknown>[]).map(r => ({
      id: r.id as string,
      forma: r.forma as string,
      valor: num(r.valor),
      registrado_em: r.registrado_em as string,
      registrado_por_nome: (r.registrado_por_nome as string | null) ?? null,
    })),
  }
}

/** Campos da OS que a tela edita direto (o status só muda por os_mudar_status). */
export type CamposEditaveisOS = Partial<
  Pick<OS, 'defeito_relatado' | 'diagnostico' | 'prazo_prometido' | 'garantia_dias' | 'valor_mao_de_obra' | 'desconto' | 'tecnico_id' | 'tecnico_nome'>
>

export async function salvarOrdem(osId: string, campos: CamposEditaveisOS): Promise<void> {
  exigir(await sb.from('ordens_servico').update(campos).eq('id', osId))
}

/** Define (substitui) os itens do orçamento — só até a aprovação (o banco trava). */
export async function definirItens(osId: string, itens: ItemOSDados[]): Promise<void> {
  const { error } = await sb.rpc('os_definir_itens', { p_os: osId, p_itens: itens })
  if (error) throw traduzirErro(error)
}

/** Move a OS na cadeia; o banco valida papel, transição, pagamento e estoque. */
export async function mudarStatus(osId: string, status: StatusOS, motivo?: string): Promise<void> {
  const { error } = await sb.rpc('os_mudar_status', { p_os: osId, p_status: status, p_motivo: motivo?.trim() || null })
  if (error) throw traduzirErro(error)
}

/** Registra um pagamento na própria OS (dono/gerente/caixa, com a OS pronta). */
export async function registrarPagamento(empresaId: string, lojaId: string, osId: string, forma: string, valor: number): Promise<PagamentoOS> {
  const r = await sb
    .from('os_pagamentos')
    .insert({ empresa_id: empresaId, loja_id: lojaId, os_id: osId, forma, valor })
    .select('id, forma, valor, registrado_em, registrado_por_nome')
    .single()
  if (r.error) throw traduzirErro(r.error)
  return {
    id: r.data.id as string,
    forma: r.data.forma as string,
    valor: num(r.data.valor),
    registrado_em: r.data.registrado_em as string,
    registrado_por_nome: (r.data.registrado_por_nome as string | null) ?? null,
  }
}

/** Itens de várias OS (relatórios/exportação), em blocos para a URL não crescer demais. */
export async function itensDasOrdens(osIds: string[]): Promise<ItemOS[]> {
  if (!osIds.length) return []
  const linhas: ItemOS[] = []
  for (let i = 0; i < osIds.length; i += 150) {
    const r = exigir(
      await sb
        .from('os_itens')
        .select('id, os_id, ordem, origem, produto_id, descricao, quantidade, preco_unitario, total, baixado_em')
        .in('os_id', osIds.slice(i, i + 150)),
    ) as Record<string, unknown>[]
    linhas.push(
      ...r.map(it => ({
        id: it.id as string,
        os_id: it.os_id as string,
        ordem: num(it.ordem),
        origem: it.origem as ItemOS['origem'],
        produto_id: (it.produto_id as string | null) ?? null,
        descricao: it.descricao as string,
        quantidade: num(it.quantidade),
        preco_unitario: num(it.preco_unitario),
        total: num(it.total),
        baixado_em: (it.baixado_em as string | null) ?? null,
        garantia_meses: null,
      })),
    )
  }
  return linhas
}

/** Pagamentos de várias OS (relatórios), em blocos para a URL não crescer demais. */
export async function pagamentosDasOrdens(osIds: string[]): Promise<(PagamentoOS & { os_id: string })[]> {
  if (!osIds.length) return []
  const linhas: (PagamentoOS & { os_id: string })[] = []
  for (let i = 0; i < osIds.length; i += 150) {
    const r = exigir(
      await sb.from('os_pagamentos').select('os_id, id, forma, valor, registrado_em, registrado_por_nome').in('os_id', osIds.slice(i, i + 150)),
    ) as Record<string, unknown>[]
    linhas.push(
      ...r.map(p => ({
        os_id: p.os_id as string,
        id: p.id as string,
        forma: p.forma as string,
        valor: num(p.valor),
        registrado_em: p.registrado_em as string,
        registrado_por_nome: (p.registrado_por_nome as string | null) ?? null,
      })),
    )
  }
  return linhas
}
