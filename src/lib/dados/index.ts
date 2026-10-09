/**
 * Acesso a dados: tudo passa pelo Supabase (na nuvem ou o servidor local de teste).
 * As regras (permissões por empresa e papel, saldo, histórico imutável) ficam no banco.
 */
export * as catalogo from './catalogo'
export { configurado, traduzirErro, veioDaRecuperacaoDeSenha } from './cliente'
export * as empresas from './empresas'
export * as movimentos from './movimentos'
export * as sessao from './sessao'
export { escutarEmpresa, type Alteracao } from './tempo-real'
