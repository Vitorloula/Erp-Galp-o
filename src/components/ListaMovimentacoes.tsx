import { RotateCcw } from 'lucide-react'
import { Link } from 'react-router'
import { useDados } from '../contexto/Dados'
import { diferencaDias, formatarData, formatarDelta, formatarHora, formatarValidade, hojeISO } from '../lib/formato'
import type { Movimentacao } from '../lib/tipos'
import { IconeTipo, cx } from './ui'

interface Props {
  movimentacoes: Movimentacao[]
  aoCorrigir?: (m: Movimentacao) => void
  mostrarProduto?: boolean
  agruparPorDia?: boolean
}

function rotuloDia(iso: string): string {
  const dia = hojeISO(new Date(iso))
  const diff = diferencaDias(dia, hojeISO())
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  return formatarData(dia)
}

export function ListaMovimentacoes({ movimentacoes, aoCorrigir, mostrarProduto = true, agruparPorDia = true }: Props) {
  const { produtoPorId, lotePorId } = useDados()
  const corrigidas = new Set(movimentacoes.filter(m => m.referencia_id).map(m => m.referencia_id))

  let diaAnterior = ''
  return (
    <div className="cartao overflow-hidden">
      <ul className="divide-y divide-slate-100">
        {movimentacoes.map(m => {
          const produto = produtoPorId.get(m.produto_id)
          const lote = lotePorId.get(m.lote_id)
          const dia = rotuloDia(m.criado_em)
          const novoDia = agruparPorDia && dia !== diaAnterior
          diaAnterior = dia
          const unidade = produto?.unidade ?? ''
          return (
            <li key={m.id} data-mov={m.id} data-tipo={m.tipo}>
              {novoDia && <div className="bg-slate-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{dia}</div>}
              <div className="flex items-start gap-3 px-4 py-3">
                <IconeTipo tipo={m.tipo} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {mostrarProduto && (
                        <Link to={`/produtos/${m.produto_id}`} className="block truncate font-semibold text-slate-900 hover:text-emerald-800">
                          {produto?.nome ?? 'Produto'}
                        </Link>
                      )}
                      <p className="text-xs text-slate-500">
                        {lote?.lote ? `Lote ${lote.lote}` : 'Sem lote'}
                        {lote?.validade && ` · val. ${formatarValidade(lote.validade)}`}
                      </p>
                    </div>
                    <p className={cx('shrink-0 text-right font-bold tabular-nums', m.delta > 0 ? 'text-emerald-700' : 'text-red-700')}>
                      {formatarDelta(m.delta, unidade)}
                    </p>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span className="font-mono text-slate-400">#{m.id}</span>
                    <span>{agruparPorDia ? formatarHora(m.criado_em) : `${formatarData(m.criado_em)} ${formatarHora(m.criado_em)}`}</span>
                    {m.usuario_nome && <span>· {m.usuario_nome}</span>}
                    {m.documento && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">{m.documento}</span>}
                    {m.referencia_id && <span className="rounded bg-violet-50 px-1.5 py-0.5 font-medium text-violet-700">corrige #{m.referencia_id}</span>}
                    {corrigidas.has(m.id) && <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800">corrigida</span>}
                  </div>
                  {m.observacao && <p className="mt-1 text-sm text-slate-600">{m.observacao}</p>}
                </div>
                {aoCorrigir && m.tipo !== 'CORRECAO' && (
                  <button onClick={() => aoCorrigir(m)} className="btn btn-fantasma -mr-2 shrink-0 px-2 py-1.5 text-xs text-slate-500" title="Lançar correção">
                    <RotateCcw className="size-4" />
                    <span className="hidden sm:inline">Corrigir</span>
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
