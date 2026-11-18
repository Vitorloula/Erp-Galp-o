import { useEffect, useState } from 'react'
import { Cabecalho, Carregando, Vazio, Kpi, cx } from '../../components/ui'
import { Siren } from 'lucide-react'
import {
  adminIncidenteListar,
  adminIncidenteVer,
  adminIncidenteAtualizar,
  adminIncidenteRecontar,
} from '../../lib/admin/cliente'
import { formatarDataHora } from '../../lib/formato'

const PRIORIDADES = ['baixa', 'media', 'alta', 'critica'] as const
const SITUACOES = ['aberto', 'em_analise', 'resolvido', 'cancelado'] as const

const COR_PRIORIDADE: Record<string, string> = {
  baixa: 'bg-slate-100 text-slate-700',
  media: 'bg-sky-100 text-sky-800',
  alta: 'bg-amber-100 text-amber-800',
  critica: 'bg-red-100 text-red-800 font-bold',
}

const COR_SITUACAO: Record<string, string> = {
  aberto: 'bg-red-100 text-red-800',
  em_analise: 'bg-amber-100 text-amber-800',
  resolvido: 'bg-emerald-100 text-emerald-800',
  cancelado: 'bg-slate-100 text-slate-600',
}

export function AdminIncidentes() {
  const [incidentes, setIncidentes] = useState<any[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [prioridade, setPrioridade] = useState('')
  const [situacao, setSituacao] = useState('')
  const [detalhe, setDetalhe] = useState<Record<string, unknown> | null>(null)
  const [idDetalhe, setIdDetalhe] = useState<string | null>(null)
  const [editando, setEditando] = useState<{ prioridade: string; situacao: string; diagnostico: string; solucao: string } | null>(null)

  async function carregar() {
    setCarregando(true)
    setErro(null)
    try {
      const lista = await adminIncidenteListar({
        prioridade: prioridade || null,
        situacao: situacao || null,
      })
      setIncidentes(lista)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { void carregar() }, [prioridade, situacao])

  async function abrir(id: string) {
    setIdDetalhe(id)
    try {
      const d = await adminIncidenteVer(id)
      setDetalhe(d)
      const inc = d.incidente as any
      setEditando({
        prioridade: inc?.prioridade ?? 'media',
        situacao: inc?.situacao ?? 'aberto',
        diagnostico: inc?.diagnostico ?? '',
        solucao: inc?.solucao_recomendada ?? '',
      })
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  async function salvar() {
    if (!idDetalhe || !editando) return
    try {
      await adminIncidenteAtualizar({
        id: idDetalhe,
        prioridade: editando.prioridade,
        situacao: editando.situacao,
        diagnostico: editando.diagnostico,
        solucao: editando.solucao,
      })
      await abrir(idDetalhe)
      await carregar()
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  const criticos = incidentes.filter(i => i.prioridade === 'critica' && i.situacao !== 'resolvido' && i.situacao !== 'cancelado')

  return (
    <div className="space-y-4">
      <Cabecalho titulo="Incidentes" subtitulo="Problemas acompanhados até a resolução." />

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">{erro}</div>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi titulo="Total" valor={incidentes.length} icone={Siren} detalhe="incidentes registrados" />
        <Kpi titulo="Abertos" valor={incidentes.filter(i => i.situacao === 'aberto').length} icone={Siren} tom="vermelho" detalhe="precisam de atenção" />
        <Kpi titulo="Em análise" valor={incidentes.filter(i => i.situacao === 'em_analise').length} icone={Siren} tom="amarelo" detalhe="investigando" />
        <Kpi titulo="Críticos abertos" valor={criticos.length} icone={Siren} tom={criticos.length > 0 ? 'vermelho' : 'neutro'} detalhe="prioridade crítica" />
      </div>

      <div className="cartao space-y-3 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="rotulo" htmlFor="inc-prioridade">Prioridade</label>
            <select id="inc-prioridade" className="campo" value={prioridade} onChange={e => setPrioridade(e.target.value)}>
              <option value="">Todas</option>
              {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="rotulo" htmlFor="inc-situacao">Situação</label>
            <select id="inc-situacao" className="campo" value={situacao} onChange={e => setSituacao(e.target.value)}>
              <option value="">Todas</option>
              {SITUACOES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>

      {carregando && <Carregando texto="Carregando incidentes…" />}
      {!carregando && incidentes.length === 0 && (
        <Vazio icone={Siren} titulo="Nenhum incidente registrado" texto="Incidentes são criados a partir dos grupos de erro na tela de Logs." />
      )}
      {!carregando && incidentes.length > 0 && (
        <div className="cartao divide-y divide-slate-100 overflow-hidden">
          {incidentes.map(inc => (
            <button key={inc.id} type="button" onClick={() => abrir(inc.id)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{inc.titulo}</p>
                <p className="text-xs text-slate-500">
                  {inc.prioridade} · {inc.situacao} · {inc.usuarios_impactados} impactado(s) · {inc.primeira_em ? formatarDataHora(inc.primeira_em) : '—'}
                </p>
              </div>
              <span className={cx('rounded-full px-2 py-0.5 text-xs font-medium', COR_PRIORIDADE[inc.prioridade] ?? 'bg-slate-100 text-slate-700')}>{inc.prioridade}</span>
              <span className={cx('rounded-full px-2 py-0.5 text-xs font-medium', COR_SITUACAO[inc.situacao] ?? 'bg-slate-100 text-slate-700')}>{inc.situacao}</span>
            </button>
          ))}
        </div>
      )}

      {/* Detalhe */}
      {detalhe && idDetalhe && editando && (
        <div className="cartao space-y-4 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ponto">{(detalhe.incidente as any)?.titulo}</h2>
            <button type="button" className="btn btn-fantasma text-xs" onClick={() => { setDetalhe(null); setIdDetalhe(null); setEditando(null) }}>Fechar</button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="rotulo" htmlFor="inc-prioridade-edit">Prioridade</label>
              <select id="inc-prioridade-edit" className="campo" value={editando.prioridade} onChange={e => setEditando({ ...editando, prioridade: e.target.value })}>
                {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="rotulo" htmlFor="inc-situacao-edit">Situação</label>
              <select id="inc-situacao-edit" className="campo" value={editando.situacao} onChange={e => setEditando({ ...editando, situacao: e.target.value })}>
                {SITUACOES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="rotulo" htmlFor="inc-diagnostico">Diagnóstico da IA</label>
            <textarea id="inc-diagnostico" className="campo" rows={3} value={editando.diagnostico} onChange={e => setEditando({ ...editando, diagnostico: e.target.value })} />
          </div>
          <div>
            <label className="rotulo" htmlFor="inc-solucao">Solução recomendada</label>
            <textarea id="inc-solucao" className="campo" rows={3} value={editando.solucao} onChange={e => setEditando({ ...editando, solucao: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primario" onClick={salvar}>Salvar</button>
            <button type="button" className="btn btn-fantasma" onClick={() => adminIncidenteRecontar(idDetalhe).then(() => abrir(idDetalhe!))}>Recontar</button>
          </div>
          <div className="border-t border-slate-200 pt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Histórico de ações</h3>
            <div className="mt-2 space-y-1">
              {((detalhe.acoes as any[]) ?? []).map((a: any) => (
                <div key={a.id} className="text-xs text-slate-600">
                  <span className="font-mono text-slate-400">{formatarDataHora(a.criado_em)}</span> · {a.acao} · {a.detalhe ?? ''}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}