import { arred, canonizarCodigo, diferencaDias, exibirCodigo, hojeISO, normalizarBusca } from './formato'
import type { Lote, Produto, Unidade } from './tipos'

/** Janela do alerta amarelo (vencimento próximo). */
export const DIAS_ALERTA = 30

/**
 * vencido  → linha vermelha (validade já passou)
 * zerado   → linha vermelha (sem estoque)
 * vencendo → linha amarela (vence nos próximos 30 dias)
 * ok       → sem alerta
 */
export type Situacao = 'vencido' | 'zerado' | 'vencendo' | 'ok'

/**
 * Reposição (ponto de pedido). Independente da situação do lote:
 * abaixo     → saldo < mínimo
 * no_minimo  → saldo == mínimo
 * acima      → saldo > mínimo
 * sem_minimo → produto sem ponto de pedido definido
 */
export type SituacaoReposicao = 'abaixo' | 'no_minimo' | 'acima' | 'sem_minimo'

export const PRIORIDADE: Record<Situacao, number> = { vencido: 0, zerado: 1, vencendo: 2, ok: 3 }

/** Prioridade da lista "Precisa de atenção": validade crítica primeiro, reposição depois. */
export const PRIORIDADE_ATENCAO: Record<Situacao | 'abaixo', number> = {
  vencido: 0,
  zerado: 1,
  abaixo: 2,
  vencendo: 3,
  ok: 4,
}

export function diasParaVencer(validade: string | null, hoje = hojeISO()): number | null {
  return validade ? diferencaDias(hoje, validade) : null
}

export function situacaoValidade(validade: string | null, hoje = hojeISO()): Situacao {
  const dias = diasParaVencer(validade, hoje)
  if (dias === null) return 'ok'
  if (dias < 0) return 'vencido'
  if (dias <= DIAS_ALERTA) return 'vencendo'
  return 'ok'
}

export function situacaoLote(lote: Pick<Lote, 'saldo' | 'validade'>, hoje = hojeISO()): Situacao {
  if (lote.saldo <= 0) return 'zerado'
  return situacaoValidade(lote.validade, hoje)
}

export function descreverSituacao(situacao: Situacao, validade: string | null, hoje = hojeISO()): string {
  const dias = diasParaVencer(validade, hoje)
  switch (situacao) {
    case 'zerado':
      return 'Sem estoque'
    case 'vencido':
      return dias === -1 ? 'Venceu ontem' : `Vencido há ${Math.abs(dias ?? 0)} dias`
    case 'vencendo':
      return dias === 0 ? 'Vence hoje' : dias === 1 ? 'Vence amanhã' : `Vence em ${dias} dias`
    default:
      return 'Em dia'
  }
}

/** Ordena lotes por validade (FEFO: primeiro que vence, primeiro que sai). Sem validade vai por último. */
export function ordenarFefo<T extends Pick<Lote, 'validade' | 'lote'>>(lotes: T[]): T[] {
  return [...lotes].sort((a, b) => {
    if (a.validade === b.validade) return a.lote.localeCompare(b.lote)
    if (!a.validade) return 1
    if (!b.validade) return -1
    return a.validade.localeCompare(b.validade)
  })
}

/** Uma linha da tela de estoque: um lote com saldo, ou o produto zerado. */
export interface LinhaEstoque {
  chave: string
  produto: Produto
  lote: Lote | null
  saldo: number
  validade: string | null
  situacao: Situacao
}

/**
 * Monta as linhas no mesmo padrão da planilha da empresa:
 * uma linha por produto/lote com saldo; produtos sem saldo aparecem em uma linha vermelha.
 */
export function montarLinhasEstoque(produtos: Produto[], lotes: Lote[], hoje = hojeISO()): LinhaEstoque[] {
  const porProduto = agruparLotes(lotes)
  const linhas: LinhaEstoque[] = []
  for (const produto of produtos) {
    if (!produto.controla_estoque) continue // serviços e "Diversos" não têm estoque
    const comSaldo = ordenarFefo((porProduto.get(produto.id) ?? []).filter(l => l.saldo > 0))
    if (comSaldo.length === 0) {
      if (!produto.ativo) continue
      linhas.push({ chave: produto.id, produto, lote: null, saldo: 0, validade: null, situacao: 'zerado' })
      continue
    }
    for (const lote of comSaldo) {
      linhas.push({
        chave: lote.lote_id,
        produto,
        lote,
        saldo: lote.saldo,
        validade: lote.validade,
        situacao: situacaoLote(lote, hoje),
      })
    }
  }
  return linhas
}

export function agruparLotes(lotes: Lote[]): Map<string, Lote[]> {
  const mapa = new Map<string, Lote[]>()
  for (const l of lotes) {
    const lista = mapa.get(l.produto_id)
    if (lista) lista.push(l)
    else mapa.set(l.produto_id, [l])
  }
  return mapa
}

export interface ResumoProduto {
  saldo: number
  proximaValidade: string | null
  situacao: Situacao
  lotesComSaldo: number
}

/** Situação consolidada do produto: a pior situação entre seus lotes com saldo. */
export function resumirProduto(lotesDoProduto: Lote[], hoje = hojeISO()): ResumoProduto {
  const comSaldo = ordenarFefo(lotesDoProduto.filter(l => l.saldo > 0))
  const saldo = comSaldo.reduce((s, l) => s + l.saldo, 0)
  if (comSaldo.length === 0) return { saldo: 0, proximaValidade: null, situacao: 'zerado', lotesComSaldo: 0 }
  let situacao: Situacao = 'ok'
  for (const l of comSaldo) {
    const s = situacaoLote(l, hoje)
    if (PRIORIDADE[s] < PRIORIDADE[situacao]) situacao = s
  }
  return {
    saldo: Math.round(saldo * 1000) / 1000,
    proximaValidade: comSaldo.find(l => l.validade)?.validade ?? null,
    situacao,
    lotesComSaldo: comSaldo.length,
  }
}

/** Busca por nome, código interno, código de barras ou fabricante (sem acentos). */
export function produtoCombina(produto: Produto, termo: string): boolean {
  const t = normalizarBusca(termo)
  if (!t) return true
  return [produto.nome, produto.codigo_interno, produto.fabricante ?? '', ...produto.codigos.map(c => exibirCodigo(c.codigo))]
    .some(campo => normalizarBusca(campo).includes(t))
}

/**
 * Recorte reutilizável de produtos (T-019): filtra por busca (termo) e categoria.
 * É a mesma lógica que a tela Estoque usa, compartilhada com o Relatório para que
 * "exportar o estoque filtrado" não divirja da tela.
 */
export function filtrarProdutos(produtos: Produto[], termo: string, categoria: string): Produto[] {
  return produtos.filter(p => (!categoria || p.categoria_id === categoria) && produtoCombina(p, termo))
}

export interface ProdutoLido {
  produto: Produto
  /** Unidades que a leitura representa (ex.: código da caixa com 12 = 12). */
  fator: number
}

/** Encontra o produto pelo código de barras (EAN-8/13, UPC, GTIN-14, DUN) ou pelo código interno. */
export function encontrarPorCodigo(produtos: Produto[], codigo: string): ProdutoLido | undefined {
  const canonico = canonizarCodigo(codigo)
  if (!canonico) return undefined
  for (const produto of produtos) {
    const c = produto.codigos.find(x => x.codigo === canonico)
    if (c) return { produto: produto, fator: c.fator }
  }
  const porInterno = produtos.find(p => p.codigo_interno.toUpperCase() === codigo.trim().toUpperCase())
  return porInterno ? { produto: porInterno, fator: 1 } : undefined
}

// ───────────────────────────── Reposição (ponto de pedido) ─────────────────────────────

/** Classifica o saldo contra o estoque mínimo (ponto de pedido). */
export function situacaoReposicao(saldo: number, minimo: number | null): SituacaoReposicao {
  if (minimo === null || !Number.isFinite(minimo) || minimo <= 0) return 'sem_minimo'
  if (saldo < minimo) return 'abaixo'
  if (saldo === minimo) return 'no_minimo'
  return 'acima'
}

/**
 * Precisa repor? Sim quando o saldo chegou ao ponto de pedido (saldo <= mínimo).
 * Produto sem mínimo (null/0/undefined) nunca alerta — registros antigos continuam funcionando.
 * É a mesma regra de `precisaRepor` sobre `situacaoReposicao`, escrita como função pura para
 * o Painel e o filtro "Repor" do Estoque.
 */
export function abaixoDoMinimo(saldo: number, minimo: number | null | undefined): boolean {
  if (minimo === null || minimo === undefined || !Number.isFinite(minimo) || minimo <= 0) return false
  return saldo <= minimo
}

/** Situação efetiva de compra: 'acima' e 'sem_minimo' nunca entram na lista de compras. */
type SituacaoPedido = Extract<SituacaoReposicao, 'abaixo' | 'no_minimo'>

/** Reduz a situação de reposição ao subconjunto que precisa de compra. */
function comoSituacaoPedido(situacao: SituacaoReposicao): SituacaoPedido {
  return situacao === 'no_minimo' ? 'no_minimo' : 'abaixo'
}

/** Produto já está no ponto de pedido (abaixo ou no mínimo): precisa de compra. */
function noPontoDePedido(situacao: SituacaoReposicao): situacao is SituacaoPedido {
  return situacao === 'abaixo' || situacao === 'no_minimo'
}

/**
 * Quantidade sugerida de compra: completa até o mínimo, arredondando para cima
 * no passo da embalagem quando o produto tem conteúdo por embalagem.
 */
export function sugerirCompra(saldo: number, minimo: number | null, conteudoEmbalagem: number | null): number {
  if (minimo === null || !Number.isFinite(minimo) || minimo <= 0) return 0
  const falta = minimo - saldo
  if (falta <= 0) return 0
  if (conteudoEmbalagem && conteudoEmbalagem > 0) return arred(Math.ceil(falta / conteudoEmbalagem) * conteudoEmbalagem)
  return arred(falta)
}

/** Cobertura = saldo / mínimo (2 casas). null quando o produto não tem mínimo. */
export function calcularCobertura(saldo: number, minimo: number | null): number | null {
  if (minimo === null || !Number.isFinite(minimo) || minimo <= 0) return null
  return Math.round((saldo / minimo) * 100) / 100
}

export interface ReposicaoProduto {
  produto: Produto
  /** Saldo somado de todos os lotes com saldo. */
  saldo: number
  minimo: number | null
  /** saldo / mínimo, arredondado a 2 casas; null quando não há mínimo. */
  cobertura: number | null
  /** Quanto comprar para voltar ao mínimo (0 quando não precisa). */
  sugestaoCompra: number
  situacao: SituacaoReposicao
  /** Pior situação entre os lotes, usada apenas para a cor de fundo da linha. */
  situacaoLote: Situacao
}

export interface OpcoesReposicao {
  /**
   * Inclui na listagem os produtos sem mínimo definido (tela de configuração).
   * Sem esta opção a lista traz apenas quem está no ponto de pedido (saldo <= mínimo).
   */
  incluirSemMinimo?: boolean
}

/**
 * Monta a lista de reposição: uma linha por produto (decisão de compra é do produto, não do lote),
 * ordenada do mais crítico (menor cobertura) para o menos crítico.
 *
 * Por padrão entram só os produtos que precisam de compra — situações 'abaixo' e 'no_minimo'
 * (saldo <= mínimo). Produtos acima do mínimo nunca entram: nada a comprar.
 * Com `incluirSemMinimo` a listagem fica completa para a tela de configuração, incluindo os
 * produtos sem ponto de pedido (ordem: no ponto de pedido primeiro, sem mínimo no fim).
 */
export function montarReposicao(produtos: Produto[], lotes: Lote[], hoje = hojeISO(), opcoes: OpcoesReposicao = {}): ReposicaoProduto[] {
  const porProduto = agruparLotes(lotes)
  const itens: ReposicaoProduto[] = []
  const incluirSemMinimo = opcoes.incluirSemMinimo === true
  for (const produto of produtos) {
    if (!produto.controla_estoque) continue
    const resumo = resumirProduto(porProduto.get(produto.id) ?? [], hoje)
    if (!produto.ativo && resumo.saldo <= 0) continue
    const minimo = produto.estoque_minimo ?? null
    const situacao = situacaoReposicao(resumo.saldo, minimo)
    if (situacao === 'sem_minimo' && !incluirSemMinimo) continue
    // Acima do mínimo não precisa de compra: fora da lista mesmo na configuração.
    if (situacao === 'acima') continue
    itens.push({
      produto,
      saldo: resumo.saldo,
      minimo,
      cobertura: calcularCobertura(resumo.saldo, minimo),
      sugestaoCompra: sugerirCompra(resumo.saldo, minimo, produto.conteudo_embalagem),
      situacao,
      situacaoLote: resumo.situacao,
    })
  }
  return itens.sort(
    (a, b) =>
      (a.cobertura ?? Number.POSITIVE_INFINITY) - (b.cobertura ?? Number.POSITIVE_INFINITY) ||
      a.produto.nome.localeCompare(b.produto.nome, 'pt-BR'),
  )
}

/**
 * Recorte da lista de reposição para quem precisa de compra (abaixo ou exatamente no mínimo).
 *
 * É a ÚNICA porta de entrada da lista de compras (chip "Repor", tabela e arquivo exportado),
 * sempre aplicada sobre `montarReposicao(produtos, lotes)` — nunca sobre saldos de lote.
 * Assim a contagem do chip, as linhas da tabela e o arquivo levam uma linha por PRODUTO.
 */
export function precisaRepor(itens: ReposicaoProduto[]): ReposicaoProduto[] {
  return itens.filter(i => noPontoDePedido(i.situacao))
}

/** Saldo total por produto (soma dos lotes com saldo), para cruzar com a lista de estoque. */
export function saldosPorProduto(lotes: Lote[]): Map<string, number> {
  const mapa = new Map<string, number>()
  for (const l of lotes) mapa.set(l.produto_id, Math.round(((mapa.get(l.produto_id) ?? 0) + l.saldo) * 1000) / 1000)
  return mapa
}

// ───────────────────────────── Lista de compras (seleção) ─────────────────────────────

/**
 * Uma linha da "Lista de compras" exportada: o produto já decidido por `montarReposicao()`
 * (saldo, mínimo, cobertura e sugestão de compra) mais o texto de categoria/unidade.
 */
export interface ItemCompra {
  produto: Produto
  codigo: string
  categoria: string
  unidade: Unidade
  saldo: number
  minimo: number | null
  cobertura: number | null
  /** Já arredondada pelo conteúdo da embalagem (de `sugerirCompra()`). */
  sugestaoCompra: number
  situacao: SituacaoPedido
}

/**
 * Recorte da lista de compras: mantém apenas os produtos marcados, NA ORDEM RECEBIDA
 * (a de `montarReposicao()`: do mais crítico ao menos crítico).
 *
 * Nada é recalculado aqui: saldo/mínimo/cobertura/sugestão vêm de `ReposicaoProduto` — a
 * decisão de "o que comprar e quanto" continua sendo só de `lib/estoque.ts`.
 * - `selecionados` vazio ⇒ lista vazia;
 * - id que não está na lista é ignorado (não quebra);
 * - item no mínimo (`sugestaoCompra === 0`) é preservado: o operador pode querer comprar antes de zerar.
 */
export function filtrarItensCompra(
  itens: readonly ReposicaoProduto[],
  selecionados: ReadonlySet<string>,
  nomeCategoria: (id: string | null) => string = () => '',
): ItemCompra[] {
  if (selecionados.size === 0) return []
  const escolhidos: ItemCompra[] = []
  for (const item of itens) {
    if (!selecionados.has(item.produto.id)) continue
    // Só entram produtos no ponto de pedido (é o que `montarReposicao` devolve por padrão).
    if (!noPontoDePedido(item.situacao)) continue
    escolhidos.push({
      produto: item.produto,
      codigo: item.produto.codigo_interno,
      categoria: nomeCategoria(item.produto.categoria_id),
      unidade: item.produto.unidade,
      saldo: item.saldo,
      minimo: item.minimo,
      cobertura: item.cobertura,
      sugestaoCompra: item.sugestaoCompra,
      situacao: comoSituacaoPedido(item.situacao),
    })
  }
  return escolhidos
}
