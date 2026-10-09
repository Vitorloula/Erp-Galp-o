import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  CircleCheck,
  Clock,
  LoaderCircle,
  OctagonAlert,
  PackageX,
  RotateCcw,
  ShoppingCart,
  SlidersHorizontal,
  Undo2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useId, type ReactNode } from 'react'
import { descreverSituacao, type Situacao } from '../lib/estoque'
import { NOME_TIPO } from '../lib/formato'
import type { TipoMov } from '../lib/tipos'

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

export function Carregando({ texto = 'Carregando...' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
      <LoaderCircle className="size-5 animate-spin" />
      <span className="text-sm">{texto}</span>
    </div>
  )
}

export function Vazio({ icone: Icone, titulo, texto, children }: { icone: LucideIcon; titulo: string; texto?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 rounded-2xl bg-slate-100 p-3 text-slate-400">
        <Icone className="size-7" />
      </div>
      <p className="font-semibold text-slate-800">{titulo}</p>
      {texto && <p className="mt-1 max-w-sm text-sm text-slate-500">{texto}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

const ESTILO_SITUACAO: Record<Situacao, { classe: string; icone: LucideIcon }> = {
  vencido: { classe: 'bg-red-100 text-red-800 ring-red-200', icone: OctagonAlert },
  zerado: { classe: 'bg-red-100 text-red-800 ring-red-200', icone: PackageX },
  vencendo: { classe: 'bg-amber-100 text-amber-900 ring-amber-200', icone: Clock },
  ok: { classe: 'bg-emerald-50 text-emerald-800 ring-emerald-200', icone: CircleCheck },
}

export function BadgeSituacao({ situacao, validade, curto }: { situacao: Situacao; validade: string | null; curto?: boolean }) {
  const { classe, icone: Icone } = ESTILO_SITUACAO[situacao]
  const texto = curto
    ? { vencido: 'Vencido', zerado: 'Zerado', vencendo: 'Vencendo', ok: 'Em dia' }[situacao]
    : descreverSituacao(situacao, validade)
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', classe)}>
      <Icone className="size-3.5" />
      {texto}
    </span>
  )
}

const ESTILO_TIPO: Record<TipoMov, { classe: string; icone: LucideIcon }> = {
  ENTRADA: { classe: 'bg-emerald-100 text-emerald-800', icone: ArrowDownToLine },
  SAIDA: { classe: 'bg-sky-100 text-sky-800', icone: ArrowUpFromLine },
  AJUSTE: { classe: 'bg-violet-100 text-violet-800', icone: SlidersHorizontal },
  CORRECAO: { classe: 'bg-violet-100 text-violet-800', icone: RotateCcw },
  VENDA: { classe: 'bg-sky-100 text-sky-800', icone: ShoppingCart },
  CANCELAMENTO_VENDA: { classe: 'bg-amber-100 text-amber-800', icone: Undo2 },
  DEVOLUCAO: { classe: 'bg-emerald-100 text-emerald-800', icone: Undo2 },
  TRANSF_SAIDA: { classe: 'bg-sky-100 text-sky-800', icone: ArrowRightLeft },
  TRANSF_ENTRADA: { classe: 'bg-emerald-100 text-emerald-800', icone: ArrowRightLeft },
}

export function BadgeTipo({ tipo }: { tipo: TipoMov }) {
  const { classe, icone: Icone } = ESTILO_TIPO[tipo]
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold', classe)}>
      <Icone className="size-3.5" />
      {NOME_TIPO[tipo]}
    </span>
  )
}

export function IconeTipo({ tipo, className }: { tipo: TipoMov; className?: string }) {
  const { classe, icone: Icone } = ESTILO_TIPO[tipo]
  return (
    <span className={cx('grid size-9 shrink-0 place-items-center rounded-xl', classe, className)}>
      <Icone className="size-4.5" />
    </span>
  )
}

export function Modal({
  aberto,
  aoFechar,
  titulo,
  children,
  rodape,
  largura = 'max-w-lg',
}: {
  aberto: boolean
  aoFechar: () => void
  titulo: ReactNode
  children: ReactNode
  rodape?: ReactNode
  largura?: string
}) {
  const idTitulo = useId()
  useEffect(() => {
    if (!aberto) return
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', tecla)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = overflow
    }
  }, [aberto, aoFechar])

  if (!aberto) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={idTitulo}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={aoFechar} />
      <div className={cx('relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl', largura)}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 id={idTitulo} className="text-base font-semibold text-slate-900">{titulo}</h2>
          <button className="btn btn-fantasma -mr-2 p-2" onClick={aoFechar} aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {rodape && <div className="pb-seguro flex gap-2 border-t border-slate-100 px-5 py-3">{rodape}</div>}
      </div>
    </div>
  )
}

export function Kpi({
  titulo,
  valor,
  icone: Icone,
  tom = 'neutro',
  detalhe,
  onClick,
}: {
  titulo: string
  valor: ReactNode
  icone: LucideIcon
  tom?: 'neutro' | 'vermelho' | 'amarelo' | 'verde'
  detalhe?: string
  onClick?: () => void
}) {
  const tons = {
    neutro: 'bg-slate-100 text-slate-600',
    vermelho: 'bg-red-100 text-red-700',
    amarelo: 'bg-amber-100 text-amber-700',
    verde: 'bg-emerald-100 text-emerald-700',
  }
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={cx('cartao flex w-full items-start gap-3 p-4 text-left', onClick && 'transition hover:border-slate-300 hover:shadow')}>
      <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl', tons[tom])}>
        <Icone className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-2xl font-bold leading-tight tabular-nums text-slate-900">{valor}</span>
        <span className="block text-sm font-medium text-slate-600">{titulo}</span>
        {detalhe && <span className="mt-0.5 block text-xs text-slate-400">{detalhe}</span>}
      </span>
    </Tag>
  )
}

export function Segmentado<T extends string>({
  opcoes,
  valor,
  aoMudar,
  className,
}: {
  opcoes: { valor: T; rotulo: ReactNode }[]
  valor: T
  aoMudar: (v: T) => void
  className?: string
}) {
  return (
    <div className={cx('grid gap-1 rounded-2xl bg-slate-200/70 p-1', className)} style={{ gridTemplateColumns: `repeat(${opcoes.length}, minmax(0, 1fr))` }}>
      {opcoes.map(o => (
        <button
          key={o.valor}
          type="button"
          onClick={() => aoMudar(o.valor)}
          className={cx(
            'flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition',
            o.valor === valor ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
          )}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  )
}

export function Cabecalho({ titulo, subtitulo, acoes }: { titulo: string; subtitulo?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{titulo}</h1>
        {subtitulo && <p className="mt-0.5 text-sm text-slate-500">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  )
}

export function Aviso({ tom = 'info', children }: { tom?: 'info' | 'erro' | 'alerta'; children: ReactNode }) {
  const tons = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    erro: 'border-red-200 bg-red-50 text-red-800',
    alerta: 'border-amber-200 bg-amber-50 text-amber-900',
  }
  return <div className={cx('rounded-xl border px-3.5 py-2.5 text-sm', tons[tom])}>{children}</div>
}
