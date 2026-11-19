import { Check, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { formatarData, formatarDataHora } from '../lib/formato'
import { marcosDaOS, type EstadoMarcoOS, type MarcoOS } from '../lib/servicos'
import type { OS } from '../lib/tipos'
import { cx } from './ui'

const COR_ROTULO: Record<EstadoMarcoOS, string> = {
  concluido: 'text-slate-700',
  atual: 'text-ponto',
  pendente: 'text-slate-400',
  cancelada: 'text-red-700',
}

const COR_CHIP: Record<EstadoMarcoOS, string> = {
  concluido: 'bg-emerald-50 text-marca-escura',
  atual: 'bg-letreiro/30 text-ponto',
  pendente: 'bg-slate-100 text-slate-500',
  cancelada: 'bg-red-50 text-red-700',
}

const NOME_ESTADO: Record<EstadoMarcoOS, string> = {
  concluido: 'Concluída',
  atual: 'Etapa atual',
  pendente: 'Pendente',
  cancelada: 'Cancelada',
}

/**
 * Histórico da OS em linha: um marco por etapa, com data embaixo e detalhe
 * expansível (data/hora, responsável e o que aconteceu). Horizontal no desktop
 * e com rolagem por snap no celular. Só usa carimbos que já existem no banco.
 */
export function LinhaTempoOS({ os }: { os: OS }) {
  const marcos = marcosDaOS(os)
  const [aberto, setAberto] = useState<string | null>(null)
  const listaRef = useRef<HTMLOListElement>(null)
  const selecionado: MarcoOS | null = marcos.find(m => m.chave === aberto) ?? null

  // No celular a linha rola: centraliza a etapa atual sem mexer na rolagem vertical.
  useEffect(() => {
    const lista = listaRef.current
    if (!lista || lista.scrollWidth <= lista.clientWidth) return
    const atual = lista.querySelector<HTMLElement>('[aria-current="step"]')
    const marco = atual?.closest('li')
    if (!marco) return
    const alvo = lista.scrollLeft + marco.getBoundingClientRect().left - lista.getBoundingClientRect().left - (lista.clientWidth - marco.clientWidth) / 2
    lista.scrollTo({ left: Math.max(0, alvo), behavior: 'smooth' })
  }, [os.status])
  const etapas = marcos.filter(m => m.chave !== 'cancelada')
  const concluidas = etapas.filter(m => m.estado === 'concluido').length
  const resumo =
    os.status === 'cancelada'
      ? `${concluidas} ${concluidas === 1 ? 'etapa percorrida' : 'etapas percorridas'}`
      : `${concluidas} de ${etapas.length} etapas concluídas`

  return (
    <section className="cartao p-4" aria-label="Histórico da OS">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-ponto">Histórico da OS</h2>
        <span className="text-[11px] text-texto-secundario">{resumo}</span>
      </div>

      <ol ref={listaRef} className="rolagem-x mt-2 flex w-full snap-x snap-mandatory overflow-x-auto pb-1">
        {marcos.map((m, i) => {
          const ultimo = i === marcos.length - 1
          const proximo = marcos[i + 1]
          const ativo = aberto === m.chave
          const trilho =
            proximo?.estado === 'cancelada'
              ? 'bg-red-200'
              : m.estado === 'concluido'
                ? 'bg-emerald-400'
                : 'bg-slate-200'
          return (
            <li key={m.chave} className="relative flex min-w-[86px] flex-1 snap-start flex-col items-center">
              {!ultimo && (
                <span aria-hidden="true" className={cx('absolute left-1/2 top-[11px] h-0.5 w-full', trilho)} />
              )}
              <button
                type="button"
                onClick={() => setAberto(a => (a === m.chave ? null : m.chave))}
                aria-expanded={ativo}
                aria-current={m.estado === 'atual' ? 'step' : undefined}
                className="relative z-10 flex w-full flex-col items-center gap-1 rounded-lg px-1 pb-1 pt-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-letreiro focus-visible:ring-offset-2"
              >
                <Bolha estado={m.estado} />
                <span className={cx('text-[11px] font-semibold leading-4', COR_ROTULO[m.estado])}>{m.rotulo}</span>
                <span className={cx('text-[10px] leading-3 tabular-nums', m.estado === 'cancelada' ? 'text-red-500' : 'text-slate-500')}>
                  {m.data ? formatarData(m.data.slice(0, 10)) : '\u00A0'}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      {selecionado && (
        <div
          role="region"
          aria-label={`Detalhes de ${selecionado.rotulo}`}
          className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg bg-superficie px-3 py-2 text-xs"
        >
          <span className="font-semibold text-slate-800">{selecionado.rotulo}</span>
          <span className="text-slate-600">{selecionado.detalhe}</span>
          <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            {selecionado.data && <span>{formatarDataHora(selecionado.data)}</span>}
            {selecionado.por && <span>por {selecionado.por}</span>}
            <span className={cx('rounded-full px-1.5 py-0.5 text-[10px] font-semibold', COR_CHIP[selecionado.estado])}>
              {NOME_ESTADO[selecionado.estado]}
            </span>
          </span>
        </div>
      )}
    </section>
  )
}

function Bolha({ estado }: { estado: EstadoMarcoOS }) {
  if (estado === 'concluido') {
    return (
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-500 text-white shadow-sm">
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    )
  }
  if (estado === 'atual') {
    return (
      <span className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-ponto bg-white ring-4 ring-letreiro/40">
        <span className="size-2 rounded-full bg-ponto" />
      </span>
    )
  }
  if (estado === 'cancelada') {
    return (
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-red-600 text-white shadow-sm">
        <X className="size-3.5" strokeWidth={3} />
      </span>
    )
  }
  return <span className="size-6 shrink-0 rounded-full border-2 border-slate-200 bg-white" />
}
