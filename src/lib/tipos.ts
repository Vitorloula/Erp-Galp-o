export type Unidade = 'L' | 'ml' | 'kg' | 'g' | 't' | 'sc' | 'un' | 'cx' | 'gl' | 'm' | 'pc' | 'par' | 'kit'
export type TipoMov =
  | 'ENTRADA'
  | 'SAIDA'
  | 'AJUSTE'
  | 'CORRECAO'
  | 'VENDA'
  | 'CANCELAMENTO_VENDA'
  | 'DEVOLUCAO'
  | 'TRANSF_SAIDA'
  | 'TRANSF_ENTRADA'
export type Papel = 'dono' | 'gerente' | 'estoquista' | 'caixa'
export type Segmento = 'galpao' | 'eletronicos' | 'mercadinho' | 'outro'
export type Rastreio = 'nenhum' | 'lote' | 'serie'
/** Situação da assinatura, calculada no banco a partir das datas. */
export type EstadoEmpresa = 'ativa' | 'atrasada' | 'somente_leitura' | 'suspensa' | 'cancelada'

export interface Perfil {
  id: string
  nome: string
  email: string | null
}

/** Empresa em que o usuário trabalha (função minhas_empresas). */
export interface Vinculo {
  empresa_id: string
  nome: string
  segmento: Segmento
  config: {
    dias_alerta?: number
    exemplo?: boolean
    /** Venda de item sem saldo no caixa: permitir, avisar ou bloquear. */
    venda_sem_estoque?: 'permitir' | 'avisar' | 'bloquear'
    balanca?: { prefixo: string; digitos_codigo: number; tipo: 'preco' | 'peso'; digitos_valor?: number }
    [chave: string]: unknown
  }
  fuso: string
  papel: Papel
  /** null = todas as lojas da empresa */
  lojas: string[] | null
  estado: EstadoEmpresa
  plano_id: string | null
  plano_nome: string | null
  status: 'trial' | 'ativa' | 'cancelada' | 'cortesia' | null
  trial_ate: string | null
  pago_ate: string | null
}

export interface Loja {
  id: string
  nome: string
  cnpj: string | null
  ie: string | null
  endereco: string | null
  cod_municipio_ibge: string | null
  uf: string | null
  ativo: boolean
}

export interface ConfigEmpresa {
  dias_alerta?: number
  exemplo?: boolean
  venda_sem_estoque?: 'permitir' | 'avisar' | 'bloquear'
  balanca?: { prefixo: string; digitos_codigo: number; tipo: 'preco' | 'peso'; digitos_valor?: number }
  [chave: string]: unknown
}

export interface DadosEmpresa {
  id: string
  nome: string
  razao_social: string | null
  documento: string | null
  config: ConfigEmpresa
}

export interface Membro {
  usuario_id: string
  nome: string
  email: string | null
  papel: Papel
  lojas: string[] | null
  ativo: boolean
  criado_em: string
}

export interface Convite {
  id: string
  email: string | null
  papel: Exclude<Papel, 'dono'>
  lojas: string[] | null
  expira_em: string
  aceito_em: string | null
  cancelado_em: string | null
  criado_em: string
}

export interface Categoria {
  id: string
  nome: string
}

export interface CodigoProduto {
  /** Guardado no formato do banco (GTIN-14 para códigos numéricos). */
  codigo: string
  /** Quantas unidades cada leitura representa (ex.: caixa com 12). */
  fator: number
}

export interface Produto {
  id: string
  codigo_interno: string
  nome: string
  categoria_id: string | null
  unidade: Unidade
  conteudo_embalagem: number | null
  /** Ponto de pedido: quando o saldo total chegar aqui, o produto aparece em "Repor". null = desligado. */
  estoque_minimo: number | null
  preco_venda: number | null
  custo_ultimo: number | null
  /** Campos fiscais (NFC-e/NF-e) — preenchidos opcionalmente no cadastro. */
  ncm: string | null
  cfop: string | null
  cst_csosn: string | null
  origem: number | null
  unidade_tributavel: string | null
  cest: string | null
  /** Reforma Tributária: alíquotas de IBS e CBS (%) — opcionais. */
  ibs_aliquota: number | null
  cbs_aliquota: number | null
  rastreio: Rastreio
  /** Vendido por peso (etiqueta de balança). */
  pesavel: boolean
  /** Código do produto na balança (PLU). */
  codigo_balanca: string | null
  /** false: serviços e "Diversos" — não entram no estoque. */
  controla_estoque: boolean
  /** Garantia em meses: alimenta a sugestão de garantia nas ordens de serviço (null = não configurada). */
  garantia_meses: number | null
  fabricante: string | null
  observacao: string | null
  ativo: boolean
  criado_em: string
  codigos: CodigoProduto[]
}

export type ProdutoDados = Pick<
  Produto,
  | 'codigo_interno'
  | 'nome'
  | 'categoria_id'
  | 'unidade'
  | 'conteudo_embalagem'
  | 'estoque_minimo'
  | 'preco_venda'
  | 'custo_ultimo'
  | 'rastreio'
  | 'pesavel'
  | 'codigo_balanca'
  | 'controla_estoque'
  | 'garantia_meses'
  | 'fabricante'
  | 'observacao'
  | 'ativo'
  | 'ncm'
  | 'cfop'
  | 'cst_csosn'
  | 'origem'
  | 'unidade_tributavel'
  | 'cest'
  | 'ibs_aliquota'
  | 'cbs_aliquota'
>

/** Lote com saldo na loja ativa (visão vw_estoque). */
export interface Lote {
  lote_id: string
  produto_id: string
  lote: string
  /** Data real no formato ISO (AAAA-MM-DD) ou null quando o produto não tem validade. */
  validade: string | null
  saldo: number
  ultima_movimentacao: string | null
}

export interface Movimentacao {
  id: number
  /** Quando aconteceu (no PDV offline pode ser antes do registro no servidor). */
  ocorrido_em: string
  registrado_em: string
  tipo: TipoMov
  loja_id: string
  lote_id: string
  produto_id: string
  /** ENTRADA/SAIDA: sempre positiva. AJUSTE/CORRECAO: com sinal. */
  quantidade: number
  /** Efeito no saldo (+ ou -). */
  delta: number
  documento: string | null
  observacao: string | null
  referencia_id: number | null
  origem: 'manual' | 'pdv' | 'sistema'
  usuario_id: string | null
  usuario_nome: string | null
}

export interface FiltroMovimentacoes {
  /** ISO datetime inclusive */
  desde?: string
  /** ISO datetime inclusive */
  ate?: string
  produtoId?: string
  loteId?: string
  referenciaId?: number
  limite?: number
}

export interface NovaEntrada {
  produtoId: string
  lote: string
  validade: string | null
  quantidade: number
  custo?: number | null
  documento?: string
  observacao?: string
}

export interface NovaSaida {
  loteId: string
  quantidade: number
  documento?: string
  observacao?: string
}

export interface NovoAjuste {
  loteId: string
  /** Com sinal: positivo soma ao saldo, negativo subtrai. */
  quantidade: number
  observacao: string
}

export interface NovaCorrecao extends NovoAjuste {
  referenciaId: number
}

// ───────────────── Módulo Serviços (Ordem de Serviço — T-038) ─────────────────

export type StatusOS =
  | 'aberta'
  | 'em_diagnostico'
  | 'aguardando_aprovacao'
  | 'aprovada'
  | 'em_execucao'
  | 'pronta'
  | 'entregue'
  | 'cancelada'

/** Ordem de serviço: o aparelho recebido para assistência técnica. */
export interface OS {
  id: string
  loja_id: string
  numero: number
  status: StatusOS
  cliente_nome: string
  cliente_telefone: string | null
  cliente_documento: string | null
  aparelho_tipo: string | null
  aparelho_marca_modelo: string | null
  aparelho_serie_imei: string | null
  aparelho_cor: string | null
  /** Dado sensível de acesso: nunca impresso, oculto no detalhe. */
  aparelho_senha: string | null
  aparelho_acessorios: string | null
  aparelho_estado: string | null
  defeito_relatado: string | null
  diagnostico: string | null
  prazo_prometido: string | null
  valor_mao_de_obra: number
  desconto: number
  garantia_dias: number | null
  tecnico_id: string | null
  tecnico_nome: string | null
  criado_em: string
  criado_por_nome: string | null
  orcado_em: string | null
  aprovada_em: string | null
  aprovada_por_nome: string | null
  pronta_em: string | null
  entregue_em: string | null
  entregue_por_nome: string | null
  cancelada_em: string | null
  cancelada_por_nome: string | null
  motivo_cancelamento: string | null
}

/** Item do orçamento da OS: peça do estoque ou item avulso. */
export interface ItemOS {
  id: string
  os_id: string
  ordem: number
  origem: 'estoque' | 'avulsa'
  produto_id: string | null
  descricao: string
  quantidade: number
  preco_unitario: number
  total: number
  /** Data da baixa no estoque (preenchida pela entrega). */
  baixado_em: string | null
  /** Garantia (meses) do produto no catálogo — só em itens de estoque; alimenta a sugestão da OS. */
  garantia_meses: number | null
}

export interface PagamentoOS {
  id: string
  forma: string
  valor: number
  registrado_em: string
  registrado_por_nome: string | null
}

/** Campos do formulário de recebimento (nova OS). */
export interface DadosOS {
  cliente_nome: string
  cliente_telefone: string
  cliente_documento: string
  aparelho_tipo: string
  aparelho_marca_modelo: string
  aparelho_serie_imei: string
  aparelho_cor: string
  aparelho_senha: string
  aparelho_acessorios: string
  aparelho_estado: string
  defeito_relatado: string
  prazo_prometido: string | null
  tecnico_nome: string
}

/** Item novo do orçamento, enviado à RPC os_definir_itens. */
export interface ItemOSDados {
  origem: 'estoque' | 'avulsa'
  produto_id: string | null
  descricao: string
  quantidade: number
  preco_unitario: number
}
