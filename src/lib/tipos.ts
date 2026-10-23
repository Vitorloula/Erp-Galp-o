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
  endereco: string | null
  ativo: boolean
}

export interface DadosEmpresa {
  id: string
  nome: string
  razao_social: string | null
  documento: string | null
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
  | 'rastreio'
  | 'pesavel'
  | 'codigo_balanca'
  | 'controla_estoque'
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
