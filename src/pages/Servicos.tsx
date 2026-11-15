import { CalendarDays, Plus, Search, Wrench } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Cabecalho, Vazio, cx } from '../components/ui'
import { Paginacao } from '../components/Paginacao'
import { useAtiva } from '../contexto/Empresa'
import { os as dadosOS } from '../lib/dados'
import { formatarData, hojeISO } from '../lib/formato'
import { numeroOS, osCombina, STATUS_OS } from '../lib/servicos'
import type { OS } from '../lib/tipos'

const POR_PAGINA = 50

const CHIP_STATUS: { chave: string; rotulo: string; ponto: string }[] = [
  { chave: 'todos', rotulo: 'Todos', ponto: 'bg-slate-400' },
  { chave: 'aberta', rotulo: 'Aberta', ponto: 'bg-slate-400' },
  { chave: 'em_diagnostico', rotulo: 'Em diagnóstico', ponto: 'bg-sky-500' },
  { chave: 'aguardando_aprovacao', rotulo: 'Aguardando aprovação', ponto: 'bg-amber-400' },
  { chave: 'aprovada', rotulo: 'Aprovada', ponto: 'bg-amber-400' },
  { chave: 'em_execucao', rotulo: 'Em execução', ponto: 'bg-sky-500' },
  { chave: 'pronta', rotulo: 'Pronta', ponto: 'bg-emerald-500' },
  { chave: 'entregue', rotulo: 'Entregue', ponto: 'bg-emerald-500' },
  { chave: 'cancelada', rotulo: 'Cancelada', ponto: 'bg-slate-400' },
  { chave: 'atrasadas', rotulo: 'Atrasadas', ponto: 'bg-red-500' },
  { chave: 'sem_prazo', rotulo: 'Sem prazo', ponto: 'bg-slate-300' },
]

export function Servicos() {
  const { empresa, loja, pode } = useAtiva()
  const [params] = useSearchParams()
  const [ordens, setOrdens] = useState<OS[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState(params.get('q') ?? '')
  const [pagina, setPagina] = useState(1)

  const grupo = params.get('grupo') ?? ''
  const statusParam = params.get('status') ?? ''
  const filtroParam = params.get('filtro') ?? ''
  const [chip, setChip] = useState<string>(() => {
    if (grupo === 'em_andamento') return 'em_andamento'
    if (filtroParam === 'atrasada') return 'atrasadas'
    if (statusParam) return statusParam
    return params.get('chip') ?? 'todos'
  })

  useEffect(() => {
    setCarregando(true)
    dadosOS
      .listarOrdens(empresa.empresa_id, loja.id)
      .then(setOrdens)
      .finally(() => setCarregando(false))
  }, [empresa.empresa_id, loja.id])

  const hoje = hojeISO()

  const filtradas = useMemo(() => {
    let lista = ordens
    if (chip === 'em_andamento') lista = lista.filter(o => ['aberta', 'em_diagnostico', 'em_execucao'].includes(o.status))
    else if (chip === 'atrasadas') lista = lista.filter(o => o.prazo_prometido && o.prazo_prometido < hoje && o.status !== 'entregue' && o.status !== 'cancelada')
    else if (chip === 'sem_prazo') lista = lista.filter(o => !o.prazo_prometido && o.status !== 'entregue' && o.status !== 'cancelada')
    else if (chip !== 'todos') lista = lista.filter(o => o.status === chip)
    if (busca.trim()) lista = lista.filter(o => osCombina(o, busca))
    // ordenação: atrasadas primeiro, depois prazo mais próximo, depois número desc
    return [...lista].sort((a, b) => {
      const aa = a.prazo_prometido && a.prazo_prometido < hoje && a.status !== 'entregue' && a.status !== 'cancelada' ? 0 : 1
      const bb = b.prazo_prometido && b.prazo_prometido < hoje && b.status !== 'entregue' && b.status !== 'cancelada' ? 0 : 1
      if (aa !== bb) return aa - bb
      if (a.prazo_prometido && b.prazo_prometido) {
        if (a.prazo_prometido !== b.prazo_prometido) return a.prazo_prometido.localeCompare(b.prazo_prometido)
      } else if (a.prazo_prometido) {
        return -1
      } else if (b.prazo_prometido) {
        return 1
      }
      return b.numero - a.numero
    })
  }, [ordens, chip, busca, hoje])

  const paginadas = useMemo(() => filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA), [filtradas, pagina])

  useEffect(() => {
    setPagina(1)
  }, [chip, busca])

  const ehAtrasada = (o: OS) => !!o.prazo_prometido && o.prazo_prometido < hoje && o.status !== 'entregue' && o.status !== 'cancelada'

  return (
    <div className="space-y-5">
      <Cabecalho
        titulo="Ordens de serviço"
        subtitulo="Aparelhos recebidos, orçamentos e entregas."
        acoes={
          <>
            <Link to="/os/agenda" className="btn btn-secundario">
              <CalendarDays className="size-4" /> Agenda
            </Link>
            {pode.criarOrdem && (
              <Link to="/os/nova" className="btn btn-primario">
                <Plus className="size-4" /> Nova OS
              </Link>
            )}
          </>
        }
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          className="campo pl-9"
          placeholder="Buscar cliente, IMEI ou número da OS"
          aria-label="Buscar"
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
      </div>

      <div className="rolagem-x flex gap-2" role="group" aria-label="Filtrar por status">
        {CHIP_STATUS.map(c => {
          const ativo = chip === c.chave
          const contagem = c.chave === 'em_andamento'
            ? ordens.filter(o => ['aberta', 'em_diagnostico', 'em_execucao'].includes(o.status)).length
            : c.chave === 'atrasadas'
              ? ordens.filter(o => o.prazo_prometido && o.prazo_prometido < hoje && o.status !== 'entregue' && o.status !== 'cancelada').length
              : c.chave === 'sem_prazo'
                ? ordens.filter(o => !o.prazo_prometido && o.status !== 'entregue' && o.status !== 'cancelada').length
                : c.chave === 'todos'
                  ? ordens.length
                  : ordens.filter(o => o.status === c.chave).length
          return (
            <button
              key={c.chave}
              type="button"
              aria-pressed={ativo}
              className={cx('flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium', ativo ? 'border-ponto bg-ponto text-white' : 'border-borda-loja bg-white text-slate-700')}
              onClick={() => setChip(c.chave)}
            >
              <span className={cx('size-2 rounded-full', c.ponto)} />
              {c.rotulo}
              <span className="tabular-nums text-xs opacity-70">{contagem}</span>
            </button>
          )
        })}
        {chip === 'em_andamento' && (
          <span className="sr-only">Filtro de grupo: Em andamento</span>
        )}
      </div>

      {carregando ? (
        <div className="cartao p-6 text-center text-slate-500">Carregando…</div>
      ) : filtradas.length === 0 ? (
        busca.trim() || chip !== 'todos' ? (
          <Vazio icone={Search} titulo="Nada encontrado" texto="Ajuste a busca ou os filtros." />
        ) : (
          <Vazio icone={Wrench} titulo="Nenhuma ordem de serviço" texto="Receba o primeiro aparelho no botão Nova OS.">{pode.criarOrdem && <Link to="/os/nova" className="btn btn-primario">Nova OS</Link>}</Vazio>
        )
      ) : (
        <>
          <div className="space-y-3">
            {paginadas.map(o => (
              <Link key={o.id} to={`/os/${o.id}`} className="cartao block px-4 py-4 transition hover:brightness-[.99]" data-os={numeroOS(o.numero).replace('OS ', '')} data-status={o.status}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold tabular-nums text-ponto">{numeroOS(o.numero)}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{STATUS_OS[o.status]}</span>
                  {ehAtrasada(o) && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Atrasada</span>}
                </div>
                <p className="mt-1 text-sm text-slate-700">
                  {o.cliente_nome}
                  {o.cliente_telefone ? ` · ${o.cliente_telefone}` : ''}
                </p>
                <p className="text-xs text-slate-500">
                  {o.aparelho_tipo ?? 'Aparelho'} · {o.aparelho_marca_modelo ?? ''}
                  {o.aparelho_serie_imei ? <span className="font-mono"> · IMEI {o.aparelho_serie_imei}</span> : ''}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-600">
                  {o.prazo_prometido ? `Prazo: ${formatarData(o.prazo_prometido)}` : 'Sem prazo'}
                </p>
              </Link>
            ))}
          </div>
          <Paginacao pagina={pagina} totalPaginas={Math.ceil(filtradas.length / POR_PAGINA)} primeiro={(pagina - 1) * POR_PAGINA + 1} ultimo={Math.min(pagina * POR_PAGINA, filtradas.length)} total={filtradas.length} rotulo="ordens de serviço" aoMudar={setPagina} />
        </>
      )}
    </div>
  )
}