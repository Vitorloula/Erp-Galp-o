import { ChevronRight, Package, Pencil, Plus, Search, Tags, Trash2, Upload } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ImportarCatalogo } from '../components/ImportarCatalogo'
import { Paginacao } from '../components/Paginacao'
import { ProdutoForm } from '../components/ProdutoForm'
import { useToast } from '../components/Toast'
import { Aviso, BadgeSituacao, Cabecalho, Carregando, Modal, Vazio, cx } from '../components/ui'
import { useDados } from '../contexto/Dados'
import { useAtiva } from '../contexto/Empresa'
import { catalogo } from '../lib/dados'
import { produtoCombina, resumirProduto } from '../lib/estoque'
import { exibirCodigo, formatarMoeda, formatarNumero, formatarValidade } from '../lib/formato'
import { paginar } from '../lib/paginacao'
import type { Categoria } from '../lib/tipos'

const POR_PAGINA = 50

export function Produtos() {
  const { produtos, categorias, nomeCategoria, lotesPorProduto, carregando } = useDados()
  const { pode } = useAtiva()
  const [termo, setTermo] = useState('')
  const [categoria, setCategoria] = useState('')
  const [inativos, setInativos] = useState(false)
  const [novo, setNovo] = useState(false)
  const [importando, setImportando] = useState(false)
  const [pagina, setPagina] = useState(1)
  const [editandoCategorias, setEditandoCategorias] = useState(false)

  const lista = useMemo(
    () =>
      produtos
        .filter(p => (inativos || p.ativo) && (!categoria || p.categoria_id === categoria) && produtoCombina(p, termo))
        .map(p => ({ p, r: resumirProduto(lotesPorProduto.get(p.id) ?? []) })),
    [produtos, lotesPorProduto, termo, categoria, inativos],
  )
  const paginados = useMemo(() => paginar(lista, pagina, POR_PAGINA), [lista, pagina])

  useEffect(() => {
    setPagina(1)
  }, [termo, categoria, inativos])

  if (carregando) return <Carregando />

  return (
    <div>
      <Cabecalho
        titulo="Produtos"
        subtitulo={`${produtos.filter(p => p.ativo).length} produtos ativos`}
        acoes={
          <>
            {pode.gerenciarCategorias && (
              <button className="btn btn-secundario" onClick={() => setEditandoCategorias(true)}>
                <Tags className="size-4.5" /> Categorias
              </button>
            )}
            {pode.cadastrarProduto && (
              <button className="btn btn-secundario" onClick={() => setImportando(true)}>
                <Upload className="size-4.5" /> Importar
              </button>
            )}
            {pode.cadastrarProduto && (
              <button className="btn btn-primario" onClick={() => setNovo(true)}>
                <Plus className="size-4.5" /> Novo produto
              </button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-slate-400" />
          <input className="campo pl-10" placeholder="Buscar por nome, código ou fabricante" value={termo} onChange={e => setTermo(e.target.value)} aria-label="Buscar" />
        </div>
        <select className="campo sm:w-52" value={categoria} onChange={e => setCategoria(e.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <label className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-600">
          <input type="checkbox" className="size-4 accent-marca" checked={inativos} onChange={e => setInativos(e.target.checked)} />
          Mostrar inativos
        </label>
      </div>

      {lista.length === 0 ? (
        <div className="cartao">
          <Vazio icone={Package} titulo="Nenhum produto encontrado" texto="Cadastre o primeiro produto ou ajuste a busca.">
            {pode.cadastrarProduto && <button className="btn btn-primario" onClick={() => setNovo(true)}><Plus className="size-4.5" /> Novo produto</button>}
          </Vazio>
        </div>
      ) : (
        <>
          <div className="cartao divide-y divide-slate-100 overflow-hidden">
            {paginados.itens.map(({ p, r }) => (
            <Link key={p.id} to={`/produtos/${p.id}`} className={cx('flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50', !p.ativo && 'opacity-55')}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">
                  {p.nome} {!p.ativo && <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600">inativo</span>}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {p.codigo_interno} · {nomeCategoria(p.categoria_id)}
                  {p.codigos.length ? ` · ${exibirCodigo(p.codigos[0].codigo)}${p.codigos.length > 1 ? ` +${p.codigos.length - 1}` : ''}` : ' · sem código de barras'}
                </p>
              </div>
              <div className="hidden text-right text-xs text-slate-500 sm:block">
                {p.preco_venda !== null && <p className="font-semibold text-slate-700">{formatarMoeda(p.preco_venda)}</p>}
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
          <Paginacao
            pagina={paginados.pagina}
            totalPaginas={paginados.totalPaginas}
            primeiro={paginados.primeiro}
            ultimo={paginados.ultimo}
            total={paginados.total}
            rotulo="produtos"
            aoMudar={setPagina}
          />
        </>
      )}

      <ProdutoForm aberto={novo} aoFechar={() => setNovo(false)} />
      <ImportarCatalogo aberto={importando} aoFechar={() => setImportando(false)} />
      <GerenciarCategorias aberto={editandoCategorias} aoFechar={() => setEditandoCategorias(false)} />
    </div>
  )
}

function GerenciarCategorias({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const { empresa } = useAtiva()
  const { categorias, produtos, recarregar } = useDados()
  const toast = useToast()
  const [nova, setNova] = useState('')
  const [editando, setEditando] = useState<Categoria | null>(null)
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState('')

  async function fazer(acao: () => Promise<unknown>, aviso: string) {
    setErro('')
    try {
      await acao()
      await recarregar('catalogo')
      toast.sucesso(aviso)
      return true
    } catch (e) {
      setErro((e as Error).message)
      return false
    }
  }

  const emUso = (id: string) => produtos.filter(p => p.categoria_id === id).length

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Categorias de produtos">
      <div className="space-y-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <form
          className="flex gap-2"
          onSubmit={async e => {
            e.preventDefault()
            if (await fazer(() => catalogo.criarCategoria(empresa.empresa_id, nova), `Categoria ${nova.trim()} criada.`)) setNova('')
          }}
        >
          <input className="campo" value={nova} onChange={e => setNova(e.target.value)} placeholder="Nova categoria" aria-label="Nova categoria" />
          <button className="btn btn-primario shrink-0" disabled={!nova.trim()}><Plus className="size-4.5" /> Criar</button>
        </form>
        <ul className="cartao divide-y divide-slate-100 overflow-hidden">
          {categorias.map(c => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2">
              {editando?.id === c.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={async e => {
                    e.preventDefault()
                    if (await fazer(() => catalogo.renomearCategoria(c.id, nome), 'Categoria renomeada.')) setEditando(null)
                  }}
                >
                  <input className="campo py-1.5" value={nome} onChange={e => setNome(e.target.value)} aria-label={`Novo nome para ${c.nome}`} autoFocus />
                  <button className="btn btn-primario shrink-0 px-3 py-1.5 text-sm">Salvar</button>
                </form>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium text-slate-800">{c.nome}</span>
                  <span className="text-xs text-slate-400">{emUso(c.id)} produto(s)</span>
                  <button className="btn btn-fantasma p-1.5" onClick={() => { setEditando(c); setNome(c.nome) }} aria-label={`Renomear ${c.nome}`}>
                    <Pencil className="size-4" />
                  </button>
                  <button
                    className="btn btn-fantasma p-1.5 text-red-700"
                    onClick={() => fazer(() => catalogo.excluirCategoria(c.id), `Categoria ${c.nome} excluída.`)}
                    aria-label={`Excluir ${c.nome}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}
