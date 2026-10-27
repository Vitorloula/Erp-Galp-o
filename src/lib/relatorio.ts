import { descreverSituacao, montarLinhasEstoque, montarReposicao, type Situacao, type SituacaoReposicao } from './estoque'
import { NOME_TIPO, arred, grupoDoTipo, hojeISO } from './formato'
import type { Intervalo } from './periodos'
import { intervaloParaInstantes } from './periodos'
import type { Lote, Movimentacao, Produto, TipoMov, Unidade } from './tipos'

export interface LinhaMovRel {
  id: number
  data: Date
  tipo: TipoMov
  tipoNome: string
  codigo: string
  produto: string
  unidade: string
  lote: string
  validade: string | null
  quantidade: number
  documento: string
  usuario: string
  observacao: string
}

export interface LinhaResumoRel {
  codigo: string
  produto: string
  categoria: string
  unidade: string
  saldoInicial: number
  entradas: number
  saidas: number
  /** Ajustes de inventário e correções (com sinal). */
  ajustes: number
  saldoFinal: number
}

export interface LinhaPosicaoRel {
  codigo: string
  produto: string
  categoria: string
  lote: string
  validade: string | null
  saldo: number
  unidade: string
  situacao: Situacao
  situacaoTexto: string
}

/**
 * Uma linha da "Lista de compras (reposição)": a decisão de compra de UM produto
 * (não do lote), já calculada por `lib/estoque.ts`.
 */
export interface LinhaCompraRel {
  codigo: string
  produto: string
  categoria: string
  unidade: Unidade
  saldo: number
  minimo: number | null
  /** saldo / mínimo, 2 casas — de `calcularCobertura()`. */
  cobertura: number | null
  /** De `sugerirCompra()`: já arredondada pelo conteúdo da embalagem. */
  sugestaoCompra: number
  /** 'abaixo' | 'no_minimo' — de `situacaoReposicao()` via `montarReposicao()`. */
  situacao: Extract<SituacaoReposicao, 'abaixo' | 'no_minimo'>
}

export interface Relatorio {
  intervalo: Intervalo
  geradoEm: Date
  movimentacoes: LinhaMovRel[]
  resumo: LinhaResumoRel[]
  posicao: LinhaPosicaoRel[]
  /** Só os produtos no ponto de pedido (saldo <= mínimo), do mais crítico ao menos crítico. */
  compras: LinhaCompraRel[]
  totais: { entradas: number; saidas: number; ajustes: number }
}

/**
 * Monta o relatório do período (pela data em que cada movimentação aconteceu).
 * @param movsDesdeInicio movimentações de `intervalo.de` até AGORA (as posteriores ao período
 *   são usadas para reconstituir o saldo exato no fim do período).
 */
export function montarRelatorio(
  intervalo: Intervalo,
  produtos: Produto[],
  lotes: Lote[],
  movsDesdeInicio: Movimentacao[],
  nomeCategoria: (id: string | null) => string,
  produtoId?: string,
  /** Produtos já recortados por busca/categoria (aplicados só a Posição e Compras). */
  recorteProdutos?: Produto[],
): Relatorio {
  // Compara instantes (e não textos): o banco pode devolver "…Z" ou "…-03:00".
  const fim = Date.parse(intervaloParaInstantes(intervalo).ate)
  const produtoPorId = new Map(produtos.map(p => [p.id, p]))
  const lotePorId = new Map(lotes.map(l => [l.lote_id, l]))
  const doFiltro = (pid: string) => !produtoId || pid === produtoId
  // Posição e Compras respeitam o recorte (busca/categoria); Resumo e Movimentações ficam completos.
  const produtosRecorte = recorteProdutos ?? produtos

  const noPeriodo = movsDesdeInicio
    .filter(m => Date.parse(m.ocorrido_em) <= fim && doFiltro(m.produto_id))
    .sort((a, b) => Date.parse(a.ocorrido_em) - Date.parse(b.ocorrido_em) || a.id - b.id)
  const depois = movsDesdeInicio.filter(m => Date.parse(m.ocorrido_em) > fim)

  const movimentacoes: LinhaMovRel[] = noPeriodo.map(m => {
    const p = produtoPorId.get(m.produto_id)
    const l = lotePorId.get(m.lote_id)
    return {
      id: m.id,
      data: new Date(m.ocorrido_em),
      tipo: m.tipo,
      tipoNome: NOME_TIPO[m.tipo],
      codigo: p?.codigo_interno ?? '',
      produto: p?.nome ?? '',
      unidade: p?.unidade ?? '',
      lote: l?.lote ?? '',
      validade: l?.validade ?? null,
      quantidade: m.delta,
      documento: m.documento ?? '',
      usuario: m.usuario_nome ?? '',
      observacao: [m.observacao, m.referencia_id ? `corrige #${m.referencia_id}` : null].filter(Boolean).join(' · '),
    }
  })

  const saldoAtual = new Map<string, number>()
  for (const l of lotes) saldoAtual.set(l.produto_id, (saldoAtual.get(l.produto_id) ?? 0) + l.saldo)
  const posterior = new Map<string, number>()
  for (const m of depois) posterior.set(m.produto_id, (posterior.get(m.produto_id) ?? 0) + m.delta)

  const resumo: LinhaResumoRel[] = []
  for (const p of produtos) {
    if (!doFiltro(p.id)) continue
    const movs = noPeriodo.filter(m => m.produto_id === p.id)
    const soma = (grupo: ReturnType<typeof grupoDoTipo>) => arred(movs.filter(m => grupoDoTipo(m.tipo) === grupo).reduce((s, m) => s + m.delta, 0))
    const entradas = soma('entrada')
    const saidas = -soma('saida')
    const ajustes = soma('ajuste')
    const saldoFinal = arred((saldoAtual.get(p.id) ?? 0) - (posterior.get(p.id) ?? 0))
    const saldoInicial = arred(saldoFinal - entradas + saidas - ajustes)
    if (!p.ativo && movs.length === 0 && saldoFinal === 0) continue
    resumo.push({
      codigo: p.codigo_interno,
      produto: p.nome,
      categoria: nomeCategoria(p.categoria_id),
      unidade: p.unidade,
      saldoInicial,
      entradas,
      saidas,
      ajustes,
      saldoFinal,
    })
  }

  const posicao: LinhaPosicaoRel[] = montarLinhasEstoque(produtosRecorte.filter(p => doFiltro(p.id)), lotes).map(l => ({
    codigo: l.produto.codigo_interno,
    produto: l.produto.nome,
    categoria: nomeCategoria(l.produto.categoria_id),
    lote: l.lote?.lote ?? '',
    validade: l.validade,
    saldo: l.saldo,
    unidade: l.produto.unidade,
    situacao: l.situacao,
    situacaoTexto: descreverSituacao(l.situacao, l.validade),
  }))

  // A decisão de "o que comprar" vem inteira de lib/estoque.ts (sem mínimo próprio).
  // Sem `incluirSemMinimo`: só quem está no ponto de pedido (abaixo/no mínimo), já ordenado
  // do mais crítico (menor cobertura) para o menos crítico.
  const compras: LinhaCompraRel[] = montarReposicao(
    produtosRecorte.filter(p => doFiltro(p.id)),
    lotes,
    undefined,
    { incluirSemMinimo: false },
  ).flatMap(i =>
    i.situacao === 'abaixo' || i.situacao === 'no_minimo'
      ? [
          {
            codigo: i.produto.codigo_interno,
            produto: i.produto.nome,
            categoria: nomeCategoria(i.produto.categoria_id),
            unidade: i.produto.unidade,
            saldo: i.saldo,
            minimo: i.minimo,
            cobertura: i.cobertura,
            sugestaoCompra: i.sugestaoCompra,
            situacao: i.situacao,
          },
        ]
      : [],
  )

  return {
    intervalo,
    geradoEm: new Date(),
    movimentacoes,
    resumo,
    posicao,
    compras,
    totais: {
      entradas: noPeriodo.filter(m => grupoDoTipo(m.tipo) === 'entrada').length,
      saidas: noPeriodo.filter(m => grupoDoTipo(m.tipo) === 'saida').length,
      ajustes: noPeriodo.filter(m => grupoDoTipo(m.tipo) === 'ajuste').length,
    },
  }
}

export function nomeArquivo(r: Relatorio, ext: string) {
  return `relatorio-estoque_${r.intervalo.de}_a_${r.intervalo.ate}.${ext}`
}

/** `lista-de-compras_2026-10-03.xlsx` (o dia é o da geração, fuso local). */
export function nomeArquivoListaCompra(ext: 'xlsx' | 'pdf', dia = hojeISO()): string {
  return `lista-de-compras_${dia}.${ext}`
}

/** Nome que aparece no topo dos relatórios: empresa e, se houver mais de uma, a loja. */
export function tituloEmpresa(empresa: string, loja: string, variasLojas: boolean) {
  return variasLojas ? `${empresa} — ${loja}` : empresa
}

export function baixarArquivo(conteudo: Blob, nome: string) {
  const url = URL.createObjectURL(conteudo)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export type FormatoArquivo = 'xlsx' | 'pdf'

/** Só o que o helper precisa do toast — evita acoplar a lib ao componente. */
export interface AvisosExportacao {
  sucesso(texto: string): void
  erro(texto: string): void
}

export interface OpcoesExportacao {
  formato: FormatoArquivo
  nome: string
  gerar: () => Promise<Blob>
  avisos: AvisosExportacao
  /** Recebe o formato enquanto gera e `null` ao terminar (controla o "gerando"). */
  aoMudarEstado?: (formato: FormatoArquivo | null) => void
  /** Injetável nos testes; em produção usa o download real. */
  baixar?: (conteudo: Blob, nome: string) => void
}

/** Mensagem padrão de sucesso — a mesma para Estoque e Relatórios. */
export function mensagemExportacao(formato: FormatoArquivo): string {
  return formato === 'xlsx' ? 'Planilha Excel gerada.' : 'PDF gerado.'
}

/**
 * Gera, baixa e avisa — o fluxo único das telas que exportam arquivo (T-018).
 * Devolve `true` quando o download foi disparado; erro vira toast, nunca exceção.
 */
export async function exportarComToast({
  formato,
  nome,
  gerar,
  avisos,
  aoMudarEstado,
  baixar = baixarArquivo,
}: OpcoesExportacao): Promise<boolean> {
  aoMudarEstado?.(formato)
  try {
    const conteudo = await gerar()
    baixar(conteudo, nome)
    avisos.sucesso(mensagemExportacao(formato))
    return true
  } catch (e) {
    avisos.erro('Não foi possível gerar o arquivo: ' + (e as Error).message)
    return false
  } finally {
    aoMudarEstado?.(null)
  }
}
