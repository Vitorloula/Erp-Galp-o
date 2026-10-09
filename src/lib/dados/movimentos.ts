import type { FiltroMovimentacoes, Lote, Movimentacao, NovaCorrecao, NovaEntrada, NovaSaida, NovoAjuste } from '../tipos'
import { buscarTudo, exigir, num, sb, traduzirErro, type ErroBanco } from './cliente'

function paraLote(r: Record<string, unknown>): Lote {
  return {
    lote_id: r.lote_id as string,
    produto_id: r.produto_id as string,
    lote: (r.lote as string) ?? '',
    validade: (r.validade as string | null) ?? null,
    saldo: num(r.saldo),
    ultima_movimentacao: (r.ultima_movimentacao as string | null) ?? null,
  }
}

function paraMov(r: Record<string, unknown>): Movimentacao {
  return { ...(r as unknown as Movimentacao), id: num(r.id), quantidade: num(r.quantidade), delta: num(r.delta), referencia_id: r.referencia_id === null ? null : num(r.referencia_id) }
}

/** Lotes com saldo (ou que já tiveram) na loja. */
export function listarSaldos(empresaId: string, lojaId: string): Promise<Lote[]> {
  return buscarTudo(
    (de, ate) =>
      sb
        .from('vw_estoque')
        .select('lote_id, produto_id, lote, validade, saldo, ultima_movimentacao')
        .eq('empresa_id', empresaId)
        .eq('loja_id', lojaId)
        .order('lote_id')
        .range(de, ate),
    paraLote,
  )
}

const COLUNAS_MOV =
  'id, ocorrido_em, registrado_em, tipo, loja_id, lote_id, produto_id, quantidade, delta, documento, observacao, referencia_id, origem, usuario_id, usuario_nome'

export function listarMovimentacoes(empresaId: string, lojaId: string, f: FiltroMovimentacoes = {}): Promise<Movimentacao[]> {
  return buscarTudo(
    (de, ate) => {
      let q = sb.from('movimentacoes').select(COLUNAS_MOV).eq('empresa_id', empresaId).eq('loja_id', lojaId)
      if (f.desde) q = q.gte('ocorrido_em', f.desde)
      if (f.ate) q = q.lte('ocorrido_em', f.ate)
      if (f.produtoId) q = q.eq('produto_id', f.produtoId)
      if (f.loteId) q = q.eq('lote_id', f.loteId)
      if (f.referenciaId) q = q.eq('referencia_id', f.referenciaId)
      return q.order('ocorrido_em', { ascending: false }).order('id', { ascending: false }).range(de, ate)
    },
    paraMov,
    f.limite,
  )
}

/** Entrada (cria o lote se preciso). A empresa vem do produto, conferida pelo banco. */
export async function registrarEntrada(lojaId: string, e: NovaEntrada, origemId: string): Promise<number> {
  const { data, error } = await sb.rpc('registrar_entrada', {
    p_loja_id: lojaId,
    p_produto_id: e.produtoId,
    p_lote: e.lote,
    p_validade: e.validade,
    p_quantidade: e.quantidade,
    p_documento: e.documento || null,
    p_observacao: e.observacao || null,
    p_origem_id: origemId,
  })
  if (error) throw traduzirErro(error)
  return Number(data)
}

/**
 * Lançamento manual no razão. O origemId (gerado uma vez por formulário) torna o reenvio
 * seguro: se a primeira tentativa gravou e só a resposta se perdeu, não duplica.
 */
async function lancar(dados: Record<string, unknown>, origemId: string): Promise<number> {
  const { data, error } = await sb
    .from('movimentacoes')
    .insert({ ...dados, origem_id: origemId })
    .select('id')
    .single()
  if (!error) return Number(data.id)
  if (jaGravado(error)) {
    const existente = exigir(await sb.from('movimentacoes').select('id').eq('origem_id', origemId).single())
    return Number(existente!.id)
  }
  throw traduzirErro(error)
}

const jaGravado = (e: ErroBanco) => e.code === '23505' && `${e.message} ${e.details ?? ''}`.includes('origem_id')

export function registrarSaida(empresaId: string, lojaId: string, s: NovaSaida, origemId: string) {
  return lancar(
    { empresa_id: empresaId, loja_id: lojaId, tipo: 'SAIDA', lote_id: s.loteId, quantidade: s.quantidade, documento: s.documento || null, observacao: s.observacao || null },
    origemId,
  )
}

export function registrarAjuste(empresaId: string, lojaId: string, a: NovoAjuste, origemId: string) {
  return lancar({ empresa_id: empresaId, loja_id: lojaId, tipo: 'AJUSTE', lote_id: a.loteId, quantidade: a.quantidade, observacao: a.observacao }, origemId)
}

export function registrarCorrecao(empresaId: string, lojaId: string, c: NovaCorrecao, origemId: string) {
  return lancar(
    { empresa_id: empresaId, loja_id: lojaId, tipo: 'CORRECAO', lote_id: c.loteId, quantidade: c.quantidade, observacao: c.observacao, referencia_id: c.referenciaId },
    origemId,
  )
}
