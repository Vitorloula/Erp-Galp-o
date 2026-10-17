import { ArrowDownToLine, ArrowUpFromLine, Boxes, ChevronRight, Clock, OctagonAlert, PackageX, ScanBarcode, ShoppingBasket } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ListaMovimentacoes } from '../components/ListaMovimentacoes'
import { BadgeSituacao, Carregando, Kpi, cx } from '../components/ui'
import { useAuth } from '../contexto/Auth'
import { useDados } from '../contexto/Dados'
import { useAtiva } from '../contexto/Empresa'
import { movimentos } from '../lib/dados'
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
import type { Movimentacao } from '../lib/tipos'

function saudacao() {
  const h = new Date().getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
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
}

export function Painel() {
  const { usuario } = useAuth()
  const { empresa, loja, pode } = useAtiva()
  const { produtos, lotes, carregando, versao } = useDados()
  const navegar = useNavigate()
  const [recentes, setRecentes] = useState<Movimentacao[] | null>(null)

  useEffect(() => {
    movimentos.listarMovimentacoes(empresa.empresa_id, loja.id, { limite: 8 }).then(setRecentes).catch(() => setRecentes([]))
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

  if (carregando) return <Carregando />

  const dataExtenso = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500 first-letter:uppercase">{dataExtenso}</p>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          {saudacao()}, {usuario?.nome.split(' ')[0]}
        </h1>
      </div>

      {pode.movimentar && (
      <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:hidden">
        <Link to="/movimentar?tipo=entrada" className="cartao flex flex-col items-center gap-1.5 p-3 text-center text-sm font-semibold text-slate-700 active:bg-slate-50">
          <span className="grid size-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><ArrowDownToLine className="size-5" /></span>
          Entrada
        </Link>
        <Link to="/movimentar?tipo=saida&camera=1" className="flex flex-col items-center gap-1.5 rounded-2xl bg-emerald-700 p-3 text-center text-sm font-semibold text-white shadow-sm active:bg-emerald-800">
          <span className="grid size-10 place-items-center rounded-xl bg-white/15"><ScanBarcode className="size-5" /></span>
          Escanear baixa
        </Link>
        <Link to="/movimentar?tipo=saida" className="cartao flex flex-col items-center gap-1.5 p-3 text-center text-sm font-semibold text-slate-700 active:bg-slate-50">
          <span className="grid size-10 place-items-center rounded-xl bg-sky-100 text-sky-700"><ArrowUpFromLine className="size-5" /></span>
          Saída manual
        </Link>
      </div>
      )}

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-5">
        <section className="xl:col-span-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Precisa de atenção</h2>
            <Link to="/estoque" className="flex items-center text-sm font-medium text-emerald-800 hover:underline">
              Ver estoque <ChevronRight className="size-4" />
            </Link>
          </div>
          {atencao.length === 0 ? (
            <div className="cartao p-6 text-center text-sm text-slate-500">Tudo em dia: nenhum item vencido, vencendo, zerado ou no mínimo. 🎉</div>
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
                    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-inset ring-amber-200">
                      <ShoppingBasket className="size-3.5" />
                      Repor
                    </span>
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
            <h2 className="font-semibold text-slate-900">
              Últimas movimentações
              {movHoje.length > 0 && <span className="ml-2 text-sm font-normal text-slate-500">{movHoje.length} hoje</span>}
            </h2>
            <Link to="/historico" className="flex items-center text-sm font-medium text-emerald-800 hover:underline">
              Histórico <ChevronRight className="size-4" />
            </Link>
          </div>
          {recentes === null ? <Carregando /> : recentes.length === 0 ? (
            <div className="cartao p-6 text-center text-sm text-slate-500">Nenhuma movimentação ainda.</div>
          ) : (
            <ListaMovimentacoes movimentacoes={recentes} />
          )}
        </section>
      </div>
    </div>
  )
}
