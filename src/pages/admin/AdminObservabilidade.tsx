import { useEffect, useState } from 'react'
import { Activity } from 'lucide-react'
import { Cabecalho, Carregando, Vazio, Kpi, cx } from '../../components/ui'
import { adminLogGrupos, adminLogListar, adminLogStatus, adminVisaoGeral } from '../../lib/admin/cliente'
import { formatarDataHora } from '../../lib/formato'

const GRAVIDADES = ['info', 'aviso', 'erro', 'critico'] as const
const STATUS = ['novo', 'em_analise', 'resolvido', 'recorrente'] as const

const COR_GRAVIDADE: Record<string, string> = {
  info: 'bg-slate-100 text-slate-700',
  aviso: 'bg-amber-100 text-amber-800',
  erro: 'bg-red-100 text-red-800',
  critico: 'bg-red-200 text-red-900 font-bold',
}

export function AdminObservabilidade() {
  const [empresas, setEmpresas] = useState<{ empresa_id: string; nome: string }[]>([])
  const [empresa, setEmpresa] = useState<string>('')
  const [gravidade, setGravidade] = useState<string>('')
  const [status, setStatus] = useState<string>('')
  const [de, setDe] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
  const [ate, setAte] = useState(() => new Date().toISOString().slice(0, 10))
  const [grupos, setGrupos] = useState<any[]>([])
  const [ocorrencias, setOcorrencias] = useState<any[]>([])
  const [fingerprintAtivo, setFingerprintAtivo] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    adminVisaoGeral().then(es => setEmpresas(es.map(e => ({ empresa_id: e.empresa_id, nome: e.nome })))).catch(() => {})
  }, [])

  async function carregar() {
    setCarregando(true)
    setErro(null)
    try {
      const g = await adminLogGrupos({ empresa: empresa || null, de: `${de}T00:00:00Z`, ate: `${ate}T23:59:59Z` })
      setGrupos(g)
      if (fingerprintAtivo) {
        const o = await adminLogListar({ empresa: empresa || null, fingerprint: fingerprintAtivo, gravidade: gravidade || null, status: status || null, de: `${de}T00:00:00Z`, ate: `${ate}T23:59:59Z` })
        setOcorrencias(o)
      }
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { void carregar() }, [empresa, gravidade, status, de, ate])

  async function abrirGrupo(fp: string) {
    setFingerprintAtivo(fp)
    setCarregando(true)
    try {
      const o = await adminLogListar({ empresa: empresa || null, fingerprint: fp, gravidade: gravidade || null, status: status || null, de: `${de}T00:00:00Z`, ate: `${ate}T23:59:59Z` })
      setOcorrencias(o)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }

  async function mudarStatus(erroId: number, novoStatus: string) {
    try {
      await adminLogStatus(erroId, novoStatus)
      await abrirGrupo(fingerprintAtivo!)
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  const totalOcorrencias = grupos.reduce((s, g) => s + (g.contagem ?? 0), 0)

  return (
    <div className="space-y-4">
      <Cabecalho titulo="Logs da plataforma" subtitulo="Erros e eventos de todas as lojas, agrupados por semelhança." />
      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">{erro}</div>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Kpi titulo="Grupos distintos" valor={grupos.length} icone={Activity} tom={grupos.length > 0 ? 'vermelho' : 'neutro'} detalhe="fingerprints únicos" />
        <Kpi titulo="Ocorrências totais" valor={totalOcorrencias} icone={Activity} tom={totalOcorrencias > 0 ? 'vermelho' : 'neutro'} detalhe="no período" />
      </div>

      {/* Filtros */}
      <div className="cartao space-y-3 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="rotulo" htmlFor="log-empresa">Empresa</label>
            <select id="log-empresa" className="campo" value={empresa} onChange={e => setEmpresa(e.target.value)}>
              <option value="">Todas</option>
              {empresas.map(e => <option key={e.empresa_id} value={e.empresa_id}>{e.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="rotulo" htmlFor="log-gravidade">Gravidade</label>
            <select id="log-gravidade" className="campo" value={gravidade} onChange={e => setGravidade(e.target.value)}>
              <option value="">Todas</option>
              {GRAVIDADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="rotulo" htmlFor="log-status">Status</label>
            <select id="log-status" className="campo" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">Todos</option>
              {STATUS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="rotulo" htmlFor="log-de">De</label>
              <input id="log-de" type="date" className="campo" value={de} onChange={e => setDe(e.target.value)} />
            </div>
            <div>
              <label className="rotulo" htmlFor="log-ate">Até</label>
              <input id="log-ate" type="date" className="campo" value={ate} onChange={e => setAte(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* Grupos */}
      {carregando && <Carregando texto="Carregando logs…" />}
      {!carregando && grupos.length === 0 && (
        <Vazio icone={Activity} titulo="Nenhum erro no período" texto="Nenhum erro registrado com os filtros atuais." />
      )}
      {!carregando && grupos.length > 0 && (
        <div className="cartao divide-y divide-slate-100 overflow-hidden">
          {grupos.map(g => (
            <div key={g.fingerprint} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-slate-500">{g.fingerprint}</p>
                  <p className="mt-1 text-sm font-medium text-slate-800 line-clamp-2">{g.mensagem}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {g.contagem} ocorrência(s) · {g.lojas} loja(s) · {g.usuarios} usuário(s) · de {formatarDataHora(g.primeira)} a {formatarDataHora(g.ultima)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-secundario px-3 py-1.5 text-xs" onClick={() => abrirGrupo(g.fingerprint)}>
                    Ver ocorrências
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drill-down */}
      {fingerprintAtivo && (
        <div className="cartao space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ponto">Ocorrências — {fingerprintAtivo}</h2>
            <button type="button" className="btn btn-fantasma text-xs" onClick={() => { setFingerprintAtivo(null); setOcorrencias([]) }}>Fechar</button>
          </div>
          {ocorrencias.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma ocorrência.</p>
          ) : (
            <div className="space-y-2">
              {ocorrencias.map(o => (
                <div key={o.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cx('rounded-full px-2 py-0.5 text-xs font-medium', COR_GRAVIDADE[o.gravidade] ?? 'bg-slate-100 text-slate-700')}>{o.gravidade}</span>
                    <span className="text-xs text-slate-500">{formatarDataHora(o.criado_em)}</span>
                    {o.modulo && <span className="text-xs text-slate-500">· {o.modulo}</span>}
                  </div>
                  <p className="mt-1 text-slate-700 line-clamp-3">{o.mensagem}</p>
                  {o.stack && <pre className="mt-2 max-h-24 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-600">{o.stack}</pre>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {STATUS.map(s => (
                      <button key={s} type="button" className={cx('btn btn-fantasma px-2 py-1 text-xs', o.status === s && 'bg-slate-200')} onClick={() => mudarStatus(o.id, s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}