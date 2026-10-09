import { ArrowUpFromLine, Boxes, FileSpreadsheet, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { BadgeSituacao, Cabecalho, Carregando, Vazio, cx } from '../components/ui'
import { useDados } from '../contexto/Dados'
import { DIAS_ALERTA, PRIORIDADE, montarLinhasEstoque, produtoCombina, type LinhaEstoque, type Situacao } from '../lib/estoque'
import { CATEGORIAS, NOME_CATEGORIA, formatarData, formatarEmbalagens, formatarNumero, formatarValidade } from '../lib/formato'

type Filtro = 'todos' | Situacao
type Ordem = 'nome' | 'validade' | 'situacao'

const FILTROS: { valor: Filtro; nome: string; ponto?: string }[] = [
  { valor: 'todos', nome: 'Todos' },
  { valor: 'vencido', nome: 'Vencidos', ponto: 'bg-red-500' },
  { valor: 'zerado', nome: 'Zerados', ponto: 'bg-red-500' },
  { valor: 'vencendo', nome: `Vencem em ${DIAS_ALERTA} dias`, ponto: 'bg-amber-400' },
  { valor: 'ok', nome: 'Em dia', ponto: 'bg-emerald-500' },
]

function ordenar(linhas: LinhaEstoque[], ordem: Ordem) {
  const porNome = (a: LinhaEstoque, b: LinhaEstoque) => a.produto.nome.localeCompare(b.produto.nome, 'pt-BR')
  const porValidade = (a: LinhaEstoque, b: LinhaEstoque) => (a.validade ?? '9999').localeCompare(b.validade ?? '9999')
  return [...linhas].sort((a, b) =>
    ordem === 'validade' ? porValidade(a, b) || porNome(a, b)
    : ordem === 'situacao' ? PRIORIDADE[a.situacao] - PRIORIDADE[b.situacao] || porValidade(a, b)
    : porNome(a, b) || porValidade(a, b),
  )
}

export function Estoque() {
  const { produtos, lotes, carregando } = useDados()
  const [params, setParams] = useSearchParams()
  const navegar = useNavigate()
  const filtro = (FILTROS.find(f => f.valor === params.get('filtro'))?.valor ?? 'todos') as Filtro
  const [termo, setTermo] = useState('')
  const [categoria, setCategoria] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('nome')

  const todas = useMemo(() => montarLinhasEstoque(produtos, lotes), [produtos, lotes])
  const base = useMemo(() => todas.filter(l => (!categoria || l.produto.categoria === categoria) && produtoCombina(l.produto, termo)), [todas, categoria, termo])
  const contagem = useMemo(() => {
    const c: Record<Filtro, number> = { todos: base.length, vencido: 0, zerado: 0, vencendo: 0, ok: 0 }
    base.forEach(l => c[l.situacao]++)
    return c
  }, [base])
  const linhas = useMemo(() => ordenar(filtro === 'todos' ? base : base.filter(l => l.situacao === filtro), ordem), [base, filtro, ordem])

  function mudarFiltro(f: Filtro) {
    const p = new URLSearchParams(params)
    if (f === 'todos') p.delete('filtro')
    else p.set('filtro', f)
    setParams(p, { replace: true })
  }

  if (carregando) return <Carregando />

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
              {CATEGORIAS.map(c => <option key={c.valor} value={c.valor}>{c.nome}</option>)}
            </select>
            <select className="campo sm:w-44" value={ordem} onChange={e => setOrdem(e.target.value as Ordem)} aria-label="Ordenar por">
              <option value="nome">Ordem: nome</option>
              <option value="validade">Ordem: validade</option>
              <option value="situacao">Ordem: alertas</option>
            </select>
          </div>
        </div>
        <div className="-mx-4 flex gap-2 rolagem-x overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {FILTROS.map(f => (
            <button key={f.valor} onClick={() => mudarFiltro(f.valor)} className={cx('chip', filtro === f.valor ? 'chip-ativo' : 'chip-inativo')}>
              {f.ponto && <span className={cx('size-2 rounded-full', f.ponto)} />}
              {f.nome}
              <span className={cx('rounded-full px-1.5 text-xs', filtro === f.valor ? 'bg-white/20' : 'bg-slate-100')}>{contagem[f.valor]}</span>
            </button>
          ))}
        </div>
      </div>

      {linhas.length === 0 ? (
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
                      <p className="text-xs opacity-70">{l.produto.codigo_interno} · {NOME_CATEGORIA[l.produto.categoria]}</p>
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
                    </td>
                    <td className="px-3 py-3"><BadgeSituacao situacao={l.situacao} validade={l.validade} /></td>
                    <td className="px-3 py-3 text-right">
                      {l.lote && (
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
            <span className="mx-1 inline-block size-2.5 rounded-sm bg-amber-400 align-middle" /> Amarelo: vence em até {DIAS_ALERTA} dias
          </p>
        </>
      )}
    </div>
  )
}
