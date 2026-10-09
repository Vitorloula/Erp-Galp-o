import type {
  FiltroMovimentacoes,
  Lote,
  Movimentacao,
  NovaCorrecao,
  NovaEntrada,
  NovaSaida,
  Papel,
  Produto,
  ProdutoDados,
  Usuario,
} from '../tipos'

/**
 * Contrato único de acesso a dados. Há duas implementações:
 *  - Supabase (produção, nuvem, multiusuário, RLS)
 *  - Demonstração (dados salvos no navegador, mesmas regras de negócio)
 */
export interface Repositorio {
  modo: 'supabase' | 'demo'

  sessaoAtual(): Promise<Usuario | null>
  entrar(email: string, senha: string): Promise<Usuario>
  /** Cria conta "pendente". Retorna se é preciso confirmar o e-mail antes de entrar. */
  solicitarAcesso(nome: string, email: string, senha: string): Promise<{ confirmarEmail: boolean }>
  sair(): Promise<void>
  aoMudarSessao(cb: (u: Usuario | null) => void): () => void

  /** Somente administradores. */
  listarUsuarios(): Promise<Usuario[]>
  alterarPapel(usuarioId: string, papel: Papel): Promise<void>

  listarProdutos(): Promise<Produto[]>
  salvarProduto(dados: ProdutoDados, id?: string): Promise<Produto>

  listarLotes(): Promise<Lote[]>
  atualizarLote(loteId: string, dados: { lote: string; validade: string | null }): Promise<void>

  listarMovimentacoes(filtro?: FiltroMovimentacoes): Promise<Movimentacao[]>
  registrarEntrada(e: NovaEntrada): Promise<number>
  registrarSaida(s: NovaSaida): Promise<number>
  registrarCorrecao(c: NovaCorrecao): Promise<number>

  /** Avisa quando qualquer dado muda (outro aparelho, outra aba ou este mesmo). */
  escutarAlteracoes(cb: () => void): () => void

  /** Apenas no modo demonstração. */
  restaurarDemo?(): Promise<void>
}
