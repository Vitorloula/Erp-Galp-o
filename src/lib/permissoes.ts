import type { EstadoEmpresa, Papel } from './tipos'

/**
 * O que cada papel pode fazer na tela. Espelha as políticas do banco (RLS), que é
 * quem garante de verdade: a tela só esconde botões que dariam "sem permissão".
 */
export interface Permissoes {
  /** Assinatura em dia ou em carência (fora disso, tudo fica somente leitura). */
  gravavel: boolean
  movimentar: boolean
  cadastrarProduto: boolean
  corrigirLote: boolean
  gerenciarCategorias: boolean
  convidar: boolean
  convidarGerente: boolean
  gerenciarEquipe: boolean
  gerenciarEmpresa: boolean
  /** Usar o caixa (PDV). Vende até a assinatura ser suspensa (carência maior que a da retaguarda). */
  vender: boolean
  /** Cancelar venda concluída. */
  cancelarVenda: boolean
  gerenciarCaixas: boolean
  verDivergencias: boolean
}

export const NOME_PAPEL: Record<Papel, string> = {
  dono: 'Dono',
  gerente: 'Gerente',
  estoquista: 'Estoquista',
  caixa: 'Caixa',
}

export const DESCRICAO_PAPEL: Record<Papel, string> = {
  dono: 'Tudo, inclusive equipe, lojas e dados da empresa',
  gerente: 'Estoque, cadastros, correções de lote e convites para a equipe',
  estoquista: 'Entradas, saídas, ajustes e cadastro de produtos',
  caixa: 'Vende no caixa e consulta estoque, histórico e relatórios',
}

export function permissoes(papel: Papel, estado: EstadoEmpresa): Permissoes {
  const gravavel = estado === 'ativa' || estado === 'atrasada'
  const estoque = gravavel && (papel === 'dono' || papel === 'gerente' || papel === 'estoquista')
  const gestao = gravavel && (papel === 'dono' || papel === 'gerente')
  return {
    gravavel,
    movimentar: estoque,
    cadastrarProduto: estoque,
    corrigirLote: gestao,
    gerenciarCategorias: gestao,
    convidar: gestao,
    convidarGerente: gravavel && papel === 'dono',
    gerenciarEquipe: papel === 'dono',
    gerenciarEmpresa: papel === 'dono',
    vender: (papel === 'dono' || papel === 'gerente' || papel === 'caixa') && estado !== 'suspensa' && estado !== 'cancelada',
    cancelarVenda: papel === 'dono' || papel === 'gerente',
    gerenciarCaixas: gestao,
    verDivergencias: papel === 'dono' || papel === 'gerente',
  }
}
