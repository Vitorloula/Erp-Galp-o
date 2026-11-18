import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Cabecalho, Carregando } from '../../components/ui'
import { adminVerEmpresa } from '../../lib/admin/cliente'
import { formatarDataHora } from '../../lib/formato'

export function AdminEmpresa() {
  const { id } = useParams() as { id: string }
  const [dados, setDados] = useState<Record<string, unknown> | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    adminVerEmpresa(id).then(setDados).catch(e => setErro((e as Error).message))
  }, [id])

  if (erro) return <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">{erro}</div>
  if (!dados) return <Carregando />

  const empresa = dados.empresa as any
  const assinatura = dados.assinatura as any
  const lojas = (dados.lojas as any[]) ?? []
  const membros = (dados.membros as any[]) ?? []
  const convites = (dados.convites as any[]) ?? []
  const erros = (dados.erros as any[]) ?? []
  const movimentacoes = (dados.movimentacoes as any[]) ?? []
  const vendas = (dados.vendas as any[]) ?? []

  return (
    <div className="space-y-4">
      <Cabecalho titulo={empresa?.nome ?? 'Empresa'} subtitulo={empresa?.segmento ? `${empresa.segmento} · ${empresa.estado ?? ''}` : 'Detalhe da empresa'} acoes={<Link to="/admin" className="btn btn-fantasma">Voltar</Link>} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Assinatura */}
        <div className="cartao p-4">
          <h2 className="text-sm font-semibold text-ponto">Assinatura</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd className="font-medium">{assinatura?.status ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Plano</dt><dd className="font-medium">{assinatura?.plano_id ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Trial até</dt><dd>{assinatura?.trial_ate ? formatarDataHora(assinatura.trial_ate) : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Pago até</dt><dd>{assinatura?.pago_ate ? formatarDataHora(assinatura.pago_ate) : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Criada em</dt><dd>{empresa?.criado_em ? formatarDataHora(empresa.criado_em) : '—'}</dd></div>
          </dl>
        </div>

        {/* Lojas */}
        <div className="cartao p-4">
          <h2 className="text-sm font-semibold text-ponto">Lojas ({lojas.length})</h2>
          {lojas.length === 0 ? <p className="mt-2 text-sm text-slate-500">Nenhuma loja.</p> : (
            <ul className="mt-2 space-y-1 text-sm">
              {lojas.map((l: any) => <li key={l.id} className="flex justify-between"><span>{l.nome}</span><span className="text-slate-500">{l.ativo ? 'ativa' : 'inativa'}</span></li>)}
            </ul>
          )}
        </div>
      </div>

      {/* Equipe */}
      <div className="cartao p-4">
        <h2 className="text-sm font-semibold text-ponto">Equipe ({membros.length})</h2>
        {membros.length === 0 ? <p className="mt-2 text-sm text-slate-500">Nenhum membro.</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-2">Nome</th><th className="px-3 py-2">E-mail</th><th className="px-3 py-2">Papel</th><th className="px-3 py-2">Ativo</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {membros.map((m: any, i: number) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-medium">{m.nome ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{m.email ?? '—'}</td>
                    <td className="px-3 py-2">{m.papel}</td>
                    <td className="px-3 py-2">{m.ativo ? 'sim' : 'não'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Convites */}
      {convites.length > 0 && (
        <div className="cartao p-4">
          <h2 className="text-sm font-semibold text-ponto">Convites ({convites.length})</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-2">E-mail</th><th className="px-3 py-2">Papel</th><th className="px-3 py-2">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {convites.map((c: any, i: number) => (
                  <tr key={i}>
                    <td className="px-3 py-2">{c.email ?? '—'}</td>
                    <td className="px-3 py-2">{c.papel ?? '—'}</td>
                    <td className="px-3 py-2">{c.usado_em ? 'aceito' : 'pendente'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Erros recentes */}
      <div className="cartao p-4">
        <h2 className="text-sm font-semibold text-ponto">Erros recentes ({erros.length})</h2>
        {erros.length === 0 ? <p className="mt-2 text-sm text-slate-500">Nenhum erro.</p> : (
          <div className="mt-2 space-y-2">
            {erros.slice(0, 10).map((e: any, i: number) => (
              <div key={i} className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="font-mono text-xs text-slate-500">{e.criado_em}</p>
                <p className="mt-1 text-slate-700 line-clamp-2">{e.mensagem}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Movimentações recentes */}
      <div className="cartao p-4">
        <h2 className="text-sm font-semibold text-ponto">Movimentações recentes ({movimentacoes.length})</h2>
        {movimentacoes.length === 0 ? <p className="mt-2 text-sm text-slate-500">Nenhuma movimentação.</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-2">Data</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Produto</th><th className="px-3 py-2 text-right">Qtd</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movimentacoes.slice(0, 10).map((m: any, i: number) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-slate-600">{m.registrado_em ? formatarDataHora(m.registrado_em) : '—'}</td>
                    <td className="px-3 py-2">{m.tipo}</td>
                    <td className="px-3 py-2 font-medium">{m.produto_id ? '—' : '—'}</td>
                    <td className="px-3 py-2 text-right">{m.quantidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Vendas recentes */}
      <div className="cartao p-4">
        <h2 className="text-sm font-semibold text-ponto">Vendas recentes ({vendas.length})</h2>
        {vendas.length === 0 ? <p className="mt-2 text-sm text-slate-500">Nenhuma venda.</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-2">Data</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vendas.map((v: any, i: number) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-slate-600">{v.ocorrido_em ? formatarDataHora(v.ocorrido_em) : '—'}</td>
                    <td className="px-3 py-2 text-right font-medium">{v.total}</td>
                    <td className="px-3 py-2">{v.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}