import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { RefreshCw, Building2, Activity, Siren } from 'lucide-react'
import { Cabecalho, Carregando, Kpi, Vazio } from '../../components/ui'
import { adminVisaoGeral, adminIncidenteListar, type AdminEmpresaResumo } from '../../lib/admin/cliente'

export function AdminPainel() {
  const [dados, setDados] = useState<AdminEmpresaResumo[] | null>(null)
  const [criticos, setCriticos] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  async function carregar() {
    setCarregando(true)
    setErro(null)
    try {
      const [d, incs] = await Promise.all([
        adminVisaoGeral(),
        adminIncidenteListar({ situacao: 'aberto', prioridade: 'critica' }),
      ])
      setDados(d)
      setCriticos(incs.length)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { void carregar() }, [])

  if (dados === null && !erro) return <Carregando texto="Carregando..." />

  const total = dados?.length ?? 0
  const ativas = dados?.filter(d => d.estado === 'ativa').length ?? 0
  const trial7 = dados?.filter(d => d.status_assinatura === 'trial').length ?? 0
  const suspensas = dados?.filter(d => d.estado === 'suspensa').length ?? 0
  const erros7 = dados?.reduce((s, d) => s + (d.erros_7d ?? 0), 0) ?? 0

  return (
    <div>
      <Cabecalho titulo="Visão geral da plataforma" subtitulo="Todas as empresas, status e saúde em um só lugar." acoes={<button className="btn btn-secundario" onClick={carregar} disabled={carregando}><RefreshCw className={carregando ? 'size-4 animate-spin' : 'size-4'} /> Atualizar</button>} />
      {erro && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">{erro}</div>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi titulo="Empresas cadastradas" valor={total} icone={Building2} detalhe="desde o início" />
        <Kpi titulo="Empresas ativas" valor={ativas} icone={Building2} tom="verde" detalhe="assinatura em dia" />
        <Kpi titulo="Trial vencendo (7d)" valor={trial7} icone={Building2} tom="amarelo" detalhe="vence nos próximos 7 dias" />
        <Kpi titulo="Suspensas" valor={suspensas} icone={Building2} tom={suspensas > 0 ? 'vermelho' : 'neutro'} detalhe="sem acesso a lançamentos" />
        <Kpi titulo="Erros (7d)" valor={erros7} icone={Activity} tom={erros7 > 0 ? 'vermelho' : 'neutro'} detalhe="ocorrências em todas as lojas" />
        <Kpi titulo="Incidentes críticos abertos" valor={criticos} icone={Siren} tom={criticos > 0 ? 'vermelho' : 'neutro'} detalhe="precisam de atenção" />
      </div>

      <div className="mt-6 space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">Empresas</h2>
        {!dados || dados.length === 0 ? (
          <Vazio icone={Building2} titulo="Nenhuma empresa cadastrada ainda." texto="As empresas aparecem aqui assim que forem criadas." />
        ) : (
          <div className="cartao divide-y divide-slate-100 overflow-hidden">
            {dados.map(d => (
              <div key={d.empresa_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{d.nome}</p>
                  <p className="text-xs text-slate-500">{d.segmento} · {d.estado} · erros 7d: {d.erros_7d}</p>
                </div>
                <Link to={`/admin/empresas/${d.empresa_id}`} className="btn btn-secundario px-3 py-1.5 text-xs">Ver detalhe</Link>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link to="/admin/logs" className="btn btn-secundario">Ver todos os logs</Link>
        <Link to="/admin/incidentes" className="btn btn-secundario">Ver incidentes</Link>
        <Link to="/admin/auditoria" className="btn btn-secundario">Auditoria</Link>
      </div>
    </div>
  )
}
