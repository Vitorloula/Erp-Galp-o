import { ChevronRight, PackagePlus, ScanBarcode, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useDados } from '../contexto/Dados'
import { encontrarPorCodigo, produtoCombina, resumirProduto } from '../lib/estoque'
import { exibirCodigo, formatarEmbalagens, formatarQtd } from '../lib/formato'
import type { CodigoLido } from '../lib/gs1'
import type { Produto } from '../lib/tipos'
import { LeitorCodigo } from './LeitorCodigo'
import { ProdutoForm } from './ProdutoForm'
import { Aviso, BadgeSituacao } from './ui'

export interface ExtrasLeitura {
  lote?: string
  validade?: string
  /** Leitura do código de uma caixa fechada (ex.: 12 unidades). */
  fator?: number
}

interface Props {
  aoSelecionar: (p: Produto, extras?: ExtrasLeitura) => void
  /** Abre a câmera automaticamente ao montar. */
  abrirCamera?: boolean
}

/**
 * Identificação do produto em modo híbrido: câmera, leitor USB/Bluetooth (digita + Enter)
 * ou busca manual por nome / código interno.
 */
export function BuscaProduto({ aoSelecionar, abrirCamera }: Props) {
  const { produtos, lotesPorProduto } = useDados()
  const [termo, setTermo] = useState('')
  const [lendo, setLendo] = useState(!!abrirCamera)
  const [naoEncontrado, setNaoEncontrado] = useState<string | null>(null)
  const [cadastrando, setCadastrando] = useState<string | null>(null)

  const ativos = useMemo(() => produtos.filter(p => p.ativo), [produtos])
  const resultados = useMemo(() => ativos.filter(p => produtoCombina(p, termo)).slice(0, termo ? 12 : 8), [ativos, termo])

  function tratarCodigo(lido: CodigoLido) {
    setLendo(false)
    const achado = encontrarPorCodigo(ativos, lido.codigo)
    if (achado) {
      setNaoEncontrado(null)
      aoSelecionar(achado.produto, { lote: lido.lote, validade: lido.validade, fator: achado.fator })
    } else {
      setNaoEncontrado(lido.codigo)
    }
  }

  function aoEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const t = termo.trim()
    if (!t) return
    const exato = encontrarPorCodigo(ativos, t)
    if (exato) return aoSelecionar(exato.produto, { fator: exato.fator })
    if (resultados.length === 1) return aoSelecionar(resultados[0])
    if (/^\d{8,14}$/.test(t)) setNaoEncontrado(t) // parece um código de barras de leitor USB
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => setLendo(true)} className="btn btn-primario btn-grande w-full py-5 text-lg">
        <ScanBarcode className="size-7" />
        Escanear código de barras
      </button>

      <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-400">
        <span className="h-px flex-1 bg-slate-200" /> ou busque manualmente <span className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
        <input
          className="campo py-3 pl-11"
          placeholder="Nome, código interno ou código de barras"
          value={termo}
          onChange={e => {
            setTermo(e.target.value)
            setNaoEncontrado(null)
          }}
          onKeyDown={aoEnter}
          autoComplete="off"
          aria-label="Buscar produto"
        />
      </div>

      {naoEncontrado && (
        <Aviso tom="alerta">
          <p>
            O código <strong className="font-mono">{naoEncontrado}</strong> não está cadastrado.
          </p>
          <button type="button" className="btn btn-secundario mt-2 w-full sm:w-auto" onClick={() => setCadastrando(naoEncontrado)}>
            <PackagePlus className="size-4.5" /> Cadastrar produto com este código
          </button>
        </Aviso>
      )}

      <div className="cartao divide-y divide-slate-100 overflow-hidden">
        {resultados.length === 0 && (
          <div className="p-5 text-center text-sm text-slate-500">
            Nenhum produto encontrado.
            <button type="button" className="btn btn-secundario mx-auto mt-3 flex" onClick={() => setCadastrando('')}>
              <PackagePlus className="size-4.5" /> Cadastrar novo produto
            </button>
          </div>
        )}
        {resultados.map(p => {
          const r = resumirProduto(lotesPorProduto.get(p.id) ?? [])
          const emb = formatarEmbalagens(r.saldo, p.conteudo_embalagem)
          return (
            <button key={p.id} type="button" onClick={() => aoSelecionar(p)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 active:bg-slate-100">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">{p.nome}</p>
                <p className="truncate text-xs text-slate-500">
                  {p.codigo_interno}
                  {p.codigos[0] && ` · ${exibirCodigo(p.codigos[0].codigo)}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums text-slate-800">{formatarQtd(r.saldo, p.unidade)}</p>
                {r.situacao !== 'ok' ? <BadgeSituacao situacao={r.situacao} validade={r.proximaValidade} curto /> : emb && <p className="text-xs text-slate-500">{emb}</p>}
              </div>
              <ChevronRight className="size-4.5 shrink-0 text-slate-300" />
            </button>
          )
        })}
      </div>

      <LeitorCodigo aberto={lendo} aoFechar={() => setLendo(false)} aoLer={tratarCodigo} />
      <ProdutoForm
        aberto={cadastrando !== null}
        aoFechar={() => setCadastrando(null)}
        codigoInicial={cadastrando ?? undefined}
        aoSalvar={p => {
          setNaoEncontrado(null)
          aoSelecionar(p)
        }}
      />
    </div>
  )
}
