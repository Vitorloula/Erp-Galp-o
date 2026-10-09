import type { Categoria, CodigoProduto, Produto, ProdutoDados } from '../tipos'
import { exibirCodigo } from '../formato'
import { buscarTudo, exigir, num, numOuNulo, sb, traduzirErro } from './cliente'

function paraProduto(r: Record<string, unknown>): Produto {
  return {
    ...(r as unknown as Produto),
    conteudo_embalagem: numOuNulo(r.conteudo_embalagem),
    preco_venda: numOuNulo(r.preco_venda),
    custo_ultimo: numOuNulo(r.custo_ultimo),
    codigos: [],
  }
}

const COLUNAS_PRODUTO =
  'id, codigo_interno, nome, categoria_id, unidade, conteudo_embalagem, preco_venda, custo_ultimo, rastreio, fabricante, observacao, ativo, criado_em'

/** Catálogo completo da empresa: produtos já com seus códigos de barras. */
export async function listarProdutos(empresaId: string): Promise<Produto[]> {
  const [produtos, codigos] = await Promise.all([
    buscarTudo((de, ate) => sb.from('produtos').select(COLUNAS_PRODUTO).eq('empresa_id', empresaId).order('id').range(de, ate), paraProduto),
    buscarTudo(
      (de, ate) => sb.from('produtos_codigos').select('produto_id, codigo, fator').eq('empresa_id', empresaId).order('codigo').range(de, ate),
      r => ({ produto_id: r.produto_id as string, codigo: r.codigo as string, fator: num(r.fator) }),
    ),
  ])
  const porProduto = new Map(produtos.map(p => [p.id, p]))
  for (const c of codigos) porProduto.get(c.produto_id)?.codigos.push({ codigo: c.codigo, fator: c.fator })
  // O banco ordena texto byte a byte ("Água" depois de "Feijão"): a ordem alfabética é feita aqui.
  return produtos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Cadastra ou edita o produto com seus códigos de barras, numa só transação no banco. */
export async function salvarProduto(empresaId: string, dados: ProdutoDados, codigos: CodigoProduto[], id?: string): Promise<string> {
  if (!dados.nome.trim()) throw new Error('Informe o nome do produto.')
  const { data, error } = await sb.rpc('salvar_produto', {
    p_empresa: empresaId,
    p_id: id ?? null,
    p_dados: {
      ...dados,
      nome: dados.nome.trim(),
      codigo_interno: dados.codigo_interno.trim(),
      fabricante: dados.fabricante?.trim() || null,
      observacao: dados.observacao?.trim() || null,
    },
    // Envia como na embalagem (o banco normaliza): mensagens de erro mostram o código que a pessoa conhece.
    p_codigos: codigos.map(c => ({ codigo: exibirCodigo(c.codigo.trim()), fator: c.fator })),
  })
  if (error) throw traduzirErro(error)
  return data as string
}

export async function listarCategorias(empresaId: string): Promise<Categoria[]> {
  const lista = exigir(await sb.from('categorias').select('id, nome').eq('empresa_id', empresaId)) as Categoria[]
  return lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export async function criarCategoria(empresaId: string, nome: string): Promise<Categoria> {
  if (!nome.trim()) throw new Error('Informe o nome da categoria.')
  return exigir(await sb.from('categorias').insert({ empresa_id: empresaId, nome: nome.trim() }).select('id, nome').single()) as Categoria
}

export async function renomearCategoria(id: string, nome: string) {
  if (!nome.trim()) throw new Error('Informe o nome da categoria.')
  const { error } = await sb.from('categorias').update({ nome: nome.trim() }).eq('id', id).select('id').single()
  if (error) throw error.code === 'PGRST116' ? new Error('Somente dono ou gerente alteram categorias.') : traduzirErro(error)
}

export async function excluirCategoria(id: string) {
  const { error } = await sb.from('categorias').delete().eq('id', id).select('id').single()
  if (error) throw error.code === 'PGRST116' ? new Error('Somente dono ou gerente excluem categorias.') : traduzirErro(error)
}

/** Corrige número do lote ou validade digitados errado (quantidades não mudam). */
export async function atualizarLote(loteId: string, dados: { lote: string; validade: string | null }) {
  const { error } = await sb.from('lotes').update(dados).eq('id', loteId).select('id').single()
  if (error) throw error.code === 'PGRST116' ? new Error('Somente dono ou gerente corrigem lotes.') : traduzirErro(error)
}
