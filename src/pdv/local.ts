import Dexie, { type Table } from 'dexie'

/**
 * Banco do caixa NO APARELHO (IndexedDB): o caixa vende sem internet com o que está aqui.
 * Um banco por empresa e loja. O que sai daqui para o servidor passa pela fila (eventos).
 */

export interface CodigoLocal {
  codigo: string
  fator: number
}

export interface ProdutoLocal {
  id: string
  codigo_interno: string
  nome: string
  unidade: string
  preco_venda: number | null
  pesavel: boolean
  codigo_balanca: string | null
  rastreio: 'nenhum' | 'lote' | 'serie'
  controla_estoque: boolean
  conteudo_embalagem: number | null
  categoria_id: string | null
  ativo: boolean
  codigos: CodigoLocal[]
  /** Saldo na loja na última sincronização (referência: as vendas offline ainda não descontadas). */
  saldo: number
}

export interface CodigoIndice {
  codigo: string
  produto_id: string
  fator: number
}

export type TipoEvento = 'abrir_sessao' | 'movimento_caixa' | 'venda' | 'cancelar_venda' | 'fechar_sessao'

export interface EventoPendente {
  ordem?: number
  id: string
  tipo: TipoEvento
  dados: Record<string, unknown>
  criado_em: string
  tentativas: number
  /** Recusado pelo servidor (malformado ou sem permissão): fica guardado para conferência. */
  invalido?: boolean
  erro?: string
}

export interface VendaLocal {
  id: string
  sessao_id: string
  numero: number
  numero_exibicao: string
  ocorrido_em: string
  total: number
  dados: Record<string, unknown>
  status: 'concluida' | 'cancelada'
  sincronizada: boolean
}

export class BancoPdv extends Dexie {
  produtos!: Table<ProdutoLocal, string>
  codigos!: Table<CodigoIndice, string>
  fila!: Table<EventoPendente, number>
  vendas!: Table<VendaLocal, string>
  meta!: Table<{ chave: string; valor: unknown }, string>

  constructor(nome: string) {
    super(nome)
    this.version(1).stores({
      produtos: 'id, codigo_interno, codigo_balanca',
      codigos: 'codigo, produto_id',
      fila: '++ordem, &id',
      vendas: 'id, ocorrido_em, sessao_id',
      meta: 'chave',
    })
  }

  async ler<T>(chave: string): Promise<T | null> {
    return ((await this.meta.get(chave))?.valor as T | undefined) ?? null
  }

  async gravar(chave: string, valor: unknown) {
    await this.meta.put({ chave, valor })
  }
}

const abertos = new Map<string, BancoPdv>()

export function bancoDaLoja(empresaId: string, lojaId: string): BancoPdv {
  const nome = `pdv-${empresaId}-${lojaId}`
  if (!abertos.has(nome)) abertos.set(nome, new BancoPdv(nome))
  return abertos.get(nome)!
}

/** Identifica este aparelho (o caixa fica "preso" a ele enquanto a sessão está aberta). */
export function dispositivoId(): string {
  const chave = 'galpao-dispositivo'
  try {
    let id = localStorage.getItem(chave)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(chave, id)
    }
    return id
  } catch {
    return 'aparelho-sem-armazenamento'
  }
}
