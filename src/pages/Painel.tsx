import { ArrowDownToLine, ArrowUpFromLine, Banknote, Boxes, ChevronRight, CircleCheck, Clock, History, OctagonAlert, Package, PackageX, ScanBarcode, ShoppingBasket, ShoppingCart, TrendingUp, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ListaMovimentacoes } from '../components/ListaMovimentacoes'
import { BadgeReposicao, BadgeSituacao, Carregando, Kpi, Vazio, cx } from '../components/ui'
import { useAuth } from '../contexto/Auth'
import { useDados } from '../contexto/Dados'
import { useAtiva } from '../contexto/Empresa'
import { movimentos, vendas as dadosVendas } from '../lib/dados'
import {
  PRIORIDADE,
  PRIORIDADE_ATENCAO,
  montarLinhasEstoque,
  precisaRepor,
  saldosPorProduto,
  situacaoReposicao,
  type Situacao,
} from '../lib/estoque'
import { formatarQtd, formatarValidade, hojeISO } from '../lib/formato'
import { centavos, formatarReais } from '../pdv/venda'
import type { Movimentacao, Unidade } from '../lib/tipos'
import type { Venda } from '../lib/dados/vendas'

function saudacao() {
  const h = new Date().getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

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

  useEffect(() => {
    movimentos.listarMovimentacoes(empresa.empresa_id, loja.id, { limite: 8 }).then(setRecentes).catch(() => setRecentes([]))
  }, [versao, empresa.empresa_id, loja.id])

  useEffect(() => {
    let ativo = true
    setVendasSemana(null)
    setFalhaVendas(false)
    const agora = new Date()
    const desde = new Date(agora)
    desde.setDate(desde.getDate() - 6)
    desde.setHours(0, 0, 0, 0)
    const ate = new Date(agora)
    ate.setHours(23, 59, 59, 999)
    dadosVendas
      .listarVendas(empresa.empresa_id, loja.id, { desde: desde.toISOString(), ate: ate.toISOString() })
      .then(lista => ativo && setVendasSemana(lista))
      .catch(() => {
        if (ativo) {
          setVendasSemana([])
          setFalhaVendas(true)
        }
      })
    return () => {
      ativo = false
    }
  }, [versao, empresa.empresa_id, loja.id])

  const linhas = useMemo(() => montarLinhasEstoque(produtos, lotes), [produtos, lotes])
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
      .slice(0, 8)
  }, [linhas, paraRepor])

  const hoje = hojeISO()
  const movHoje = (recentes ?? []).filter(m => hojeISO(new Date(m.ocorrido_em)) === hoje)
  const vendasHoje = (vendasSemana ?? []).filter(v => v.status === 'concluida' && hojeISO(new Date(v.ocorrido_em)) === hoje)
  const totalVendidoHoje = vendasHoje.reduce((soma, venda) => soma + centavos(venda.total), 0)
  const ticketMedio = vendasHoje.length ? Math.round(totalVendidoHoje / vendasHoje.length) : 0
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
  const maiorDia = Math.max(1, ...diasVendas.map(dia => dia.total))
  const totalSemana = diasVendas.reduce((soma, dia) => soma + dia.total, 0)
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null)
  const diaAtivo = diasVendas.find(d => d.iso === diaSelecionado) ?? diasVendas.find(d => d.hoje) ?? diasVendas[diasVendas.length - 1]

  if (carregando) return <Carregando />

  const dataExtenso = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const nomeCurto = usuario?.nome.split(' ')[0]

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
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

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Vendas de hoje">
        <Kpi
          titulo="Vendas hoje"
          valor={vendasSemana === null || falhaVendas ? '—' : formatarReais(totalVendidoHoje)}
          icone={Banknote}
          tom="verde"
          detalhe={falhaVendas ? 'Não foi possível atualizar' : `${vendasHoje.length} vendas finalizadas`}
        />
        <Kpi
          titulo="Vendas realizadas"
          valor={vendasSemana === null || falhaVendas ? '—' : vendasHoje.length}
          icone={ShoppingCart}
          detalhe={falhaVendas ? 'Tente novamente mais tarde' : 'desde a abertura da loja'}
        />
        <Kpi
          titulo="Ticket médio"
          valor={vendasSemana === null || falhaVendas ? '—' : formatarReais(ticketMedio)}
          icone={TrendingUp}
          detalhe="por compra concluída hoje"
        />
      </section>

      {pode.movimentar && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:hidden">
          <Atalho para="/movimentar?tipo=entrada" icone={ArrowDownToLine} titulo="Entrada" tom="entrada" />
          <Atalho para="/movimentar?tipo=saida&camera=1" icone={ScanBarcode} titulo="Escanear baixa" tom="destaque" />
          <Atalho para="/movimentar?tipo=saida" icone={ArrowUpFromLine} titulo="Saída manual" tom="saida" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_270px]">
        <section className="cartao flex min-h-[300px] min-w-0 flex-col p-5" aria-labelledby="movimento-vendas">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 id="movimento-vendas" className="text-sm font-semibold text-ponto">Movimento de vendas</h2>
              <p className="mt-1 text-xs text-texto-secundario">
                Últimos 7 dias · {vendasSemana === null || falhaVendas ? '—' : formatarReais(totalSemana)} acumulados
              </p>
            </div>
            <span className="shrink-0 text-right text-xs font-semibold text-marca tabular-nums">
              {vendasSemana === null || falhaVendas
                ? '—'
                : `${formatarReais(diaAtivo.total)} ${diaAtivo.hoje ? 'hoje' : `(${diaAtivo.rotulo.toLowerCase()})`}`}
            </span>
          </div>
          <div className="flex h-[190px] items-end justify-around gap-3 border-b border-slate-100 px-1" role="img" aria-label="Vendas concluídas nos últimos sete dias">
            {diasVendas.map(dia => {
              const altura = dia.total === 0 ? 4 : Math.max(10, Math.round((dia.total / maiorDia) * 100))
              const selecionado = dia.iso === diaAtivo.iso
              return (
                <button
                  key={dia.iso}
                  type="button"
                  onClick={() => setDiaSelecionado(dia.iso)}
                  aria-label={`${dia.rotulo}: ${formatarReais(dia.total)}`}
                  className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2 outline-none"
                >
                  <div className="flex h-[158px] w-full items-end justify-center" title={`${dia.rotulo}: ${formatarReais(dia.total)}`}>
                    <div
                      className={cx(
                        'w-full max-w-10 rounded-t-[5px] transition-[height,background-color]',
                        dia.hoje ? 'bg-letreiro' : selecionado ? 'bg-ponto/70' : 'bg-slate-200 group-hover:bg-slate-300',
                      )}
                      style={{ height: `${altura}%` }}
                    />
                  </div>
                  <span className={cx('text-[10px]', dia.hoje || selecionado ? 'font-semibold text-ponto' : 'text-slate-400')}>{dia.rotulo}</span>
                </button>
              )
            })}
          </div>
        </section>

        <aside className="cartao hidden flex-col gap-3 p-4 lg:flex" aria-label="Atalhos da loja">
          <div className="pb-1">
            <h2 className="text-sm font-semibold text-ponto">Atalhos da loja</h2>
            <p className="mt-1 text-xs text-texto-secundario">O que você precisa fazer?</p>
          </div>
          {pode.vender && (
            <Link to="/pdv" className="flex h-[52px] items-center gap-3 rounded-[9px] bg-ponto px-3 text-sm font-semibold text-white transition hover:bg-neutral-800">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-letreiro text-ponto"><ShoppingCart className="size-4" /></span>
              <span className="min-w-0 flex-1 truncate">Iniciar uma venda</span>
              <ChevronRight className="size-4 shrink-0 text-slate-300" />
            </Link>
          )}
          <Link to="/produtos" className="flex h-12 items-center gap-3 border-b border-slate-100 px-1 text-sm text-slate-700 transition hover:text-ponto">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-superficie text-slate-600"><Package className="size-4" /></span>
            <span className="min-w-0 flex-1 truncate">Ver produtos</span>
            <ChevronRight className="size-4 shrink-0 text-slate-400" />
          </Link>
          <Link to="/vendas" className="flex h-12 items-center gap-3 border-b border-slate-100 px-1 text-sm text-slate-700 transition hover:text-ponto">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-superficie text-slate-600"><Banknote className="size-4" /></span>
            <span className="min-w-0 flex-1 truncate">Vendas e caixa</span>
            <ChevronRight className="size-4 shrink-0 text-slate-400" />
          </Link>
          {pode.movimentar && (
            <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
              <Link to="/movimentar?tipo=entrada" className="flex items-center justify-center gap-1.5 rounded-[9px] bg-[#fff8dd] px-2.5 py-2.5 text-xs font-semibold text-ponto transition hover:brightness-95">
                <ArrowDownToLine className="size-3.5" /> Entrada
              </Link>
              <Link to="/movimentar?tipo=saida" className="flex items-center justify-center gap-1.5 rounded-[9px] border border-borda-loja bg-superficie px-2.5 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100">
                <ArrowUpFromLine className="size-3.5" /> Saída
              </Link>
            </div>
          )}
        </aside>
      </div>

      <section aria-label="Indicadores de produtos">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ponto">Produtos e disponibilidade</h2>
          <Link to="/estoque" className="flex shrink-0 items-center text-xs font-semibold text-ponto hover:underline">
            Ver disponibilidade <ChevronRight className="size-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi titulo="Produtos com saldo" valor={comSaldo} icone={Boxes} tom="verde" detalhe={`${produtos.filter(p => p.ativo).length} cadastrados`} onClick={() => navegar('/estoque')} />
          <Kpi
            titulo="Para repor"
            valor={paraRepor.length}
            icone={ShoppingBasket}
            tom={paraRepor.length ? 'amarelo' : 'neutro'}
            detalhe="saldo no mínimo"
            onClick={() => navegar('/estoque?filtro=abaixo')}
          />
          <Kpi titulo="Vencidos" valor={contagem.vencido} icone={OctagonAlert} tom={contagem.vencido ? 'vermelho' : 'neutro'} detalhe="lotes com saldo" onClick={() => navegar('/estoque?filtro=vencido')} />
          <Kpi titulo="Vencem em 30 dias" valor={contagem.vencendo} icone={Clock} tom={contagem.vencendo ? 'amarelo' : 'neutro'} detalhe="alerta preventivo" onClick={() => navegar('/estoque?filtro=vencendo')} />
          <Kpi titulo="Estoque zerado" valor={contagem.zerado} icone={PackageX} tom={contagem.zerado ? 'vermelho' : 'neutro'} detalhe="produtos sem saldo" onClick={() => navegar('/estoque?filtro=zerado')} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-5">
        <section className="xl:col-span-3">
          <div className="mb-2 flex items-center justify-between">
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
            <div className="cartao divide-y divide-slate-100 overflow-hidden">
              {atencao.map(item => (
                <Link
                  key={item.chave}
                  data-atencao
                  data-situacao={item.situacao}
                  to={item.href}
                  className={cx('flex items-center gap-3 px-4 py-3 transition hover:brightness-[.98]', `linha-${item.situacao === 'abaixo' ? 'vencendo' : item.situacao}`)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{item.nome}</p>
                    <p className="text-xs opacity-75">{item.detalhe}</p>
                  </div>
                  {item.situacao === 'abaixo' ? (
                    <BadgeReposicao situacao="abaixo" minimo={item.minimo ?? null} unidade={item.unidade ?? 'un'} />
                  ) : (
                    <BadgeSituacao situacao={item.situacao} validade={item.validade} />
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="xl:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ponto">
              Últimas movimentações
              {movHoje.length > 0 && <span className="ml-2 text-xs font-normal text-texto-secundario">{movHoje.length} hoje</span>}
            </h2>
            <Link to="/historico" className="flex items-center text-xs font-semibold text-ponto hover:underline">
              Histórico <ChevronRight className="size-4" />
            </Link>
          </div>
          {recentes === null ? <Carregando /> : recentes.length === 0 ? (
            <div className="cartao">
              <Vazio icone={History} titulo="Nenhuma movimentação ainda" texto="As entradas e saídas aparecem aqui." />
            </div>
          ) : (
            <ListaMovimentacoes movimentacoes={recentes} />
          )}
        </section>
      </div>
    </div>
  )
}
