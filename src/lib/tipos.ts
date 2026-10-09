export type Unidade = 'L' | 'ml' | 'kg' | 'g' | 't' | 'sc' | 'un' | 'cx' | 'gl'
export type Categoria = 'defensivo' | 'fertilizante' | 'adjuvante' | 'semente' | 'outro'
export type TipoMov = 'ENTRADA' | 'SAIDA' | 'CORRECAO'
/** pendente = conta criada, aguardando o administrador liberar (sem acesso a nada). */
export type Papel = 'pendente' | 'operador' | 'admin'

export interface Produto {
  id: string
  codigo_interno: string
  codigo_barras: string | null
  nome: string
  categoria: Categoria
  unidade: Unidade
  conteudo_embalagem: number | null
  fabricante: string | null
  observacao: string | null
  ativo: boolean
  criado_em: string
}

export type ProdutoDados = Pick<
  Produto,
  'codigo_interno' | 'codigo_barras' | 'nome' | 'categoria' | 'unidade' | 'conteudo_embalagem' | 'fabricante' | 'observacao' | 'ativo'
>

/** Lote com saldo consolidado (view vw_estoque_lotes). */
export interface Lote {
  lote_id: string
  produto_id: string
  lote: string
  /** Data real no formato ISO (AAAA-MM-DD) ou null quando o produto não tem validade. */
  validade: string | null
  criado_em: string
  saldo: number
  ultima_movimentacao: string | null
}

export interface Movimentacao {
  id: number
  criado_em: string
  tipo: TipoMov
  lote_id: string
  produto_id: string
  /** ENTRADA/SAIDA: sempre positiva. CORRECAO: com sinal. */
  quantidade: number
  /** Efeito no saldo (+ ou -). */
  delta: number
  documento: string | null
  observacao: string | null
  referencia_id: number | null
  usuario_id: string | null
  usuario_nome: string | null
}

export interface Usuario {
  id: string
  nome: string
  email: string | null
  papel: Papel
  criado_em?: string
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

export interface NovaCorrecao {
  loteId: string
  /** Com sinal: positivo soma ao saldo, negativo subtrai. */
  quantidade: number
  observacao: string
  referenciaId?: number | null
}
