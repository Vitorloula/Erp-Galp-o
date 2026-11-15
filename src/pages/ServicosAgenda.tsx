import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Cabecalho, Vazio, cx } from '../components/ui'
import { useAtiva } from '../contexto/Empresa'
import { os as dadosOS } from '../lib/dados'

import { grupoDaAgenda, gruposDaAgenda, NOME_GRUPO_AGENDA, numeroOS } from '../lib/servicos'
import type { GrupoAgenda } from '../lib/servicos'
import type { OS } from '../lib/tipos'

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const COR_GRUPO: Record<GrupoAgenda, string> = {
  orcamento: 'bg-amber-400',
  em_andamento: 'bg-sky-500',
  prontas: 'bg-emerald-500',
  atrasadas: 'bg-red-500',
}

function chaveMes(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function nomeMes(d: Date) {
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

function diasDoMes(ano: number, mes: number): (Date | null)[] {
  const primeiro = new Date(ano, mes, 1)
  const ultimo = new Date(ano, mes + 1, 0)
  const celulas: (Date | null)[] = []
  for (let i = 0; i < primeiro.getDay(); i++) celulas.push(null)
  for (let d = 1; d <= ultimo.getDate(); d++) celulas.push(new Date(ano, mes, d))
  return celulas
}

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nomeDia(d: Date) {
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function ServicosAgenda() {
  const { empresa, loja, pode } = useAtiva()
  const [ordens, setOrdens] = useState<OS[]>([])
  const [carregando, setCarregando] = useState(true)
  const [cursor, setCursor] = useState(() => new Date())
  const [diaSel, setDiaSel] = useState<Date>(() => new Date())

  useEffect(() => {
    setCarregando(true)
    dadosOS.listarOrdens(empresa.empresa_id, loja.id).then(setOrdens).finally(() => setCarregando(false))
  }, [empresa.empresa_id, loja.id])

  const hoje = new Date()
  const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`

  const ordensDoMes = useMemo(() => {
    const chave = chaveMes(cursor)
    return ordens.filter(o => o.prazo_prometido && o.prazo_prometido.startsWith(chave))
  }, [ordens, cursor])

  const porDia = useMemo(() => {
    const m = new Map<string, OS[]>()
    for (const o of ordensDoMes) {
      const k = o.prazo_prometido as string
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(o)
    }
    return m
  }, [ordensDoMes])

  const celulas = useMemo(() => diasDoMes(cursor.getFullYear(), cursor.getMonth()), [cursor])

  const semPrazo = useMemo(() => ordens.filter(o => !o.prazo_prometido && o.status !== 'entregue' && o.status !== 'cancelada'), [ordens])

  const OSsDoDia = porDia.get(iso(diaSel)) ?? []

  const grupos = gruposDaAgenda(ordensDoMes, hojeISO)

  const contar = (g: 'orcamento' | 'em_andamento' | 'prontas' | 'atrasadas') => grupos[g].length

  const anterior = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
  const proximo = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))

  return (
    <div className="space-y-5">
      <Cabecalho
        titulo="Agenda"
        subtitulo="Ordens por prazo prometido. Entregues e canceladas não aparecem."
        acoes={
          <>
            <Link to="/os" className="btn btn-secundario">Lista</Link>
            {pode.criarOrdem && <Link to="/os/nova" className="btn btn-primario"><Plus className="size-4" /> Nova OS</Link>}
          </>
        }
      />

      {/* Legenda */}
      <ul className="flex flex-wrap gap-3 text-xs font-medium text-slate-600">
        {(['orcamento', 'em_andamento', 'prontas', 'atrasadas'] as const).map(g => (
          <li key={g} className="flex items-center gap-1.5">
            <span className={cx('size-2.5 rounded-full', COR_GRUPO[g])} />
            {NOME_GRUPO_AGENDA[g]} ({contar(g)})
          </li>
        ))}
      </ul>

      {/* Cabeçalho do mês */}
      <div className="flex items-center justify-between">
        <button type="button" aria-label="Mês anterior" className="btn btn-fantasma p-2" onClick={anterior}><ChevronLeft className="size-5" /></button>
        <h2 className="text-base font-semibold capitalize text-ponto">{nomeMes(cursor)}</h2>
        <button type="button" aria-label="Mês próximo" className="btn btn-fantasma p-2" onClick={proximo}><ChevronRight className="size-5" /></button>
      </div>

      {/* Grid */}
      <div className="-mx-4 sm:mx-0">
        <div className="grid grid-cols-7 gap-px bg-slate-200">
          {DIAS_SEMANA.map(d => (
            <div key={d} className="bg-white py-1 text-center text-[10px] font-semibold uppercase text-slate-500">{d}</div>
          ))}
          {celulas.map((d, i) => {
            if (!d) return <div key={`v-${i}`} className="bg-white" />
            const k = iso(d)
            const lista = porDia.get(k) ?? []
            const atrasado = lista.some(o => grupoDaAgenda(o, hojeISO) === 'atrasadas')
            const gruposPresentes = new Set(lista.map(o => grupoDaAgenda(o, hojeISO)).filter(Boolean) as GrupoAgenda[])
            const selecionado = iso(diaSel) === k
            const ehHoje = k === hojeISO
            return (
              <button
                key={k}
                type="button"
                role="gridcell"
                aria-label={`${d.getDate()} de ${cursor.toLocaleDateString('pt-BR', { month: 'long' })}: ${lista.length} ordens${atrasado ? ', ' + lista.filter(o => grupoDaAgenda(o, hojeISO) === 'atrasadas').length + ' atrasada' : ''}`}
                className={cx(
                  'flex min-h-[44px] flex-col items-center justify-start bg-white p-1 text-xs',
                  atrasado && 'bg-red-50 text-red-950',
                  ehHoje && 'ring-2 ring-letreiro ring-inset',
                  selecionado && 'bg-slate-100',
                )}
                onClick={() => setDiaSel(d)}
              >
                <span className="font-semibold">{d.getDate()}</span>
                {lista.length > 0 && <span className="text-[10px] text-slate-500">{lista.length}</span>}
                <span className="mt-0.5 flex gap-0.5">
                  {(['orcamento', 'em_andamento', 'prontas', 'atrasadas'] as const).map(g => gruposPresentes.has(g) ? <span key={g} className={cx('size-1.5 rounded-full', COR_GRUPO[g])} /> : null)}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Painel do dia */}
      <section className="cartao p-4">
        <h3 className="text-sm font-semibold text-ponto">{nomeDia(diaSel)}</h3>
        {OSsDoDia.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nenhuma ordem com prazo neste dia.</p>
        ) : (
          <div className="mt-2 divide-y divide-slate-100">
            {OSsDoDia.map(o => {
              const g = grupoDaAgenda(o, hojeISO) as GrupoAgenda
              return (
                <Link key={o.id} to={`/os/${o.id}`} className="flex items-center gap-3 py-3">
                  <span className={cx('size-2.5 rounded-full', COR_GRUPO[g])} />
                  <span className="flex-1 text-sm font-medium text-slate-800">{numeroOS(o.numero)} · {o.cliente_nome}</span>
                  <span className="text-xs text-slate-500">{NOME_GRUPO_AGENDA[g]}</span>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* Sem prazo */}
      {semPrazo.length > 0 && (
        <section className="cartao p-4">
          <h3 className="text-sm font-semibold text-ponto">Sem prazo ({semPrazo.length})</h3>
          <div className="mt-2 divide-y divide-slate-100">
            {semPrazo.map(o => (
              <Link key={o.id} to={`/os/${o.id}`} className="flex items-center gap-3 py-3">
                <span className="size-2.5 rounded-full bg-slate-300" />
                <span className="flex-1 text-sm font-medium text-slate-800">{numeroOS(o.numero)} · {o.cliente_nome}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {carregando && <div className="cartao p-6 text-center text-slate-500">Carregando…</div>}

      {!carregando && ordensDoMes.length === 0 && (
        <Vazio icone={CalendarDays} titulo={`Nada previsto para ${cursor.toLocaleDateString('pt-BR', { month: 'long' })}`} texto="Troque de mês ou veja a lista de ordens." />
      )}
    </div>
  )
}