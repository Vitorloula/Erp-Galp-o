import { BarChart3 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Cabecalho, Carregando, Vazio } from '../components/ui'
import { Link } from 'react-router'
import { useAtiva } from '../contexto/Empresa'
import { whatsapp } from '../lib/dados'
import { formatarReais } from '../pdv/venda'
import type { ResumoUso } from '../lib/dados/whatsapp'

export function WhatsappUso() {
  const { empresa, loja } = useAtiva()
  const [periodo, setPeriodo] = useState(30)
  const [resumo, setResumo] = useState<ResumoUso | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function carregar() {
    setOcupado(true)
    setErro('')
    try {
      const r = await whatsapp.resumoUso(empresa.empresa_id, loja.id, periodo)
      setResumo(r)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  useEffect(() => { carregar() }, [empresa.empresa_id, loja.id, periodo])

  if (!resumo) {
    return ocupado ? <Carregando texto="Carregando métricas..." /> : (erro ? <div className="cartao p-4"><p className="text-sm text-red-700">{erro}</p></div> : null)
  }

  const maxMsg = Math.max(1, ...resumo.dias.map(d => d.in + d.out))

  return (
    <div className="space-y-4">
      <Cabecalho
        titulo="Uso e custo do WhatsApp"
        subtitulo="Mensagens, tokens, custo e pedidos gerados pelo atendimento automático."
        acoes={
          <div className="flex gap-2">
            <Link to="/whatsapp" className="btn btn-fantasma btn-pequeno">Conversas</Link>
            <select className="campo max-w-[140px]" value={periodo} onChange={e => setPeriodo(Number(e.target.value))}>
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={90}>Últimos 90 dias</option>
            </select>
          </div>
        }
      />
      {erro && <div className="cartao p-4"><p className="text-sm text-red-700">{erro}</p></div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi titulo="Mensagens" valor={String(resumo.totais.in + resumo.totais.out)} detalhe={`${resumo.totais.in} recebidas · ${resumo.totais.out} enviadas`} />
        <Kpi titulo="Conversas" valor={String(resumo.totais.conversas)} detalhe={`${resumo.totais.bot} bot · ${resumo.totais.humano} humano · ${resumo.totais.encerrada} encerrada`} />
        <Kpi titulo="Pedidos" valor={String(resumo.totais.pedidos)} detalhe="gerados pelo WhatsApp" />
        <Kpi titulo="Custo estimado" valor={formatarReais(resumo.totais.custo * 5.5)} detalhe={`${resumo.totais.tokens.toLocaleString('pt-BR')} tokens`} />
      </div>

      {/* Gráfico de barras por dia */}
      <div className="cartao p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Mensagens por dia</h2>
        {resumo.dias.every(d => d.in === 0 && d.out === 0) ? (
          <Vazio icone={BarChart3} titulo="Sem mensagens no período" />
        ) : (
          <div className="flex items-end gap-1 h-32">
            {resumo.dias.map(d => {
              const h = Math.round(((d.in + d.out) / maxMsg) * 100)
              return (
                <div key={d.dia} className="flex-1 flex flex-col items-center gap-1" title={`${d.dia}: ${d.in} in / ${d.out} out`}>
                  <div className="w-full bg-slate-100 rounded-t relative" style={{ height: '100%' }}>
                    <div className="absolute bottom-0 left-0 right-0 bg-marca rounded-t" style={{ height: `${h}%` }} />
                  </div>
                  <span className="text-[9px] text-slate-400">{d.dia.slice(8, 10)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Tabela diária */}
      <div className="cartao overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Dia</th>
              <th className="px-3 py-2 text-right">Recebidas</th>
              <th className="px-3 py-2 text-right">Enviadas</th>
              <th className="px-3 py-2 text-right">Tokens</th>
              <th className="px-3 py-2 text-right">Pedidos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {resumo.dias.filter(d => d.in || d.out || d.pedidos).map(d => (
              <tr key={d.dia}>
                <td className="px-3 py-2 text-slate-700">{d.dia}</td>
                <td className="px-3 py-2 text-right tabular-nums">{d.in}</td>
                <td className="px-3 py-2 text-right tabular-nums">{d.out}</td>
                <td className="px-3 py-2 text-right tabular-nums">{d.tokens.toLocaleString('pt-BR')}</td>
                <td className="px-3 py-2 text-right tabular-nums">{d.pedidos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Top perguntas sem resposta */}
      {resumo.topSemResposta.length > 0 && (
        <div className="cartao p-5 space-y-2">
          <h2 className="text-sm font-semibold text-slate-800">Perguntas que o bot não resolveu</h2>
          <p className="text-xs text-slate-500">Mensagens que resultaram em transferência para atendente. Use para melhorar o catálogo ou a política.</p>
          <ul className="space-y-1 text-sm text-slate-700">
            {resumo.topSemResposta.map((t, i) => (
              <li key={i} className="rounded-lg bg-slate-50 px-3 py-2">"{t}"</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Kpi({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe: string }) {
  return (
    <div className="cartao p-4">
      <p className="text-xs font-medium text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{valor}</p>
      <p className="mt-1 text-[11px] text-slate-400">{detalhe}</p>
    </div>
  )
}
