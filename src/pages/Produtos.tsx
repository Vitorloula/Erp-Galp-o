import { ChevronRight, Package, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ProdutoForm } from '../components/ProdutoForm'
import { BadgeSituacao, Cabecalho, Carregando, Vazio, cx } from '../components/ui'
import { useDados } from '../contexto/Dados'
import { produtoCombina, resumirProduto } from '../lib/estoque'
import { CATEGORIAS, NOME_CATEGORIA, formatarNumero, formatarValidade } from '../lib/formato'

export function Produtos() {
  const { produtos, lotesPorProduto, carregando } = useDados()
  const [termo, setTermo] = useState('')
  const [categoria, setCategoria] = useState('')
  const [inativos, setInativos] = useState(false)
  const [novo, setNovo] = useState(false)

  const lista = useMemo(
    () =>
      produtos
        .filter(p => (inativos || p.ativo) && (!categoria || p.categoria === categoria) && produtoCombina(p, termo))
        .map(p => ({ p, r: resumirProduto(lotesPorProduto.get(p.id) ?? []) })),
    [produtos, lotesPorProduto, termo, categoria, inativos],
  )

  if (carregando) return <Carregando />

  return (
    <div>
      <Cabecalho
        titulo="Produtos"
        subtitulo={`${produtos.filter(p => p.ativo).length} produtos ativos`}
        acoes={
          <button className="btn btn-primario" onClick={() => setNovo(true)}>
            <Plus className="size-4.5" /> Novo produto
          </button>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-slate-400" />
          <input className="campo pl-10" placeholder="Buscar por nome, código ou fabricante" value={termo} onChange={e => setTermo(e.target.value)} aria-label="Buscar" />
        </div>
        <select className="campo sm:w-52" value={categoria} onChange={e => setCategoria(e.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {CATEGORIAS.map(c => <option key={c.valor} value={c.valor}>{c.nome}</option>)}
        </select>
        <label className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-600">
          <input type="checkbox" className="size-4 accent-emerald-700" checked={inativos} onChange={e => setInativos(e.target.checked)} />
          Mostrar inativos
        </label>
      </div>

      {lista.length === 0 ? (
        <div className="cartao">
          <Vazio icone={Package} titulo="Nenhum produto encontrado" texto="Cadastre o primeiro produto ou ajuste a busca.">
            <button className="btn btn-primario" onClick={() => setNovo(true)}><Plus className="size-4.5" /> Novo produto</button>
          </Vazio>
        </div>
      ) : (
        <div className="cartao divide-y divide-slate-100 overflow-hidden">
          {lista.map(({ p, r }) => (
            <Link key={p.id} to={`/produtos/${p.id}`} className={cx('flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50', !p.ativo && 'opacity-55')}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">
                  {p.nome} {!p.ativo && <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600">inativo</span>}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {p.codigo_interno} · {NOME_CATEGORIA[p.categoria]}
                  {p.codigo_barras ? ` · ${p.codigo_barras}` : ' · sem código de barras'}
                </p>
              </div>
              <div className="hidden text-right text-xs text-slate-500 sm:block">
                {r.proximaValidade && <>próx. val. <strong className="text-slate-700">{formatarValidade(r.proximaValidade)}</strong></>}
              </div>
              <div className="w-28 text-right">
                <p className="text-sm font-bold tabular-nums text-slate-900">{formatarNumero(r.saldo)} {p.unidade}</p>
                {r.situacao !== 'ok' && <BadgeSituacao situacao={r.situacao} validade={r.proximaValidade} curto />}
              </div>
              <ChevronRight className="size-4.5 shrink-0 text-slate-300" />
            </Link>
          ))}
        </div>
      )}

      <ProdutoForm aberto={novo} aoFechar={() => setNovo(false)} />
    </div>
  )
}
