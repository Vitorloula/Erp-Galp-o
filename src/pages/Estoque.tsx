import { ArrowUpFromLine, Boxes, FileSpreadsheet, FileText, LoaderCircle, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ListaReposicao } from '../components/ListaReposicao'
import { ReposicaoForm } from '../components/ReposicaoForm'
import { useToast } from '../components/Toast'
import { Aviso, BadgeSituacao, Cabecalho, Carregando, Vazio, cx } from '../components/ui'
import { useDados } from '../contexto/Dados'
import { useAtiva } from '../contexto/Empresa'
import {
  DIAS_ALERTA,
  PRIORIDADE,
  filtrarItensCompra,
  montarLinhasEstoque,
  montarReposicao,
  precisaRepor,
  produtoCombina,
  type LinhaEstoque,
  type ReposicaoProduto,
  type Situacao,
} from '../lib/estoque'
import { formatarData, formatarEmbalagens, formatarNumero, formatarValidade } from '../lib/formato'
import { baixarArquivo, tituloEmpresa } from '../lib/relatorio'
import type { Produto } from '../lib/tipos'

type Filtro = 'todos' | Situacao | 'abaixo'
type Ordem = 'nome' | 'validade' | 'situacao'

const FILTROS: { valor: Filtro; nome: string; ponto?: string }[] = [
  { valor: 'todos', nome: 'Todos' },
  { valor: 'vencido', nome: 'Vencidos', ponto: 'bg-red-500' },
  { valor: 'zerado', nome: 'Zerados', ponto: 'bg-red-500' },
  { valor: 'vencendo', nome: `Vencem em ${DIAS_ALERTA} dias`, ponto: 'bg-amber-400' },
  { valor: 'abaixo', nome: 'Repor', ponto: 'bg-amber-400' },
  { valor: 'ok', nome: 'Em dia', ponto: 'bg-emerald-500' },
]

/** Chave do aviso "como usar" — aparece só na primeira visita à lista de compras. */
const DICA_LISTA_COMPRAS = 'dica-lista-compras'

function ordenar(linhas: LinhaEstoque[], ordem: Ordem) {
  const porNome = (a: LinhaEstoque, b: LinhaEstoque) => a.produto.nome.localeCompare(b.produto.nome, 'pt-BR')
  const porValidade = (a: LinhaEstoque, b: LinhaEstoque) => (a.validade ?? '9999').localeCompare(b.validade ?? '9999')
  return [...linhas].sort((a, b) =>
    ordem === 'validade'
      ? porValidade(a, b) || porNome(a, b)
      : ordem === 'situacao'
        ? PRIORIDADE[a.situacao] - PRIORIDADE[b.situacao] || porValidade(a, b)
        : porNome(a, b) || porValidade(a, b),
  )
}

/**
 * Ordem da lista "Repor". A compra é decidida por produto, não por lote: a ordem padrão é a de
 * `montarReposicao()` (cobertura crescente = mais crítico primeiro, ver `ReposicaoProduto`).
 * "Ordenar por validade" não se aplica a esta lista — o lote não faz parte da decisão de compra.
 */
function ordenarReposicao(itens: ReposicaoProduto[], ordem: Ordem): ReposicaoProduto[] {
  if (ordem !== 'nome') return itens
  return [...itens].sort((a, b) => a.produto.nome.localeCompare(b.produto.nome, 'pt-BR'))
}

export function Estoque() {
  const { produtos, lotes, categorias, nomeCategoria, carregando } = useDados()
  const { pode, empresa, loja, lojas } = useAtiva()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const navegar = useNavigate()
  const filtro = (FILTROS.find(f => f.valor === params.get('filtro'))?.valor ?? 'todos') as Filtro
  const [termo, setTermo] = useState('')
  const [categoria, setCategoria] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('nome')
  const [editando, setEditando] = useState<Produto | null>(null)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [gerando, setGerando] = useState<'xlsx' | 'pdf' | null>(null)
  const [dicaVisivel, setDicaVisivel] = useState(false)

  // Linhas por lote: alimentam os chips Vencidos/Zerados/Vencem/Em dia e o filtro "Todos".
  const todas = useMemo(() => montarLinhasEstoque(produtos, lotes), [produtos, lotes])
  const base = useMemo(
    () => todas.filter(l => (!categoria || l.produto.categoria_id === categoria) && produtoCombina(l.produto, termo)),
    [todas, categoria, termo],
  )

  // ── Lista de compras: fonte ÚNICA (T-009) ──────────────────────────────────────────────
  // A decisão de compra vem inteira de lib/estoque.ts e é calculada UMA vez; o chip "Repor",
  // a lista e o arquivo exportado leem exatamente este array (filtrado depois, pela tela).
  const reposicao = useMemo(() => montarReposicao(produtos, lotes), [produtos, lotes])
  const visiveisReposicao = useMemo(
    () =>
      precisaRepor(reposicao).filter(i => (!categoria || i.produto.categoria_id === categoria) && produtoCombina(i.produto, termo)),
    [reposicao, categoria, termo],
  )
  const itensSelecionados = useMemo(
    () => filtrarItensCompra(visiveisReposicao, selecionados, nomeCategoria),
    [visiveisReposicao, selecionados, nomeCategoria],
  )
  const marcadosVisiveis = useMemo(() => visiveisReposicao.filter(i => selecionados.has(i.produto.id)).length, [visiveisReposicao, selecionados])

  const contagem = useMemo(() => {
    const c: Record<Filtro, number> = { todos: base.length, vencido: 0, zerado: 0, vencendo: 0, abaixo: 0, ok: 0 }
    base.forEach(l => c[l.situacao]++)
    // Nenhum recálculo: o chip "Repor" mostra o tamanho da MESMA lista que a tabela desenha.
    c.abaixo = visiveisReposicao.length
    return c
  }, [base, visiveisReposicao])

  /** Linhas por lote (tabela padrão). O filtro "Repor" NÃO usa estas linhas — ele usa `visiveisReposicao`. */
  const linhas = useMemo(
    () => ordenar(filtro === 'todos' ? base : base.filter(l => l.situacao === filtro), ordem),
    [base, filtro, ordem],
  )

  /** Lista de compras já na ordem escolhida na tela (a mesma da tabela e do arquivo). */
  const itensRepor = useMemo(() => ordenarReposicao(visiveisReposicao, ordem), [visiveisReposicao, ordem])

  // Seleção só faz sentido dentro da lista de compras.
  useEffect(() => {
    if (filtro !== 'abaixo') setSelecionados(new Set())
  }, [filtro])

  // Dica de uso na primeira visita (não insiste depois que o operador já viu).
  useEffect(() => {
    if (filtro !== 'abaixo') return
    try {
      if (!localStorage.getItem(DICA_LISTA_COMPRAS)) setDicaVisivel(true)
    } catch {
      // navegador sem localStorage: simplesmente não mostra a dica
    }
  }, [filtro])

  const dispensarDica = useCallback(() => {
    setDicaVisivel(false)
    try {
      localStorage.setItem(DICA_LISTA_COMPRAS, '1')
    } catch {
      // sem localStorage: a dica volta na próxima visita, sem erro
    }
  }, [])

  function mudarFiltro(f: Filtro) {
    const p = new URLSearchParams(params)
    if (f === 'todos') p.delete('filtro')
    else p.set('filtro', f)
    setParams(p, { replace: true })
  }

  const alternar = useCallback((id: string) => {
    setSelecionados(s => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }, [])

  const marcarTodos = useCallback(() => {
    setSelecionados(s => {
      const todos = itensRepor.length > 0 && itensRepor.every(i => s.has(i.produto.id))
      return todos ? new Set() : new Set(itensRepor.map(i => i.produto.id))
    })
  }, [itensRepor])

  async function exportarCompra(formato: 'xlsx' | 'pdf') {
    if (itensSelecionados.length === 0) {
      toast.erro('Selecione ao menos um produto')
      return
    }
    setGerando(formato)
    try {
      const { gerarListaCompraExcel, gerarListaCompraPdf, nomeArquivoListaCompra } = await import('../lib/exportar/lista-compra')
      const titulo = tituloEmpresa(empresa.nome, loja.nome, (lojas?.length ?? 0) > 1)
      const blob =
        formato === 'xlsx'
          ? await gerarListaCompraExcel(itensSelecionados, titulo)
          : await gerarListaCompraPdf(itensSelecionados, titulo)
      baixarArquivo(blob, nomeArquivoListaCompra(formato))
      toast.sucesso(`Lista com ${itensSelecionados.length} ${itensSelecionados.length === 1 ? 'produto' : 'produtos'} gerada.`)
    } catch (e) {
      toast.erro('Não foi possível gerar o arquivo: ' + (e as Error).message)
    } finally {
      setGerando(null)
    }
  }

  if (carregando) return <Carregando />

  const todosMarcados = itensRepor.length > 0 && marcadosVisiveis === itensRepor.length
  const semFiltro = !termo && !categoria

  return (
    <div>
      <Cabecalho
        titulo="Estoque atual"
        subtitulo="Saldo consolidado em tempo real a cada entrada ou saída."
        acoes={
          <Link to="/relatorios" className="btn btn-secundario">
            <FileSpreadsheet className="size-4.5" /> Exportar
          </Link>
        }
      />

      <div className="mb-4 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-slate-400" />
            <input className="campo pl-10" placeholder="Buscar produto, código ou fabricante" value={termo} onChange={e => setTermo(e.target.value)} aria-label="Buscar" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <select className="campo sm:w-48" value={categoria} onChange={e => setCategoria(e.target.value)} aria-label="Categoria">
              <option value="">Todas as categorias</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <select className="campo sm:w-44" value={ordem} onChange={e => setOrdem(e.target.value as Ordem)} aria-label="Ordenar por">
              <option value="nome">Ordem: nome</option>
              <option value="validade">Ordem: validade</option>
              <option value="situacao">Ordem: alertas</option>
            </select>
          </div>
        </div>
        <div role="group" aria-label="Filtrar estoque" className="-mx-4 flex gap-2 rolagem-x overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {FILTROS.map(f => (
            <button
              key={f.valor}
              type="button"
              aria-pressed={filtro === f.valor}
              onClick={() => mudarFiltro(f.valor)}
              className={cx('chip', filtro === f.valor ? 'chip-ativo' : 'chip-inativo')}
            >
              {f.ponto && <span className={cx('size-2 rounded-full', f.ponto)} />}
              {f.nome}
              <span className={cx('rounded-full px-1.5 text-xs', filtro === f.valor ? 'bg-white/20' : 'bg-slate-100')}>{contagem[f.valor]}</span>
            </button>
          ))}
        </div>
      </div>

      {filtro === 'abaixo' ? (
        <div className="space-y-3">
          {dicaVisivel && (
            <Aviso tom="info">
              <span className="flex items-start justify-between gap-3">
                <span>Marque os produtos que vai comprar e baixe a lista em Excel ou PDF para levar ao fornecedor.</span>
                <button type="button" className="btn btn-fantasma -m-1 shrink-0 p-1" onClick={dispensarDica} aria-label="Fechar dica">
                  <X className="size-4" />
                </button>
              </span>
            </Aviso>
          )}

          <ListaReposicao
            itens={itensRepor}
            aoEditar={pode.movimentar ? setEditando : undefined}
            selecionados={selecionados}
            aoAlternar={alternar}
            aoMarcarTodosToggle={marcarTodos}
            vazio={
              semFiltro
                ? {
                    icone: Boxes,
                    titulo: 'Nada para repor',
                    texto: 'Nenhum produto está no estoque mínimo. Defina o mínimo em Produtos para receber a sugestão de compra.',
                  }
                : {
                    icone: Search,
                    titulo: 'Nada encontrado',
                    texto: 'Ajuste a busca ou a categoria.',
                    children: (
                      <button
                        type="button"
                        className="btn btn-secundario"
                        onClick={() => {
                          setTermo('')
                          setCategoria('')
                        }}
                      >
                        Limpar filtros
                      </button>
                    ),
                  }
            }
          />

          {itensRepor.length > 0 && (
            <div role="region" aria-label="Ações da lista de compras" className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 lg:bottom-0">
              <div className="cartao flex flex-wrap items-center gap-x-3 gap-y-2 border-emerald-200 bg-white/95 p-3 shadow-lg backdrop-blur">
                <p className="text-sm font-semibold text-slate-700" aria-live="polite" aria-atomic="true" data-selecao>
                  {marcadosVisiveis === 0 ? (
                    <>Selecione produtos para baixar a lista</>
                  ) : (
                    <>
                      {marcadosVisiveis} de {itensRepor.length} selecionado{marcadosVisiveis === 1 ? '' : 's'}
                    </>
                  )}
                </p>

                <div className="flex gap-2">
                  <button type="button" className="btn btn-fantasma px-2.5 py-1.5 text-xs" onClick={marcarTodos} disabled={itensRepor.length === 0}>
                    {todosMarcados ? 'Desmarcar todos' : 'Marcar todos'}
                  </button>
                  <button type="button" className="btn btn-fantasma px-2.5 py-1.5 text-xs" onClick={() => setSelecionados(new Set())} disabled={marcadosVisiveis === 0}>
                    Limpar
                  </button>
                </div>

                <div className="grid w-full grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto">
                  <button
                    type="button"
                    className="btn btn-primario"
                    onClick={() => exportarCompra('xlsx')}
                    disabled={!!gerando || itensSelecionados.length === 0}
                    title={itensSelecionados.length === 0 ? 'Marque ao menos um produto para baixar' : undefined}
                  >
                    {gerando === 'xlsx' ? <LoaderCircle className="size-4.5 animate-spin" /> : <FileSpreadsheet className="size-4.5" />}
                    <span>Baixar Excel</span>
                    {itensSelecionados.length === 0 && <span className="sr-only">Marque ao menos um produto para baixar</span>}
                    {gerando === 'xlsx' && <span className="sr-only">Gerando arquivo…</span>}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secundario"
                    onClick={() => exportarCompra('pdf')}
                    disabled={!!gerando || itensSelecionados.length === 0}
                    title={itensSelecionados.length === 0 ? 'Marque ao menos um produto para baixar' : undefined}
                  >
                    {gerando === 'pdf' ? <LoaderCircle className="size-4.5 animate-spin" /> : <FileText className="size-4.5 text-red-600" />}
                    <span>Baixar PDF</span>
                    {itensSelecionados.length === 0 && <span className="sr-only">Marque ao menos um produto para baixar</span>}
                    {gerando === 'pdf' && <span className="sr-only">Gerando arquivo…</span>}
                  </button>
                </div>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500">
            <span className="mr-1 inline-block size-2.5 rounded-sm bg-red-500 align-middle" /> Vermelho: vencido ou sem estoque ·{' '}
            <span className="mx-1 inline-block size-2.5 rounded-sm bg-amber-400 align-middle" /> Amarelo: vence em até {DIAS_ALERTA} dias ·{' '}
            <strong className="font-semibold text-slate-600">Repor</strong>: saldo no estoque mínimo ou abaixo dele. Marque os produtos e baixe a lista para
            levar ao fornecedor.
          </p>
        </div>
      ) : linhas.length === 0 ? (
        <div className="cartao">
          <Vazio icone={Boxes} titulo="Nada encontrado" texto="Ajuste a busca ou os filtros." />
        </div>
      ) : (
        <>
          {/* Tabela (computador/tablet) */}
          <div className="cartao hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-3 py-3">Lote</th>
                  <th className="px-3 py-3">Validade</th>
                  <th className="px-3 py-3 text-right">Saldo</th>
                  <th className="px-3 py-3">Situação</th>
                  <th className="px-3 py-3"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {linhas.map(l => (
                  <tr key={l.chave} data-linha-estoque data-situacao={l.situacao} onClick={() => navegar(`/produtos/${l.produto.id}`)} className={cx('cursor-pointer transition hover:brightness-[.97]', `linha-${l.situacao}`)}>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{l.produto.nome}</p>
                      <p className="text-xs opacity-70">{l.produto.codigo_interno} · {nomeCategoria(l.produto.categoria_id)}</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{l.lote?.lote || '—'}</td>
                    <td className="px-3 py-3" title={formatarData(l.validade)}>
                      <span className="font-semibold">{formatarValidade(l.validade)}</span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      <span className="font-bold">{formatarNumero(l.saldo)}</span> {l.produto.unidade}
                      {formatarEmbalagens(l.saldo, l.produto.conteudo_embalagem) && (
                        <p className="text-xs opacity-60">{formatarEmbalagens(l.saldo, l.produto.conteudo_embalagem)}</p>
                      )}
                      {l.produto.estoque_minimo !== null && <p className="text-xs opacity-60">mín. {formatarNumero(l.produto.estoque_minimo)}</p>}
                    </td>
                    <td className="px-3 py-3"><BadgeSituacao situacao={l.situacao} validade={l.validade} /></td>
                    <td className="px-3 py-3 text-right">
                      {l.lote && pode.movimentar && (
                        <Link
                          to={`/movimentar?tipo=saida&produto=${l.produto.id}&lote=${l.lote.lote_id}`}
                          onClick={e => e.stopPropagation()}
                          className="btn btn-secundario px-2.5 py-1.5 text-xs"
                          title="Dar baixa"
                        >
                          <ArrowUpFromLine className="size-3.5" /> Baixa
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cartões (celular) */}
          <div className="space-y-2 md:hidden">
            {linhas.map(l => (
              <Link key={l.chave} data-linha-estoque data-situacao={l.situacao} to={`/produtos/${l.produto.id}`} className={cx('block rounded-2xl border border-slate-200 p-3.5 shadow-sm', `linha-${l.situacao}`)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold leading-snug">{l.produto.nome}</p>
                    <p className="text-xs opacity-70">
                      {l.produto.codigo_interno}
                      {l.lote?.lote && ` · Lote ${l.lote.lote}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold tabular-nums">{formatarNumero(l.saldo)} {l.produto.unidade}</p>
                    {formatarEmbalagens(l.saldo, l.produto.conteudo_embalagem) && <p className="text-xs opacity-60">{formatarEmbalagens(l.saldo, l.produto.conteudo_embalagem)}</p>}
                    {l.produto.estoque_minimo !== null && <p className="text-xs opacity-60">mín. {formatarNumero(l.produto.estoque_minimo)}</p>}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-sm">
                    Validade <strong>{formatarValidade(l.validade)}</strong>
                  </span>
                  <BadgeSituacao situacao={l.situacao} validade={l.validade} />
                </div>
              </Link>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            <span className="mr-1 inline-block size-2.5 rounded-sm bg-red-500 align-middle" /> Vermelho: vencido ou sem estoque ·{' '}
            <span className="mx-1 inline-block size-2.5 rounded-sm bg-amber-400 align-middle" /> Amarelo: vence em até {DIAS_ALERTA} dias ·{' '}
            <strong className="font-semibold text-slate-600">Repor</strong>: saldo no estoque mínimo ou abaixo dele
          </p>
        </>
      )}

      <ReposicaoForm produto={editando} aoFechar={() => setEditando(null)} />
    </div>
  )
}
