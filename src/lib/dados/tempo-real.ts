import { sb } from './cliente'

export type Alteracao = 'catalogo' | 'estoque'

const TABELAS: Record<string, Alteracao> = {
  produtos: 'catalogo',
  produtos_codigos: 'catalogo',
  categorias: 'catalogo',
  lotes: 'estoque',
  estoque_saldos: 'estoque',
}

/**
 * Avisa quando outro aparelho (ou aba) altera dados da empresa. O banco só entrega
 * as alterações que este usuário tem permissão de ler.
 */
export function escutarEmpresa(empresaId: string, cb: (o: Alteracao) => void): () => void {
  const canal = sb.channel(`empresa-${empresaId}-${Math.random().toString(36).slice(2)}`)
  for (const [table, oque] of Object.entries(TABELAS))
    canal.on('postgres_changes', { event: '*', schema: 'public', table, filter: `empresa_id=eq.${empresaId}` }, () => cb(oque))
  canal.subscribe()
  return () => {
    sb.removeChannel(canal)
  }
}
