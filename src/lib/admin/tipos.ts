export interface AdminEmpresaResumo {
  empresa_id: string
  nome: string
  segmento: string
  criado_em: string
  estado: string
  plano_id: string
  status_assinatura: string
  trial_ate: string | null
  pago_ate: string | null
  lojas_ativas: number
  usuarios_ativos: number
  vendas_7d: number
  faturamento_7d: number
  ultima_venda_em: string | null
  erros_7d: number
  divergencias_abertas: number
  ultima_movimentacao_em: string | null
}

export interface AdminAuditoriaLinha {
  id: number
  admin_id: string
  acao: string
  alvo: string | null
  empresa_id: string | null
  loja_id: string | null
  detalhes: Record<string, unknown>
  correlacao: string | null
  criado_em: string
}
