import { ArrowDownToLine, ArrowUpFromLine, Banknote, Boxes, Calendar, ChevronRight, CircleCheck, Clock, History, List, OctagonAlert, PackageX, Percent, Receipt, ScanBarcode, ShoppingBasket, ShoppingCart, TrendingUp, Wrench, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ListaMovimentacoes } from '../components/ListaMovimentacoes'
import { Carregando, Vazio, cx } from '../components/ui'
import { useAuth } from '../contexto/Auth'
import { useDados } from '../contexto/Dados'
import { useAtiva } from '../contexto/Empresa'
import { movimentos, os as dadosOS, vendas as dadosVendas } from '../lib/dados'
import { STATUS_OS, numeroOS } from '../lib/servicos'
import {
  PRIORIDADE,
  PRIORIDADE_ATENCAO,
  DIAS_ALERTA,
  montarLinhasEstoque,
  precisaRepor,
  saldosPorProduto,
  situacaoReposicao,
  type Situacao,
} from '../lib/estoque'
import { formatarNumero, formatarQtd, formatarValidade, hojeISO } from '../lib/formato'
import { montarResultado, type Resultado } from '../lib/resultado'
import { centavos, formatarReais } from '../pdv/venda'
import type { Movimentacao, Unidade } from '../lib/tipos'
import type { Venda } from '../lib/dados/vendas'

function saudacao() {
  const h = new Date().getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

/** Normaliza status vindo do banco (maiúsculas/acentos/espaços) para a chave interna. */
function normalizarStatus(s: unknown): string {
  const t = String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_')
  const mapa: Record<string, string> = {
    aberta: 'aberta', aberto: 'aberta', pendente: 'aberta', recebida: 'aberta', nova: 'aberta', open: 'aberta',
    em_diagnostico: 'em_diagnostico', diagnostico: 'em_diagnostico',
    aguardando_aprovacao: 'aguardando_aprovacao', aguardando: 'aguardando_aprovacao', aguardando_aprova: 'aguardando_aprovacao', orcamento: 'aguardando_aprovacao',
    aprovada: 'aprovada', aprovado: 'aprovada',
    em_execucao: 'em_execucao', execucao: 'em_execucao', executando: 'em_execucao', em_andamento: 'em_execucao',
    pronta: 'pronta', pronto: 'pronta',
    entregue: 'entregue', encerrada: 'entregue', encerrado: 'entregue', concluida: 'entregue', concluido: 'entregue',
    cancelada: 'cancelada', cancelado: 'cancelada',
  }
  return mapa[t] ?? t
}

const ATIVOS = new Set(['aberta', 'em_diagnostico', 'aguardando_aprovacao', 'aprovada', 'em_execucao', 'pronta'])

function Atalho({ para, icone: Icone, titulo, tom }: { para: string; icone: LucideIcon; titulo: string; tom: 'entrada' | 'saida' | 'destaque' }) {
  const iconeClasse = tom === 'entrada' ? 'bg-[#fff8dd] text-ponto' : tom === 'saida' ? 'bg-slate-100 text-slate-700' : 'bg-letreiro text-ponto'
  return (
    <Link
      to={para}
      className={cx(
        'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-sm font-semibold transition',
        tom === 'destaque' ? 'border-ponto bg-ponto text-white active:bg-neutral-800' : 'border-borda-loja bg-white text-slate-700 active:bg-superficie',
      )}
    >
      <span className={cx('grid size-10 place-items-center rounded-xl', iconeClasse)}>
        <Icone className="size-5" />
      </span>
      {titulo}
    </Link>
  )
}

/** Item de "Precisa de atenção": um lote com problema ou um produto no ponto de pedido. */
interface ItemAtencao {
  prioridade: number
  chave: string
  situacao: Situacao | 'abaixo'
  nome: string
  detalhe: string
  validade: string | null
  href: string
  /** Só para itens de reposição: mínimo e unidade usados pelo BadgeReposicao. */
  minimo?: number | null
  unidade?: Unidade
}

export function Painel() {
  const { usuario } = useAuth()
  const { empresa, loja, pode } = useAtiva()
  const { produtos, lotes, carregando, versao } = useDados()
  const navegar = useNavigate()
  const [recentes, setRecentes] = useState<Movimentacao[] | null>(null)
  const [vendasSemana, setVendasSemana] = useState<Venda[] | null>(null)
  const [falhaVendas, setFalhaVendas] = useState(false)
  const [resultadoHoje, setResultadoHoje] = useState<Resultado | null>(null)
  const [falhaResultado, setFalhaResultado] = useState(false)
  const [ordens, setOrdens] = useState<import('../lib/tipos').OS[]>([])
  const [abaOS, setAbaOS] = useState<'lista' | 'agenda'>('lista')
  const [filtroOS, setFiltroOS] = useState<string | null>(null)

  useEffect(() => {
    movimentos.listarMovimentacoes(empresa.empresa_id, loja.id, { limite: 5 }).then(setRecentes).catch(() => setRecentes([]))
  }, [versao, empresa.empresa_id, loja.id])

  useEffect(() => {
    let ativo = true
    setVendasSemana(null)
    setFalhaVendas(false)
    setResultadoHoje(null)
    setFalhaResultado(false)
    const agora = new Date()
    const desde = new Date(agora)
    desde.setDate(desde.getDate() - 6)
    desde.setHours(0, 0, 0, 0)
    const ate = new Date(agora)
    ate.setHours(23, 59, 59, 999)
    dadosVendas
      .listarVendas(empresa.empresa_id, loja.id, { desde: desde.toISOString(), ate: ate.toISOString() })
      .then(lista => {
        if (!ativo) return
        setVendasSemana(lista)
        const hoje = hojeISO()
        const concluidasHoje = lista.filter(v => v.status === 'concluida' && hojeISO(new Date(v.ocorrido_em)) === hoje)
        return dadosVendas
          .itensDasVendas(concluidasHoje.map(v => v.id))
          .then(itens => {
            if (ativo) setResultadoHoje(montarResultado(concluidasHoje, itens))
          })
          .catch(() => {
            if (ativo) setFalhaResultado(true)
          })
      })
      .catch(() => {
        if (ativo) {
          setVendasSemana([])
          setFalhaVendas(true)
          setFalhaResultado(true)
        }
      })
    return () => {
      ativo = false
    }
  }, [versao, empresa.empresa_id, loja.id])

  useEffect(() => {
    dadosOS.listarOrdens(empresa.empresa_id, loja.id).then(setOrdens).catch(() => setOrdens([]))
  }, [versao, empresa.empresa_id, loja.id])

  const diasAlerta = empresa.config.dias_alerta ?? DIAS_ALERTA
  const linhas = useMemo(() => montarLinhasEstoque(produtos, lotes, undefined, diasAlerta), [produtos, lotes, diasAlerta])
  const contagem = useMemo(() => {
    const c = { vencido: 0, zerado: 0, vencendo: 0, ok: 0 }
    linhas.forEach(l => c[l.situacao]++)
    return c
  }, [linhas])
  const comSaldo = new Set(linhas.filter(l => l.saldo > 0).map(l => l.produto.id)).size

  // Produtos com ponto de pedido que já chegaram ao mínimo (abaixo ou exatamente no mínimo).
  const paraRepor = useMemo(() => {
    const saldos = saldosPorProduto(lotes)
    return precisaRepor(
      produtos
        .filter(p => p.controla_estoque && (p.ativo || (saldos.get(p.id) ?? 0) > 0))
        .map(p => {
          const saldo = saldos.get(p.id) ?? 0
          const minimo = p.estoque_minimo ?? null
          const cobertura = minimo !== null && minimo > 0 ? Math.round((saldo / minimo) * 100) / 100 : null
          return {
            produto: p,
            saldo,
            minimo,
            cobertura,
            sugestaoCompra: 0,
            situacao: situacaoReposicao(saldo, minimo),
            situacaoLote: 'ok' as Situacao,
          }
        }),
    ).sort((a, b) => (a.cobertura ?? a.saldo) - (b.cobertura ?? b.saldo) || a.produto.nome.localeCompare(b.produto.nome, 'pt-BR'))
  }, [produtos, lotes])

  const atencao = useMemo<ItemAtencao[]>(() => {
    const dosLotes: ItemAtencao[] = linhas
      .filter(l => l.situacao !== 'ok')
      .map(l => ({
        prioridade: PRIORIDADE[l.situacao],
        chave: `lote-${l.chave}`,
        situacao: l.situacao,
        nome: l.produto.nome,
        detalhe: l.lote
          ? `${l.lote.lote ? `Lote ${l.lote.lote} · ` : ''}val. ${formatarValidade(l.validade)} · ${formatarQtd(l.saldo, l.produto.unidade)}`
          : 'Nenhuma unidade em estoque',
        validade: l.validade,
        href: `/produtos/${l.produto.id}`,
      }))
    const daReposicao: ItemAtencao[] = paraRepor.map(item => ({
      prioridade: PRIORIDADE_ATENCAO.abaixo,
      chave: `repor-${item.produto.id}`,
      situacao: 'abaixo',
      nome: item.produto.nome,
      detalhe: `Saldo ${formatarQtd(item.saldo, item.produto.unidade)} · mínimo ${formatarQtd(item.minimo ?? 0, item.produto.unidade)}`,
      validade: null,
      href: `/produtos/${item.produto.id}`,
      minimo: item.minimo,
      unidade: item.produto.unidade,
    }))
    return [...dosLotes, ...daReposicao]
      .sort(
        (a, b) =>
          a.prioridade - b.prioridade ||
          (a.validade ?? '9').localeCompare(b.validade ?? '9') ||
          a.nome.localeCompare(b.nome, 'pt-BR'),
      )
      .slice(0, 5)
  }, [linhas, paraRepor])

  const hoje = hojeISO()
  const ordensNorm = ordens.map(o => ({ ...o, status: normalizarStatus(o.status) }))
  const ordensAtivas = ordensNorm.filter(o => ATIVOS.has(o.status))
  const ordensFiltradas = filtroOS === 'em_andamento'
    ? ordensAtivas.filter(o => ['aberta', 'em_diagnostico', 'em_execucao'].includes(o.status))
    : filtroOS === 'aguardando_aprovacao'
      ? ordensAtivas.filter(o => o.status === 'aguardando_aprovacao')
      : filtroOS === 'pronta'
        ? ordensAtivas.filter(o => o.status === 'pronta')
        : filtroOS === 'atrasada'
          ? ordensAtivas.filter(o => !!o.prazo_prometido && o.prazo_prometido < hoje && o.status !== 'entregue' && o.status !== 'cancelada')
          : ordensAtivas
  const movHoje = (recentes ?? []).filter(m => hojeISO(new Date(m.ocorrido_em)) === hoje)
  const vendasHoje = (vendasSemana ?? []).filter(v => v.status === 'concluida' && hojeISO(new Date(v.ocorrido_em)) === hoje)
  const totalVendidoHoje = vendasHoje.reduce((soma, venda) => soma + centavos(venda.total), 0)
  const ticketMedio = vendasHoje.length ? Math.round(totalVendidoHoje / vendasHoje.length) : 0
  const fiscalADecidir = vendasHoje.filter(v => !v.nfce_decisao && v.nfce_status !== 'emitida' && v.nfce_status !== 'cancelada').length
  const fiscalEmitidas = vendasHoje.filter(v => v.nfce_status === 'emitida').length
  const fiscalSemNota = vendasHoje.filter(v => v.nfce_decisao === 'sem_nota' || v.nfce_status === 'resolvida').length
  const semResultado = vendasSemana === null || resultadoHoje === null || falhaResultado
  const detalheResultado = falhaResultado
    ? 'Não foi possível atualizar'
    : vendasSemana === null || resultadoHoje === null
      ? 'Atualizando…'
      : vendasHoje.length === 0
        ? 'Sem vendas concluídas hoje'
        : `${vendasHoje.length} vendas finalizadas hoje`
  const valorResultado = (valor: number) => (semResultado ? '—' : formatarReais(valor))
  const diasVendas = useMemo(() => {
    const base = new Date()
    return Array.from({ length: 7 }, (_, indice) => {
      const data = new Date(base)
      data.setDate(base.getDate() - (6 - indice))
      const iso = hojeISO(data)
      const total = (vendasSemana ?? [])
        .filter(v => v.status === 'concluida' && hojeISO(new Date(v.ocorrido_em)) === iso)
        .reduce((soma, venda) => soma + centavos(venda.total), 0)
      return {
        iso,
        total,
        rotulo: data.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase(),
        hoje: iso === hoje,
      }
    })
  }, [vendasSemana, hoje])
  const maiorDia = Math.max(10000, ...diasVendas.map(dia => dia.total))
  const totalSemana = diasVendas.reduce((soma, dia) => soma + dia.total, 0)
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null)
  const diaAtivo = diasVendas.find(d => d.iso === diaSelecionado) ?? diasVendas.find(d => d.hoje) ?? diasVendas[diasVendas.length - 1]

  if (carregando) return <Carregando />

  const dataExtenso = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const nomeCurto = usuario?.nome.split(' ')[0]

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 stagger-in" style={{ animationDelay: '0ms' }}>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[.06em] text-texto-secundario">{dataExtenso}</p>
          <h1 className="mt-1 text-2xl font-bold leading-9 tracking-[-1.1px] text-ponto sm:text-[30px]">
            {saudacao()}{nomeCurto ? `, ${nomeCurto}` : ''}<span className="text-letreiro">.</span>
          </h1>
          <p className="mt-1 text-sm text-texto-secundario">Veja o que está acontecendo na sua loja hoje.</p>
        </div>
        {pode.vender && (
          <Link to="/pdv" className="btn btn-primario shrink-0">
            <ShoppingCart className="size-4 text-letreiro" /> Abrir caixa
          </Link>
        )}
      </header>

      <div className="stagger-in grid grid-cols-1 gap-4 lg:grid-cols-12" style={{ animationDelay: '60ms' }}>
        {/* Resumo de hoje (8 cols) */}
        <div className="lg:col-span-8">
          <div className="cartao rounded-2xl border border-zinc-200/80 p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ponto">Resumo de hoje</h2>
              <span className="text-xs text-texto-secundario">{detalheResultado}</span>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-100 pb-4">
              <div className="min-w-0">
                <p className="text-xs font-medium text-texto-secundario">Vendas hoje</p>
                <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-ponto">
                  {vendasSemana === null || falhaVendas ? '—' : formatarReais(totalVendidoHoje)}
                </p>
                <span className="mt-2 inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  {vendasSemana === null || falhaVendas ? '—' : `${vendasHoje.length} vendas finalizadas`}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-zinc-100 pt-4">
              <div className="flex items-center gap-2.5 px-4 first:pl-0">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-marca">
                  <TrendingUp className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-texto-secundario">Lucro bruto</p>
                  <p className="text-base font-bold tabular-nums text-ponto">{valorResultado(resultadoHoje?.lucro ?? 0)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 px-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-marca">
                  <Percent className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-texto-secundario">Margem</p>
                  <p className="text-base font-bold tabular-nums text-ponto">{semResultado ? '—' : `${formatarNumero(resultadoHoje?.margem ?? 0)}%`}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 px-4 last:pr-0">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                  <Banknote className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-texto-secundario">Ticket médio</p>
                  <p className="text-base font-bold tabular-nums text-ponto">{vendasSemana === null || falhaVendas ? '—' : formatarReais(ticketMedio)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Ações rápidas (4 cols) */}
        <div className="lg:col-span-4">
          <div className="cartao rounded-2xl border border-zinc-200/80 flex h-full flex-col gap-3 p-5">
            <h2 className="text-sm font-semibold text-ponto">Ações rápidas</h2>
            {pode.vender && (
              <Link to="/pdv" className="group flex h-12 items-center justify-center gap-2 rounded-xl bg-ponto text-sm font-semibold text-white transition hover:bg-neutral-800 hover:shadow-md active:scale-[0.99]">
                <span className="grid size-7 place-items-center rounded-lg bg-letreiro text-ponto transition-transform duration-200 group-hover:rotate-90">
                  <ShoppingCart className="size-4" />
                </span>
                Iniciar uma venda
              </Link>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              {pode.movimentar && (
                <Link to="/movimentar?tipo=entrada" className="flex items-center justify-center gap-1.5 rounded-xl bg-[#FEF9C3] px-2.5 py-2.5 text-xs font-semibold text-ponto transition hover:brightness-95 active:scale-[0.99]">
                  <ArrowDownToLine className="size-3.5" /> Entrada
                </Link>
              )}
              {pode.movimentar && (
                <Link to="/movimentar?tipo=saida" className="flex items-center justify-center gap-1.5 rounded-xl border border-borda-loja bg-zinc-100 px-2.5 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-zinc-200 active:scale-[0.99]">
                  <ArrowUpFromLine className="size-3.5" /> Saída
                </Link>
              )}
            </div>
            <div className="mt-auto flex items-center justify-between gap-2 border-t border-zinc-100 pt-3">
              <Link to="/produtos" className="btn btn-secundario px-3 py-1.5 text-xs">+ Novo produto</Link>
              <Link to="/vendas" className="btn btn-secundario px-3 py-1.5 text-xs">Vendas e caixa</Link>
            </div>
          </div>
        </div>
      </div>

      <div className="stagger-in grid grid-cols-1 gap-4 lg:grid-cols-2" style={{ animationDelay: '90ms' }}>
        <section className="cartao rounded-2xl p-4" aria-label="Ordens de serviço" data-card="ordens">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ponto">Ordens de serviço</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600">{ordensAtivas.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative inline-flex items-center rounded-xl bg-slate-100 p-1">
              <span
                aria-hidden
                className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-sm transition-transform duration-200 ease-out"
                style={{ transform: abaOS === 'agenda' ? 'translateX(100%)' : 'translateX(0)', left: '4px' }}
              />
              <button
                type="button"
                onClick={() => setAbaOS('lista')}
                className={cx('relative z-10 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition active:scale-95', abaOS === 'lista' ? 'text-slate-900' : 'text-slate-600')}
              >
                <List className="size-3.5 transition-transform duration-200 active:scale-90" /> Lista
              </button>
              <button
                type="button"
                onClick={() => setAbaOS('agenda')}
                className={cx('relative z-10 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition active:scale-95', abaOS === 'agenda' ? 'text-slate-900' : 'text-slate-600')}
              >
                <Calendar className="size-3.5 transition-transform duration-200 active:scale-90" /> Agenda
              </button>
            </div>
            {pode.criarOrdem && (
              <Link
                to={abaOS === 'agenda' ? '/os/agenda' : '/os/nova'}
                className="group inline-flex items-center gap-1.5 rounded-xl bg-ponto px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-neutral-800 hover:shadow-md active:scale-[0.99]"
              >
                <span className="grid size-4 place-items-center rounded-md bg-letreiro text-ponto transition-transform duration-200 group-hover:rotate-90">
                  <span className="text-[12px] font-bold leading-none">+</span>
                </span>
                {abaOS === 'agenda' ? 'Abrir agenda' : 'Nova OS'}
              </Link>
            )}
          </div>
        </div>
        {ordens.length === 0 ? (
          <Vazio icone={Wrench} titulo="Nenhuma ordem de serviço ainda." texto="Toque em Nova OS para receber o primeiro aparelho." />
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(() => {
              const n = ordensNorm.filter(o => ['aberta','em_diagnostico','em_execucao'].includes(o.status)).length
              const ativo = filtroOS === 'em_andamento'
              return (
                <button type="button" onClick={() => setFiltroOS(prev => prev === 'em_andamento' ? null : 'em_andamento')} className={cx('flex items-start justify-between gap-2 rounded-xl border bg-white p-3 text-left transition-all duration-200 hover:bg-zinc-50/80 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]', ativo ? 'border-sky-400 ring-1 ring-sky-200' : 'border-zinc-200/80')}>
                  <div className="min-w-0">
                    <span className="text-[11px] font-medium text-texto-secundario">Em andamento</span>
                    <span className={cx('mt-1 block text-xl font-bold tabular-nums', n >= 1 ? 'text-sky-700' : 'text-slate-400')}>{n}</span>
                  </div>
                  <span className={cx('grid size-7 shrink-0 place-items-center rounded-lg', n >= 1 ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-400')}>
                    <Wrench className="size-3.5" />
                  </span>
                </button>
              )
            })()}
            {(() => {
              const n = ordensNorm.filter(o => o.status === 'aguardando_aprovacao').length
              const ativo = filtroOS === 'aguardando_aprovacao'
              return (
                <button type="button" onClick={() => setFiltroOS(prev => prev === 'aguardando_aprovacao' ? null : 'aguardando_aprovacao')} className={cx('flex items-start justify-between gap-2 rounded-xl border bg-white p-3 text-left transition-all duration-200 hover:bg-zinc-50/80 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]', ativo ? 'border-amber-400 ring-1 ring-amber-200' : 'border-zinc-200/80')}>
                  <div className="min-w-0">
                    <span className="text-[11px] font-medium text-texto-secundario">Aguardando aprovação</span>
                    <span className={cx('mt-1 block text-xl font-bold tabular-nums', n >= 1 ? 'text-amber-700' : 'text-slate-400')}>{n}</span>
                  </div>
                  <span className={cx('grid size-7 shrink-0 place-items-center rounded-lg', n >= 1 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-400')}>
                    <Wrench className="size-3.5" />
                  </span>
                </button>
              )
            })()}
            {(() => {
              const n = ordensNorm.filter(o => o.status === 'pronta').length
              const ativo = filtroOS === 'pronta'
              return (
                <button type="button" onClick={() => setFiltroOS(prev => prev === 'pronta' ? null : 'pronta')} className={cx('flex items-start justify-between gap-2 rounded-xl border bg-white p-3 text-left transition-all duration-200 hover:bg-zinc-50/80 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]', ativo ? 'border-emerald-500 ring-1 ring-emerald-200' : 'border-zinc-200/80')}>
                  <div className="min-w-0">
                    <span className="text-[11px] font-medium text-texto-secundario">Prontas</span>
                    <span className={cx('mt-1 block text-xl font-bold tabular-nums', n >= 1 ? 'text-emerald-700' : 'text-slate-400')}>{n}</span>
                  </div>
                  <span className={cx('grid size-7 shrink-0 place-items-center rounded-lg', n >= 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400')}>
                    <Wrench className="size-3.5" />
                  </span>
                </button>
              )
            })()}
            {(() => {
              const n = ordensNorm.filter(o => o.prazo_prometido && o.prazo_prometido < hoje && o.status !== 'entregue' && o.status !== 'cancelada').length
              const ativo = filtroOS === 'atrasada'
              return (
                <button type="button" onClick={() => setFiltroOS(prev => prev === 'atrasada' ? null : 'atrasada')} className={cx('flex items-start justify-between gap-2 rounded-xl border bg-white p-3 text-left transition-all duration-200 hover:bg-zinc-50/80 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]', ativo ? 'border-red-400 ring-1 ring-red-200' : 'border-zinc-200/80')}>
                  <div className="min-w-0">
                    <span className="text-[11px] font-medium text-texto-secundario">Atrasadas</span>
                    <span className={cx('mt-1 block text-xl font-bold tabular-nums', n >= 1 ? 'text-red-700' : 'text-slate-400')}>{n}</span>
                  </div>
                  <span className={cx('grid size-7 shrink-0 place-items-center rounded-lg', n >= 1 ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-400')}>
                    <Wrench className="size-3.5" />
                  </span>
                </button>
              )
            })()}
          </div>
        )}

          {filtroOS && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-texto-secundario">
                Filtrando: <strong className="text-ponto">{filtroOS === 'em_andamento' ? 'Em andamento' : filtroOS === 'aguardando_aprovacao' ? 'Aguardando aprovação' : filtroOS === 'pronta' ? 'Prontas' : 'Atrasadas'}</strong>
              </span>
              <button type="button" onClick={() => setFiltroOS(null)} className="text-xs font-semibold text-ponto hover:underline">Limpar filtro</button>
            </div>
          )}

          {ordensFiltradas.length === 0 ? (
            <div className="mt-3 flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-8 text-center">
              <Wrench className="size-6 text-slate-300" aria-hidden />
              <p className="mt-2 text-sm font-semibold text-ponto">{ordensAtivas.length === 0 ? 'Nenhuma ordem de serviço ativa' : 'Nenhuma OS neste status'}</p>
              <p className="mt-1 text-xs text-texto-secundario">{ordensAtivas.length === 0 ? 'Receba o primeiro aparelho para começar.' : 'Tente outro filtro ou limpe a seleção.'}</p>
              <div className="mt-3 flex gap-2">
                {filtroOS && <button type="button" onClick={() => setFiltroOS(null)} className="btn btn-secundario text-xs">Limpar filtro</button>}
                {pode.criarOrdem && <Link to="/os/nova" className="btn btn-primario text-xs">+ Nova OS</Link>}
              </div>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200/80">
              {ordensFiltradas.slice(0, 8).map(o => (
                <li key={o.id}>
                  <Link to={`/os/${o.id}`} className="flex items-center gap-3 px-3 py-2.5 transition hover:bg-zinc-50/80">
                    <span className="shrink-0 font-semibold tabular-nums text-ponto text-sm">{numeroOS(o.numero)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{o.cliente_nome}</span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">{STATUS_OS[o.status as keyof typeof STATUS_OS] ?? o.status}</span>
                    <span className="hidden shrink-0 text-[11px] text-texto-secundario sm:inline">{o.prazo_prometido ? `Prazo ${o.prazo_prometido}` : 'Sem prazo'}</span>
                    <ChevronRight className="size-3.5 shrink-0 text-slate-300" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="cartao rounded-2xl p-4" aria-label="Produtos e disponibilidade">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-ponto">Produtos e disponibilidade</h2>
            <Link to="/estoque" className="btn btn-secundario px-3 py-1.5 text-xs">
              Ver disponibilidade <ChevronRight className="size-3.5" />
            </Link>
          </div>
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-emerald-50/60 p-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-100 text-marca">
              <Boxes className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-texto-secundario">Produtos com saldo</p>
              <p className="text-xl font-bold tabular-nums text-ponto">
                {comSaldo} <span className="text-sm font-medium text-texto-secundario">de {produtos.filter(p => p.ativo).length} cadastrados</span>
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(() => {
              const n = paraRepor.length
              return (
                <button type="button" onClick={() => navegar('/estoque?filtro=abaixo')} className="flex items-start justify-between gap-2 rounded-xl border border-zinc-200/80 bg-white p-3 text-left transition-all duration-200 hover:bg-zinc-50/80 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]">
                  <div className="min-w-0">
                    <span className="text-[11px] font-medium text-texto-secundario">Para repor</span>
                    <span className={cx('mt-1 block text-xl font-bold tabular-nums', n >= 1 ? 'text-amber-700' : 'text-slate-400')}>{n}</span>
                    <span className="text-[10px] text-texto-secundario">saldo no mínimo</span>
                  </div>
                  <span className={cx('grid size-7 shrink-0 place-items-center rounded-lg', n >= 1 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-400')}>
                    <ShoppingBasket className="size-3.5" />
                  </span>
                </button>
              )
            })()}
            {(() => {
              const n = contagem.zerado
              return (
                <button type="button" onClick={() => navegar('/estoque?filtro=zerado')} className="flex items-start justify-between gap-2 rounded-xl border border-zinc-200/80 bg-white p-3 text-left transition-all duration-200 hover:bg-zinc-50/80 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]">
                  <div className="min-w-0">
                    <span className="text-[11px] font-medium text-texto-secundario">Estoque zerado</span>
                    <span className={cx('mt-1 block text-xl font-bold tabular-nums', n >= 1 ? 'text-red-700' : 'text-slate-400')}>{n}</span>
                    <span className="text-[10px] text-texto-secundario">produtos sem saldo</span>
                  </div>
                  <span className={cx('grid size-7 shrink-0 place-items-center rounded-lg', n >= 1 ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-400')}>
                    <PackageX className="size-3.5" />
                  </span>
                </button>
              )
            })()}
            {(() => {
              const n = contagem.vencendo
              return (
                <button type="button" onClick={() => navegar('/estoque?filtro=vencendo')} className="flex items-start justify-between gap-2 rounded-xl border border-zinc-200/80 bg-white p-3 text-left transition-all duration-200 hover:bg-zinc-50/80 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]">
                  <div className="min-w-0">
                    <span className="text-[11px] font-medium text-texto-secundario">Vencem em 30 dias</span>
                    <span className={cx('mt-1 block text-xl font-bold tabular-nums', n >= 1 ? 'text-amber-700' : 'text-slate-400')}>{n}</span>
                    <span className="text-[10px] text-texto-secundario">alerta preventivo</span>
                  </div>
                  <span className={cx('grid size-7 shrink-0 place-items-center rounded-lg', n >= 1 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-400')}>
                    <Clock className="size-3.5" />
                  </span>
                </button>
              )
            })()}
            {(() => {
              const n = contagem.vencido
              return (
                <button type="button" onClick={() => navegar('/estoque?filtro=vencido')} className="flex items-start justify-between gap-2 rounded-xl border border-zinc-200/80 bg-white p-3 text-left transition-all duration-200 hover:bg-zinc-50/80 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]">
                  <div className="min-w-0">
                    <span className="text-[11px] font-medium text-texto-secundario">Vencidos</span>
                    <span className={cx('mt-1 block text-xl font-bold tabular-nums', n >= 1 ? 'text-red-700' : 'text-slate-400')}>{n}</span>
                    <span className="text-[10px] text-texto-secundario">lotes com saldo</span>
                  </div>
                  <span className={cx('grid size-7 shrink-0 place-items-center rounded-lg', n >= 1 ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-400')}>
                    <OctagonAlert className="size-3.5" />
                  </span>
                </button>
              )
            })()}
          </div>


        </section>
      </div>

      {pode.movimentar && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:hidden">
          <Atalho para="/movimentar?tipo=entrada" icone={ArrowDownToLine} titulo="Entrada" tom="entrada" />
          <Atalho para="/movimentar?tipo=saida&camera=1" icone={ScanBarcode} titulo="Escanear baixa" tom="destaque" />
          <Atalho para="/movimentar?tipo=saida" icone={ArrowUpFromLine} titulo="Saída manual" tom="saida" />
        </div>
      )}

      <div className="stagger-in" style={{ animationDelay: '180ms' }}>
        <section className="cartao rounded-2xl flex min-h-[300px] min-w-0 flex-col p-5" aria-labelledby="movimento-vendas">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 id="movimento-vendas" className="text-sm font-semibold text-ponto">Movimento de vendas</h2>
              <p className="mt-1 text-2xl font-bold tabular-nums text-ponto">
                {vendasSemana === null || falhaVendas ? '—' : formatarReais(totalSemana)}
              </p>
              <p className="mt-0.5 text-xs text-texto-secundario">Últimos 7 dias acumulados</p>
            </div>
            <span className="shrink-0 text-right text-xs font-semibold text-marca tabular-nums">
              {vendasSemana === null || falhaVendas
                ? '—'
                : `${formatarReais(diaAtivo.total)} ${diaAtivo.hoje ? 'hoje' : `(${diaAtivo.rotulo.toLowerCase()})`}`}
            </span>
          </div>
          <div className="relative flex h-[190px] gap-2">
            <div className="flex h-[158px] flex-col justify-between text-[10px] tabular-nums text-slate-300">
              <span>{formatarReais(maiorDia)}</span>
              <span>{formatarReais(Math.round(maiorDia / 2))}</span>
              <span>0</span>
            </div>
            <div className="relative flex-1">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[158px]">
                {[0.25, 0.5, 0.75].map(p => (
                  <div key={p} className="absolute left-0 right-0 border-t border-dashed border-slate-100" style={{ bottom: `${p * 100}%` }} />
                ))}
              </div>
              <div className="flex h-[190px] items-end justify-around gap-3 px-1" role="img" aria-label="Vendas concluídas nos últimos sete dias">
                {diasVendas.map(dia => {
                  const altura = dia.total === 0 ? 0 : Math.max(6, Math.round((dia.total / maiorDia) * 100))
                  const selecionado = dia.iso === diaAtivo.iso
                  return (
                    <button
                      key={dia.iso}
                      type="button"
                      onClick={() => setDiaSelecionado(dia.iso)}
                      aria-label={`${dia.rotulo}: ${formatarReais(dia.total)}`}
                      className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2 outline-none"
                    >
                      {dia.hoje && (
                        <span className="absolute top-0 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-amber-400" aria-hidden />
                      )}
                      <div className="relative flex h-[158px] w-full items-end justify-center">
                        <div className="absolute inset-x-0 bottom-0 top-0 rounded-md bg-[#F3F4F6]" />
                        <div
                          className={cx(
                            'relative z-10 w-[45%] min-w-[6px] rounded-t-[6px] transition-[height,background-color]',
                            dia.hoje ? 'bg-letreiro' : selecionado ? 'bg-ponto/70' : 'bg-slate-300 group-hover:bg-slate-400',
                          )}
                          style={{ height: `${altura}%` }}
                          title={`${dia.rotulo}: ${formatarReais(dia.total)}`}
                        />
                      </div>
                      <span className={cx('text-[10px]', dia.hoje || selecionado ? 'font-semibold text-ponto' : 'text-slate-400')}>{dia.rotulo}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </section>


      </div>

      <Link
        to="/fiscal"
        className="stagger-in cartao flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200/80 p-4 transition hover:border-slate-300 hover:shadow-md"
        style={{ animationDelay: '210ms' }}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-marca">
          <Receipt className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ponto">Conferência fiscal</span>
          <span className="block text-xs text-texto-secundario">
            {vendasHoje.length === 0
              ? 'Nenhuma venda concluída hoje para conferir.'
              : fiscalADecidir > 0
                ? `${fiscalADecidir} venda(s) de hoje ainda esperam a sua decisão de emitir ou deixar sem nota.`
                : `Tudo conferido hoje: ${fiscalEmitidas} emitida(s) e ${fiscalSemNota} sem nota.`}
          </span>
        </span>
        <span
          className={cx(
            'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
            fiscalADecidir > 0 ? 'bg-amber-100 text-amber-800 ring-amber-200' : 'bg-emerald-100 text-emerald-800 ring-emerald-200',
          )}
        >
          {fiscalADecidir > 0 ? `${fiscalADecidir} a decidir` : 'Dia conferido'}
        </span>
        <ChevronRight className="size-4 shrink-0 text-slate-300" />
      </Link>

      <div className="stagger-in grid grid-cols-1 gap-4 lg:grid-cols-2" style={{ animationDelay: '240ms' }}>
        <section className="cartao rounded-2xl border border-zinc-200/80 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-ponto">Atenção na loja</h2>
            <Link to="/estoque" className="flex items-center text-xs font-semibold text-ponto hover:underline">
              Ver disponibilidade <ChevronRight className="size-4" />
            </Link>
          </div>
          {atencao.length === 0 ? (
            <div className="cartao">
              <Vazio icone={CircleCheck} titulo="Tudo em dia" texto="Nenhum item vencido, vencendo, zerado ou no mínimo." />
            </div>
          ) : (
            <div className="max-h-[240px] overflow-y-auto barra-fina">
              <ul className="divide-y divide-[#F3F4F6]">
                {atencao.map(item => {
                  const vencido = item.situacao === 'vencido' || item.situacao === 'zerado'
                  const vencendo = item.situacao === 'vencendo'
                  const badgeClasse = vencido
                    ? 'bg-[#FEF2F2] text-[#DC2626]'
                    : vencendo
                      ? 'bg-[#FFFBEB] text-[#D97706]'
                      : 'bg-slate-100 text-slate-600'
                  const badgeTexto = item.situacao === 'vencido'
                    ? 'Vencido'
                    : item.situacao === 'zerado'
                      ? 'Sem estoque'
                      : item.situacao === 'vencendo'
                        ? 'Vencendo'
                        : 'Repor'
                  return (
                    <li key={item.chave}>
                      <Link to={item.href} data-atencao data-situacao={item.situacao} className="flex items-center gap-3 py-[14px] transition hover:bg-zinc-50/60">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{item.nome}</p>
                          <p className="truncate text-xs text-slate-500">{item.detalhe}</p>
                        </div>
                        <span className={cx('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold', badgeClasse)}>
                          {vencido ? <OctagonAlert className="size-3" /> : vencendo ? <Clock className="size-3" /> : <ShoppingBasket className="size-3" />}
                          {badgeTexto}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </section>

        <section className="cartao rounded-2xl border border-zinc-200/80 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-ponto">
              Últimas movimentações
              {movHoje.length > 0 && <span className="ml-2 text-xs font-normal text-texto-secundario">{movHoje.length} hoje</span>}
            </h2>
            <Link to="/historico" className="btn btn-secundario px-3 py-1.5 text-xs">
              Histórico <ChevronRight className="size-3.5" />
            </Link>
          </div>
          {recentes === null ? <Carregando /> : recentes.length === 0 ? (
            <Vazio icone={History} titulo="Nenhuma movimentação ainda" texto="As entradas e saídas aparecem aqui." />
          ) : (
            <div className="max-h-[240px] overflow-y-auto barra-fina">
              <ListaMovimentacoes movimentacoes={recentes} agruparPorDia cartao={false} />
            </div>
          )}
        </section>
      </div>


    </div>
  )
}
