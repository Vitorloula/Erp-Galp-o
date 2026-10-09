import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Package, Pencil, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { CorrecaoModal } from '../components/CorrecaoModal'
import { ListaMovimentacoes } from '../components/ListaMovimentacoes'
import { ProdutoForm } from '../components/ProdutoForm'
import { useToast } from '../components/Toast'
import { Aviso, BadgeSituacao, Carregando, Modal, Vazio, cx } from '../components/ui'
import { useDados } from '../contexto/Dados'
import { useAtiva } from '../contexto/Empresa'
import { catalogo, movimentos } from '../lib/dados'
import { ordenarFefo, resumirProduto, situacaoLote } from '../lib/estoque'
import { UNIDADES, exibirCodigo, formatarData, formatarDataHora, formatarEmbalagens, formatarMoeda, formatarNumero, formatarQtd, formatarValidade } from '../lib/formato'
import type { Lote, Movimentacao } from '../lib/tipos'

export function ProdutoDetalhe() {
  const { id } = useParams()
  const { produtoPorId, lotesPorProduto, nomeCategoria, carregando, versao } = useDados()
  const { empresa, loja, pode } = useAtiva()
  const [editando, setEditando] = useState(false)
  const [loteEditando, setLoteEditando] = useState<Lote | null>(null)
  const [corrigindo, setCorrigindo] = useState<Movimentacao | null>(null)
  const [movs, setMovs] = useState<Movimentacao[] | null>(null)
  const [mostrarZerados, setMostrarZerados] = useState(false)

  const produto = id ? produtoPorId.get(id) : undefined
  const lotes = useMemo(() => ordenarFefo(lotesPorProduto.get(id ?? '') ?? []), [lotesPorProduto, id])
  const resumo = resumirProduto(lotes)

  useEffect(() => {
    if (!id) return
    movimentos.listarMovimentacoes(empresa.empresa_id, loja.id, { produtoId: id, limite: 100 }).then(setMovs).catch(() => setMovs([]))
  }, [id, versao, empresa.empresa_id, loja.id])

  if (carregando) return <Carregando />
  if (!produto)
    return (
      <div className="cartao">
        <Vazio icone={Package} titulo="Produto não encontrado">
          <Link to="/produtos" className="btn btn-secundario">Voltar para produtos</Link>
        </Vazio>
      </div>
    )

  const visiveis = mostrarZerados ? lotes : lotes.filter(l => l.saldo > 0)
  const emb = formatarEmbalagens(resumo.saldo, produto.conteudo_embalagem)

  return (
    <div className="space-y-5">
      <Link to="/produtos" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Produtos
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{produto.nome}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>{produto.codigo_interno}</span>·<span>{nomeCategoria(produto.categoria_id)}</span>
            {!produto.ativo && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600">inativo</span>}
          </div>
        </div>
        {pode.cadastrarProduto && (
          <button className="btn btn-secundario" onClick={() => setEditando(true)}>
            <Pencil className="size-4" /> Editar
          </button>
        )}
      </div>

      {pode.movimentar && (
      <div className="grid grid-cols-3 gap-2">
        <Link to={`/movimentar?tipo=entrada&produto=${produto.id}`} className="btn btn-secundario flex-col gap-1 py-3 sm:flex-row">
          <ArrowDownToLine className="size-5 text-emerald-700" /> Entrada
        </Link>
        <Link to={`/movimentar?tipo=saida&produto=${produto.id}`} className="btn btn-primario flex-col gap-1 py-3 sm:flex-row">
          <ArrowUpFromLine className="size-5" /> Saída
        </Link>
        <Link to={`/movimentar?tipo=ajuste&produto=${produto.id}`} className="btn btn-secundario flex-col gap-1 py-3 sm:flex-row">
          <SlidersHorizontal className="size-5 text-violet-700" /> Ajuste
        </Link>
      </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className={cx('cartao p-4', `linha-${resumo.situacao}`)}>
          <p className="text-sm font-medium opacity-75">Saldo total</p>
          <p className="text-3xl font-bold tabular-nums">{formatarQtd(resumo.saldo, produto.unidade)}</p>
          {emb && <p className="text-sm opacity-75">{emb}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <BadgeSituacao situacao={resumo.situacao} validade={resumo.proximaValidade} />
            {resumo.proximaValidade && <span className="opacity-75">próx. validade {formatarValidade(resumo.proximaValidade)}</span>}
          </div>
        </div>
        <dl className="cartao grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm lg:col-span-2">
          <Info
            rotulo={produto.codigos.length > 1 ? 'Códigos de barras' : 'Código de barras'}
            valor={produto.codigos.length ? produto.codigos.map(c => exibirCodigo(c.codigo) + (c.fator !== 1 ? ` (×${formatarNumero(c.fator)})` : '')).join(', ') : 'Sem código (busca manual)'}
            mono={produto.codigos.length > 0}
          />
          <Info rotulo="Preço de venda" valor={formatarMoeda(produto.preco_venda)} />
          <Info rotulo="Unidade" valor={UNIDADES.find(u => u.valor === produto.unidade)?.nome ?? produto.unidade} />
          <Info rotulo="Conteúdo por embalagem" valor={produto.conteudo_embalagem ? formatarQtd(produto.conteudo_embalagem, produto.unidade) : '—'} />
          <Info rotulo="Fabricante" valor={produto.fabricante ?? '—'} />
          {produto.observacao && <div className="col-span-2"><Info rotulo="Observações" valor={produto.observacao} /></div>}
        </dl>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Lotes</h2>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="size-4 accent-emerald-700" checked={mostrarZerados} onChange={e => setMostrarZerados(e.target.checked)} />
            Mostrar lotes zerados
          </label>
        </div>
        {visiveis.length === 0 ? (
          <div className="cartao linha-zerado p-4 text-sm font-medium">Nenhum lote com saldo. Produto sem estoque.</div>
        ) : (
          <div className="cartao divide-y divide-slate-200/70 overflow-hidden">
            {visiveis.map(l => {
              const sit = situacaoLote(l)
              return (
                <div key={l.lote_id} data-lote={l.lote || '(sem lote)'} data-situacao={sit} className={cx('flex items-center gap-3 px-4 py-3', `linha-${sit}`)}>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{l.lote ? `Lote ${l.lote}` : 'Sem lote'}</p>
                    <p className="text-xs opacity-75">
                      Validade <strong>{formatarValidade(l.validade)}</strong>
                      {l.validade && ` (${formatarData(l.validade)})`}
                      {l.ultima_movimentacao && ` · últ. mov. ${formatarDataHora(l.ultima_movimentacao)}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold tabular-nums">{formatarNumero(l.saldo)} {produto.unidade}</p>
                    <BadgeSituacao situacao={sit} validade={l.validade} />
                  </div>
                  {pode.corrigirLote && (
                    <button className="btn btn-fantasma -mr-2 p-2" title="Corrigir número do lote / validade" onClick={() => setLoteEditando(l)}>
                      <Pencil className="size-4" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold text-slate-900">Movimentações recentes</h2>
        {movs === null ? <Carregando /> : movs.length === 0 ? (
          <div className="cartao p-6 text-center text-sm text-slate-500">Nenhuma movimentação para este produto.</div>
        ) : (
          <ListaMovimentacoes movimentacoes={movs} mostrarProduto={false} aoCorrigir={pode.movimentar ? setCorrigindo : undefined} />
        )}
      </section>

      <ProdutoForm aberto={editando} aoFechar={() => setEditando(false)} produto={produto} />
      <EditarLote lote={loteEditando} aoFechar={() => setLoteEditando(null)} />
      <CorrecaoModal movimentacao={corrigindo} aoFechar={() => setCorrigindo(null)} />
    </div>
  )
}

function Info({ rotulo, valor, mono }: { rotulo: string; valor: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{rotulo}</dt>
      <dd className={cx('font-medium text-slate-800', mono && 'font-mono')}>{valor}</dd>
    </div>
  )
}

function EditarLote({ lote, aoFechar }: { lote: Lote | null; aoFechar: () => void }) {
  const { recarregar } = useDados()
  const toast = useToast()
  const [numero, setNumero] = useState('')
  const [validade, setValidade] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    setNumero(lote?.lote ?? '')
    setValidade(lote?.validade ?? '')
    setErro('')
  }, [lote])

  async function salvar() {
    if (!lote) return
    setSalvando(true)
    try {
      await catalogo.atualizarLote(lote.lote_id, { lote: numero, validade: validade || null })
      await recarregar()
      toast.sucesso('Lote atualizado.')
      aoFechar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto={!!lote}
      aoFechar={aoFechar}
      titulo="Corrigir dados do lote"
      rodape={
        <>
          <button className="btn btn-secundario flex-1" onClick={aoFechar}>Cancelar</button>
          <button className="btn btn-primario flex-1" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        </>
      }
    >
      <div className="space-y-4">
        <Aviso tom="info">Use apenas para corrigir número do lote ou validade digitados errado. As quantidades não mudam.</Aviso>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="rotulo" htmlFor="el-lote">Lote</label>
            <input id="el-lote" className="campo uppercase" value={numero} onChange={e => setNumero(e.target.value)} />
          </div>
          <div>
            <label className="rotulo" htmlFor="el-val">Validade</label>
            <input id="el-val" type="date" className="campo" value={validade} onChange={e => setValidade(e.target.value)} />
          </div>
        </div>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </Modal>
  )
}
