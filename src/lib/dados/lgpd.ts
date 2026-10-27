import { buscarTudo, exigir, sb } from './cliente'

/**
 * Tabelas com dados da empresa exportadas para o titular (LGPD).
 * O export é feito pelo dono; a RLS continua valendo, então nenhuma outra
 * empresa entra no arquivo.
 */
const TABELAS = {
  assinaturas: '*',
  lojas: '*',
  membros: '*',
  // O token_hash não é concedido ao cliente; pedimos só as colunas visíveis.
  convites: 'id, empresa_id, email, papel, lojas, expira_em, aceito_em, aceito_por, cancelado_em, criado_por, criado_em',
  categorias: '*',
  produtos: '*',
  produtos_codigos: '*',
  lotes: '*',
  movimentacoes: '*',
  estoque_saldos: '*',
  caixas: '*',
  sessoes_caixa: '*',
  sessoes_caixa_movimentos: '*',
  sessoes_caixa_fechamentos: '*',
  vendas: '*',
  vendas_itens: '*',
  vendas_pagamentos: '*',
  pdv_eventos: '*',
  divergencias: '*',
} as const

// `buscarTudo` pagina de 1000 em 1000; sem uma ordem estável uma tabela grande
// poderia repetir ou perder linhas entre uma página e outra.
const ORDEM: Record<string, string[]> = {
  assinaturas: ['empresa_id'],
  lojas: ['id'],
  membros: ['usuario_id'],
  convites: ['id'],
  categorias: ['id'],
  produtos: ['id'],
  produtos_codigos: ['id'],
  lotes: ['id'],
  movimentacoes: ['id'],
  estoque_saldos: ['loja_id', 'lote_id'],
  caixas: ['id'],
  sessoes_caixa: ['id'],
  sessoes_caixa_movimentos: ['id'],
  sessoes_caixa_fechamentos: ['sessao_id'],
  vendas: ['id'],
  vendas_itens: ['id'],
  vendas_pagamentos: ['id'],
  pdv_eventos: ['id'],
  divergencias: ['id'],
}

export interface ExportacaoLgpd {
  gerado_em: string
  empresa_id: string
  aviso: string
  tabelas: Record<string, unknown[]>
}

/** Baixa todos os dados da empresa em um JSON legível (portabilidade LGPD). */
export async function exportarDadosEmpresa(empresaId: string): Promise<ExportacaoLgpd> {
  const tabelas: Record<string, unknown[]> = {}

  const empresa = exigir(await sb.from('empresas').select('*').eq('id', empresaId).single())
  tabelas.empresas = [empresa]

  for (const [tabela, colunas] of Object.entries(TABELAS)) {
    const linhas = await buscarTudo(
      (de, ate) => {
        let consulta = sb.from(tabela).select(colunas).eq('empresa_id', empresaId)
        for (const campo of ORDEM[tabela] ?? ['empresa_id']) consulta = consulta.order(campo)
        return consulta.range(de, ate)
      },
      linha => linha,
    )
    tabelas[tabela] = linhas
  }

  const membros = (tabelas.membros ?? []) as { usuario_id?: string }[]
  const ids = [...new Set(membros.map(m => m.usuario_id).filter((id): id is string => !!id))]
  tabelas.perfis = ids.length
    ? await buscarTudo(
        (de, ate) => sb.from('perfis').select('id, nome, email').in('id', ids).order('id').range(de, ate),
        linha => linha,
      )
    : []

  return {
    gerado_em: new Date().toISOString(),
    empresa_id: empresaId,
    aviso:
      'Exportação de dados do titular para portabilidade/LGPD. O arquivo contém dados pessoais: guarde-o com segurança e não compartilhe sem necessidade.',
    tabelas,
  }
}
