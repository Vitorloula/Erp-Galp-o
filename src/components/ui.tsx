import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  CircleCheck,
  Clock,
  Equal,
  LoaderCircle,
  Minus,
  OctagonAlert,
  PackageX,
  RotateCcw,
  ShoppingCart,
  SlidersHorizontal,
  TrendingDown,
  Undo2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { descreverSituacao, type Situacao, type SituacaoReposicao } from '../lib/estoque'
import { NOME_TIPO, formatarNumero } from '../lib/formato'
import type { TipoMov, Unidade } from '../lib/tipos'

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
  ok: { classe: 'bg-emerald-50 text-marca-escura ring-emerald-200', icone: CircleCheck },
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

const ESTILO_REPOSICAO: Record<SituacaoReposicao, { classe: string; icone: LucideIcon; texto: string }> = {
  abaixo: { classe: 'bg-amber-100 text-amber-900 ring-amber-200', icone: TrendingDown, texto: 'Repor' },
  no_minimo: { classe: 'bg-amber-50 text-amber-800 ring-amber-200', icone: Equal, texto: 'No mínimo' },
  acima: { classe: 'bg-emerald-50 text-marca-escura ring-emerald-200', icone: CircleCheck, texto: 'OK' },
  sem_minimo: { classe: 'bg-slate-100 text-slate-600 ring-slate-200', icone: Minus, texto: 'Sem mínimo' },
}

export interface BadgeReposicaoProps {
  situacao: SituacaoReposicao
  minimo: number | null
  unidade: Unidade
}

/** Mesmo padrão visual de BadgeSituacao: ícone + texto, nunca só cor. */
export function BadgeReposicao({ situacao, minimo, unidade }: BadgeReposicaoProps) {
  const { classe, icone: Icone, texto } = ESTILO_REPOSICAO[situacao]
  const titulo = situacao === 'sem_minimo' ? 'Estoque mínimo não definido' : `Estoque mínimo: ${formatarNumero(minimo)} ${unidade}`
  return (
    <span
      title={titulo}
      className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', classe)}
    >
      <Icone className="size-3.5" />
      {texto}
    </span>
  )
}

export interface CoberturaProps {
  saldo: number
  minimo: number | null
  unidade: Unidade
}

/** "1,6×" = quantas vezes o saldo cobre o estoque mínimo. */
export function Cobertura({ saldo, minimo, unidade }: CoberturaProps) {
  if (minimo === null || minimo <= 0) return <span className="text-xs text-slate-400">—</span>
  const vezes = Math.round((saldo / minimo) * 100) / 100
  const texto = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(vezes)
  return (
    <span className="tabular-nums" title={`${formatarNumero(saldo)} ${unidade} de ${formatarNumero(minimo)} ${unidade} de mínimo`}>
      {texto}×
    </span>
  )
}

const ESTILO_TIPO: Record<TipoMov, { classe: string; icone: LucideIcon }> = {
  ENTRADA: { classe: 'bg-emerald-100 text-marca-escura', icone: ArrowDownToLine },
  SAIDA: { classe: 'bg-sky-100 text-sky-800', icone: ArrowUpFromLine },
  AJUSTE: { classe: 'bg-violet-100 text-violet-800', icone: SlidersHorizontal },
  CORRECAO: { classe: 'bg-violet-100 text-violet-800', icone: RotateCcw },
  VENDA: { classe: 'bg-sky-100 text-sky-800', icone: ShoppingCart },
  CANCELAMENTO_VENDA: { classe: 'bg-amber-100 text-amber-800', icone: Undo2 },
  DEVOLUCAO: { classe: 'bg-emerald-100 text-marca-escura', icone: Undo2 },
  TRANSF_SAIDA: { classe: 'bg-sky-100 text-sky-800', icone: ArrowRightLeft },
  TRANSF_ENTRADA: { classe: 'bg-emerald-100 text-marca-escura', icone: ArrowRightLeft },
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
  // Guarda o callback em uma ref para o efeito não ser refeito a cada render
  // (as telas costumam passar `aoFechar` inline). Sem isso, o body era
  // desbloqueado/reloqueado a cada render, permitindo a página rolar atrás.
  const fechar = useRef(aoFechar)
  fechar.current = aoFechar
  useEffect(() => {
    if (!aberto) return
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && fechar.current()
    document.addEventListener('keydown', tecla)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = overflow
    }
  }, [aberto])

  if (!aberto) return null
  /*
   * O modal é renderizado direto no <body> (portal). Isso é essencial: a entrada
   * das páginas usava `transform`, e um ancestral transformado passa a ser o
   * "containing block" de elementos `position: fixed` e cria um contexto de
   * empilhamento. Sem o portal, o modal era posicionado/centralizado em relação
   * ao conteúdo da página (que pode ser mais alto que a janela) e ficava cortado
   * no topo, além de ficar preso atrás da sidebar. O portal mantém o modal imune
   * a transform/overflow/stacking contexts de qualquer tela.
   *
   * Estrutura: container externo (posicionamento e limite de altura) > painel
   * flexível > cabeçalho fixo + corpo com rolagem + rodapé fixo.
   */
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-2 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
      data-modal
    >
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={aoFechar} aria-hidden="true" />
      <div
        className={cx(
          'animar-modal relative flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl',
          largura,
        )}
        data-modal-painel
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <h2 id={idTitulo} className="min-w-0 truncate text-base font-semibold text-slate-900">{titulo}</h2>
          <button type="button" className="btn btn-fantasma -mr-2 shrink-0 p-2" onClick={aoFechar} aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 pb-6" data-modal-corpo>
          {children}
        </div>
        {rodape && (
          <div className="flex shrink-0 gap-2 border-t border-slate-100 bg-white px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" data-modal-rodape>
            {rodape}
          </div>
        )}
      </div>
    </div>,
    document.body,
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
    verde: 'bg-emerald-100 text-marca',
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
