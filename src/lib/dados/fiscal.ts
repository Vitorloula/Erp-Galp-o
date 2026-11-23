/** Acesso à conferência fiscal e às configurações fiscais da loja. */
import type { Crt, DecisaoNFCe } from '../fiscal'
import { exigir, num, sb, traduzirErro } from './cliente'

export type PoliticaEmissao = 'assistida' | 'automatica'
export type AmbienteFiscal = 'homologacao' | 'producao'

export interface ConfigFiscalLoja {
  crt: Crt | null
  politica_emissao: PoliticaEmissao
  politica_vigencia: string
  modo_conferencia: boolean
  ambiente_fiscal: AmbienteFiscal
  regime_confirmado_em: string | null
}

/** Uma venda do dia com o resultado bruto da conferência (situação é montada no app). */
export interface LinhaConferencia {
  venda_id: string
  numero: number
  caixa_numero: number
  caixa_nome: string
  ocorrido_em: string
  operador_nome: string | null
  total: number
  cliente_cpf: string | null
  nfce_status: string
  nfce_decisao: DecisaoNFCe | null
  nfce_motivo: string | null
  nfce_decidido_em: string | null
  crt: Crt | null
  itens: number
  itens_sem_produto: number
  itens_sem_ncm: number
  produtos_sem_ncm: string[]
}

const paraLinha = (r: Record<string, unknown>): LinhaConferencia => ({
  venda_id: r.venda_id as string,
  numero: num(r.numero),
  caixa_numero: num(r.caixa_numero),
  caixa_nome: (r.caixa_nome as string | null) ?? '',
  ocorrido_em: r.ocorrido_em as string,
  operador_nome: (r.operador_nome as string | null) ?? null,
  total: num(r.total),
  cliente_cpf: (r.cliente_cpf as string | null) ?? null,
  nfce_status: (r.nfce_status as string) ?? 'pendente',
  nfce_decisao: (r.nfce_decisao as DecisaoNFCe | null) ?? null,
  nfce_motivo: (r.nfce_motivo as string | null) ?? null,
  nfce_decidido_em: (r.nfce_decidido_em as string | null) ?? null,
  crt: r.crt === null || r.crt === undefined ? null : (Number(r.crt) as Crt),
  itens: num(r.itens),
  itens_sem_produto: num(r.itens_sem_produto),
  itens_sem_ncm: num(r.itens_sem_ncm),
  produtos_sem_ncm: (r.produtos_sem_ncm as string[] | null) ?? [],
})

/** Vendas concluídas do dia, com os dados da conferência (não envia nada à SEFAZ). */
export async function listarConferencia(empresaId: string, lojaId: string, dia: string): Promise<LinhaConferencia[]> {
  const linhas = exigir(
    await sb.rpc('conferencia_fiscal', { p_empresa: empresaId, p_loja: lojaId, p_dia: dia }),
  ) as Record<string, unknown>[]
  return linhas.map(paraLinha)
}

/**
 * Grava a decisão da loja sobre uma venda: emitir (entra na fila) ou sem nota
 * (com motivo). O banco repete os gates de papel e de dia.
 */
export async function decidirNFCe(vendaId: string, decisao: DecisaoNFCe, motivo?: string) {
  exigir(
    await sb.rpc('decidir_nfce', {
      p_venda: vendaId,
      p_decisao: decisao,
      p_motivo: motivo?.trim() || null,
    }),
  )
}

/**
 * Fecha a conferência de um dia: o que não foi decidido vira "sem nota".
 * Sem `dia`, fecha todos os dias anteriores a hoje. Devolve quantas vendas fechou.
 */
export async function fecharDiaFiscal(empresaId: string, lojaId: string, dia?: string): Promise<number> {
  return num(exigir(await sb.rpc('fechar_dia_fiscal', { p_empresa: empresaId, p_loja: lojaId, p_dia: dia ?? null })))
}

/** Quantas vendas de dias anteriores ficaram sem decisão (e desde quando). */
export async function pendentesAnteriores(empresaId: string, lojaId: string): Promise<{ quantidade: number; primeira: string | null }> {
  const linhas = exigir(await sb.rpc('fiscal_pendentes_anteriores', { p_empresa: empresaId, p_loja: lojaId })) as
    | Record<string, unknown>[]
    | null
  const r = linhas?.[0]
  return { quantidade: num(r?.quantidade), primeira: (r?.primeira as string | null) ?? null }
}

/** Salva o regime e o modo de conferência da loja (somente dono, pela RLS). */
export async function salvarConfigFiscal(lojaId: string, dados: ConfigFiscalLoja) {
  const { error } = await sb
    .from('lojas')
    .update({
      crt: dados.crt,
      politica_emissao: dados.politica_emissao,
      politica_vigencia: dados.politica_vigencia,
      modo_conferencia: dados.modo_conferencia,
      ambiente_fiscal: dados.ambiente_fiscal,
      regime_confirmado_em: dados.crt ? dados.regime_confirmado_em ?? new Date().toISOString() : null,
    })
    .eq('id', lojaId)
    .select('id')
    .single()
  if (error) {
    throw error.code === 'PGRST116'
      ? new Error('Somente o dono altera as configurações fiscais da loja.')
      : traduzirErro(error)
  }
}
