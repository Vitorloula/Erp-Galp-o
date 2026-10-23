import type { Categoria, CodigoProduto, Produto, ProdutoDados } from '../tipos'
import { exibirCodigo } from '../formato'
import { arred } from '../formato'
import { buscarTudo, exigir, memoria, num, numOuNulo, sb, traduzirErro } from './cliente'

// ───────────── Ponto de pedido guardado no aparelho ─────────────
// Enquanto a coluna `produtos.estoque_minimo` não existir na nuvem, o mínimo é guardado
// no aparelho (mesma ideia do catálogo em cache usado pelo PDV). Quando a coluna existir,
// o valor do banco tem prioridade e o local é ignorado.

const chaveMinimos = (empresaId: string) => `galpao-minimos-${empresaId}`

export function lerMinimosLocais(empresaId: string): Record<string, number> {
  const salvo = memoria.ler<Record<string, number>>(chaveMinimos(empresaId))
  return salvo && typeof salvo === 'object' ? salvo : {}
}

function gravarMinimoLocal(empresaId: string, produtoId: string, minimo: number | null) {
  const atuais = lerMinimosLocais(empresaId)
  if (minimo === null || minimo <= 0) delete atuais[produtoId]
  else atuais[produtoId] = minimo
  memoria.gravar(chaveMinimos(empresaId), atuais)
}

function comMinimoLocal(empresaId: string, produto: Produto): Produto {
  if (produto.estoque_minimo !== null) return produto
  const local = lerMinimosLocais(empresaId)[produto.id]
  return local === undefined ? produto : { ...produto, estoque_minimo: local }
}

function paraProduto(r: Record<string, unknown>): Produto {
  return {
    ...(r as unknown as Produto),
    conteudo_embalagem: numOuNulo(r.conteudo_embalagem),
    estoque_minimo: numOuNulo(r.estoque_minimo),
    preco_venda: numOuNulo(r.preco_venda),
    custo_ultimo: numOuNulo(r.custo_ultimo),
    origem: numOuNulo(r.origem),
    ibs_aliquota: numOuNulo(r.ibs_aliquota),
    cbs_aliquota: numOuNulo(r.cbs_aliquota),
    codigos: [],
  }
}

const COLUNAS_PRODUTO_BASE =
  'id, codigo_interno, nome, categoria_id, unidade, conteudo_embalagem, preco_venda, custo_ultimo, rastreio, pesavel, codigo_balanca, controla_estoque, fabricante, observacao, ativo, ncm, cfop, cst_csosn, origem, unidade_tributavel, cest, ibs_aliquota, cbs_aliquota, criado_em'
const COLUNAS_PRODUTO = `${COLUNAS_PRODUTO_BASE}, estoque_minimo`

/** true quando o banco ainda não tem a coluna do estoque mínimo (migration pendente). */
function semColunaMinimo(error: { message?: string; code?: string } | null | undefined): boolean {
  return !!error && (error.code === '42703' || error.code === 'PGRST204' || /estoque_minimo/i.test(error.message ?? ''))
}

/** Catálogo completo da empresa: produtos já com seus códigos de barras. */
export async function listarProdutos(empresaId: string): Promise<Produto[]> {
  const minimos = lerMinimosLocais(empresaId)
  let bancoSemColuna = false
  const paginar = (colunas: string) =>
    buscarTudo((de, ate) => sb.from('produtos').select(colunas).eq('empresa_id', empresaId).order('id').range(de, ate), paraProduto)

  const [produtos, codigos] = await Promise.all([
    paginar(COLUNAS_PRODUTO).catch(async e => {
      if (!semColunaMinimo(e)) throw e
      bancoSemColuna = true
      return paginar(COLUNAS_PRODUTO_BASE)
    }),
    buscarTudo(
      (de, ate) => sb.from('produtos_codigos').select('produto_id, codigo, fator').eq('empresa_id', empresaId).order('codigo').range(de, ate),
      r => ({ produto_id: r.produto_id as string, codigo: r.codigo as string, fator: num(r.fator) }),
    ),
  ])
  const porProduto = new Map(produtos.map(p => [p.id, p]))
  for (const c of codigos) porProduto.get(c.produto_id)?.codigos.push({ codigo: c.codigo, fator: c.fator })
  // O banco ordena texto byte a byte ("Água" depois de "Feijão"): a ordem alfabética é feita aqui.
  return produtos
    .map(p => (bancoSemColuna ? { ...p, estoque_minimo: minimos[p.id] ?? null } : comMinimoLocal(empresaId, p)))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Cadastra ou edita o produto com seus códigos de barras, numa só transação no banco. */
export async function salvarProduto(empresaId: string, dados: ProdutoDados, codigos: CodigoProduto[], id?: string): Promise<string> {
  if (!dados.nome.trim()) throw new Error('Informe o nome do produto.')
  const minimo = dados.estoque_minimo === null || !Number.isFinite(dados.estoque_minimo) ? null : arred(dados.estoque_minimo)
  const enviar = (incluirMinimo: boolean) =>
    sb.rpc('salvar_produto', {
      p_empresa: empresaId,
      p_id: id ?? null,
      p_dados: {
        ...dados,
        estoque_minimo: incluirMinimo ? (minimo !== null && minimo > 0 ? minimo : null) : undefined,
        nome: dados.nome.trim(),
        codigo_interno: dados.codigo_interno.trim(),
        codigo_balanca: dados.codigo_balanca?.trim() || null,
        fabricante: dados.fabricante?.trim() || null,
        observacao: dados.observacao?.trim() || null,
        ncm: dados.ncm?.trim() || null,
        cfop: dados.cfop?.trim() || null,
        cst_csosn: dados.cst_csosn?.trim() || null,
        unidade_tributavel: dados.unidade_tributavel?.trim() || null,
        cest: dados.cest?.trim() || null,
      },
      // Envia como na embalagem (o banco normaliza): mensagens de erro mostram o código que a pessoa conhece.
      p_codigos: codigos.map(c => ({ codigo: exibirCodigo(c.codigo.trim()), fator: c.fator })),
    })

  let r = await enviar(true)
  let bancoSemColuna = false
  if (r.error && semColunaMinimo(r.error)) {
    bancoSemColuna = true
    r = await enviar(false)
  }
  if (r.error) throw traduzirErro(r.error)
  const produtoId = r.data as string
  if (bancoSemColuna) gravarMinimoLocal(empresaId, produtoId, minimo)
  return produtoId
}

/**
 * Define (ou desliga, com null/0) o ponto de pedido de um produto.
 * Edita só este campo: não passa pelos códigos de barras nem pelo restante do cadastro.
 */
export async function salvarEstoqueMinimo(empresaId: string, produto: Produto, minimo: number | null): Promise<null> {
  const valor = minimo === null || !Number.isFinite(minimo) || minimo <= 0 ? null : arred(minimo)
  const { error } = await sb.from('produtos').update({ estoque_minimo: valor }).eq('id', produto.id).select('id').single()
  if (error && !semColunaMinimo(error)) throw traduzirErro(error)
  // Sem a coluna no banco (ou sem permissão de UPDATE direto), guarda no aparelho: a tela funciona igual.
  if (error || produto.estoque_minimo !== valor) gravarMinimoLocal(empresaId, produto.id, valor)
  return null
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
