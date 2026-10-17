import { History, Lock, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { CorrecaoModal } from '../components/CorrecaoModal'
import { ListaMovimentacoes } from '../components/ListaMovimentacoes'
import { Aviso, Cabecalho, Carregando, Vazio, cx } from '../components/ui'
import { useDados } from '../contexto/Dados'
import { useAtiva } from '../contexto/Empresa'
import { movimentos } from '../lib/dados'
import { exibirCodigo, formatarData, hojeISO, normalizarBusca } from '../lib/formato'
// 🔧 CORREÇÃO: adicionar `intervaloRapido` no import
import { PERIODOS, intervaloParaInstantes, intervaloRapido, periodoDaUrl, type Intervalo, type PeriodoRapido } from '../lib/periodos'
import type { Movimentacao, TipoMov } from '../lib/tipos'

const TIPOS_FILTRO: { valor: TipoMov; nome: string }[] = [
  { valor: 'ENTRADA', nome: 'Entradas' },
  { valor: 'SAIDA', nome: 'Saídas' },
  { valor: 'AJUSTE', nome: 'Ajustes' },
  { valor: 'CORRECAO', nome: 'Correções' },
]

const PERIODOS_CHIP = PERIODOS.filter(p => p.valor !== 'mesAnterior')

function juntarParams(params: URLSearchParams, mudancas: Record<string, string | null>): URLSearchParams {
  const p = new URLSearchParams(params)
  for (const [chave, valor] of Object.entries(mudancas)) {
    if (valor) p.set(chave, valor)
    else p.delete(chave)
  }
  return p
}

export function Historico() {
  const { versao, produtoPorId, lotePorId } = useDados()
  const { empresa, loja, pode } = useAtiva()
  const [params, setParams] = useSearchParams()

  const daUrl = useMemo(() => periodoDaUrl(params, hojeISO()), [params])
  const tipo = (TIPOS_FILTRO.find(t => t.valor === params.get('tipo'))?.valor ?? '') as TipoMov | ''
  const termo = params.get('q') ?? ''
  const [personalizado, setPersonalizado] = useState<Intervalo>(daUrl.intervalo)
  const [busca, setBusca] = useState(termo)
  const [movs, setMovs] = useState<Movimentacao[] | null>(null)
  const [erro, setErro] = useState('')
  const [corrigindo, setCorrigindo] = useState<Movimentacao | null>(null)
  const primeiroChip = useRef<HTMLButtonElement>(null)

  // 🔧 CORREÇÃO: estado para o período (o Relatorios.tsx já tinha; o Historico esqueceu)
  const [periodo, setPeriodo] = useState<PeriodoRapido>(daUrl.periodo)

  // 🔧 CORREÇÃO: sincroniza o estado quando a URL muda (link colado, "Limpar filtros", etc)
  useEffect(() => {
    setPeriodo(daUrl.periodo)
  }, [daUrl.periodo])

  // 🔧 CORREÇÃO: usa o período do estado (não só da URL)
  const intervalo = periodo === 'personalizado' ? personalizado : intervaloRapido(periodo)

  useEffect(() => {
    setBusca(termo)
  }, [termo])

  useEffect(() => {
    if (busca.trim() === termo.trim()) return
    const espera = setTimeout(() => setParams(juntarParams(params, { q: busca.trim() || null }), { replace: true }), 300)
    return () => clearTimeout(espera)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca])

  useEffect(() => {
    let ativo = true
    setErro('')
    movimentos
      .listarMovimentacoes(empresa.empresa_id, loja.id, intervaloParaInstantes(intervalo))
      .then(m => ativo && setMovs(m))
      .catch(e => ativo && setErro((e as Error).message))
    return () => {
      ativo = false
    }
  }, [intervalo.de, intervalo.ate, versao, empresa.empresa_id, loja.id])

  const filtradas = useMemo(() => {
    const t = normalizarBusca(termo)
    return (movs ?? []).filter(m => {
      if (tipo && m.tipo !== tipo) return false
      if (!t) return true
      const p = produtoPorId.get(m.produto_id)
      const l = lotePorId.get(m.lote_id)
      return [p?.nome, p?.codigo_interno, ...(p?.codigos.map(c => exibirCodigo(c.codigo)) ?? []), l?.lote, m.documento, m.usuario_nome, m.observacao, `#${m.id}`]
        .some(c => c && normalizarBusca(c).includes(t))
    })
  }, [movs, tipo, termo, produtoPorId, lotePorId])

  function escrever(mudancas: Record<string, string | null>) {
    setParams(juntarParams(params, mudancas), { replace: true })
  }

  function escolherPeriodo(p: PeriodoRapido) {
    // 🔧 CORREÇÃO: guarda o período no estado (era o que faltava)
    setPeriodo(p)
    if (p === 'personalizado') escrever({ de: intervalo.de, ate: intervalo.ate })
    else escrever({ de: null, ate: null })
  }

  function mudarData(lado: 'de' | 'ate', data: string) {
    if (!data) return
    const novo = lado === 'de' ? { de: data, ate: intervalo.ate } : { de: intervalo.de, ate: data }
    setPersonalizado(novo)
    // 🔧 CORREÇÃO: mudar a data força "personalizado"
    setPeriodo('personalizado')
    escrever({ de: novo.de, ate: novo.ate })
  }

  function limparFiltros() {
    setPersonalizado(daUrl.intervalo)
    setBusca('')
    // 🔧 CORREÇÃO: volta o período para o padrão
    setPeriodo(daUrl.periodo)
    escrever({ de: null, ate: null, tipo: null, q: null })
    primeiroChip.current?.focus()
  }

  const temFiltro = Boolean(tipo || termo.trim() || params.get('de') || params.get('ate'))
  // 🔧 CORREÇÃO: usa o estado (não daUrl.periodo)
  const periodoAtual: PeriodoRapido = periodo
  const nomePeriodo = (PERIODOS.find(p => p.valor === periodoAtual)?.nome ?? '').toLowerCase()
  const descricaoPeriodo = periodoAtual === 'personalizado' ? `de ${formatarData(intervalo.de)} a ${formatarData(intervalo.ate)}` : nomePeriodo
  const nomeTipo = TIPOS_FILTRO.find(t => t.valor === tipo)?.nome ?? tipo
  const textoVazio = termo.trim()
    ? `Nenhum lançamento corresponde a “${termo.trim()}”${descricaoPeriodo ? ` (${descricaoPeriodo})` : ''}. Tente outro termo ou limpe os filtros.`
    : tipo || periodoAtual === 'personalizado'
      ? `Não há lançamentos${tipo ? ` de ${nomeTipo}` : ''} ${descricaoPeriodo}.`
      : 'Não há lançamentos para os filtros escolhidos.'

  return (
    <div>
      <Cabecalho titulo="Histórico de movimentações" subtitulo={movs ? `${filtradas.length} lançamento(s) no período` : undefined} />

      <div className="mb-4 space-y-3">
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Período" className="-mx-4 flex flex-1 gap-2 rolagem-x overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {PERIODOS_CHIP.map((p, i) => (
              <button
                key={p.valor}
                ref={i === 0 ? primeiroChip : undefined}
                type="button"
                aria-pressed={periodoAtual === p.valor}
                onClick={() => escolherPeriodo(p.valor)}
                className={cx('chip', periodoAtual === p.valor ? 'chip-ativo' : 'chip-inativo')}
              >
                {p.nome}
              </button>
            ))}
            {temFiltro && (
              <button type="button" onClick={limparFiltros} className="chip chip-inativo sm:hidden">
                <X className="size-4" /> Limpar
              </button>
            )}
          </div>
          {temFiltro && (
            <button type="button" onClick={limparFiltros} className="btn btn-fantasma ml-auto hidden shrink-0 px-3 py-2 text-sm text-slate-600 sm:inline-flex">
              <X className="size-4" /> Limpar filtros
            </button>
          )}
        </div>
        {periodoAtual === 'personalizado' && (
          <div className="grid grid-cols-2 gap-2 sm:max-w-md">
            <div>
              <label className="rotulo" htmlFor="h-de">De</label>
              <input id="h-de" type="date" className="campo" value={intervalo.de} max={intervalo.ate} onChange={e => mudarData('de', e.target.value)} />
            </div>
            <div>
              <label className="rotulo" htmlFor="h-ate">Até</label>
              <input id="h-ate" type="date" className="campo" value={intervalo.ate} min={intervalo.de} max={hojeISO()} onChange={e => mudarData('ate', e.target.value)} />
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-slate-400" />
            <input
              className="campo pl-10"
              placeholder="Produto, lote, documento, usuário ou nº"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              aria-label="Buscar"
            />
          </div>
          <select className="campo sm:w-48" value={tipo} onChange={e => escrever({ tipo: e.target.value || null })} aria-label="Tipo">
            <option value="">Todos os tipos</option>
            {TIPOS_FILTRO.map(t => (
              <option key={t.valor} value={t.valor}>{t.nome}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-xl bg-slate-200/60 px-3.5 py-2.5 text-xs text-slate-600">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        <span>
          O histórico é protegido: lançamentos não podem ser alterados nem excluídos. Para corrigir um erro, use <strong>Corrigir</strong> — o sistema
          registra uma movimentação de correção vinculada ao lançamento original.
        </span>
      </div>

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!movs && !erro ? (
        <Carregando />
      ) : filtradas.length === 0 ? (
        <div className="cartao">
          <Vazio icone={History} titulo="Nenhuma movimentação" texto={textoVazio}>
            {temFiltro && (
              <button type="button" onClick={limparFiltros} className="btn btn-secundario">
                <X className="size-4" /> Limpar filtros
              </button>
            )}
          </Vazio>
        </div>
      ) : (
        <ListaMovimentacoes movimentacoes={filtradas} aoCorrigir={pode.movimentar ? setCorrigindo : undefined} resumo />
      )}

      <CorrecaoModal movimentacao={corrigindo} aoFechar={() => setCorrigindo(null)} />
    </div>
  )
}