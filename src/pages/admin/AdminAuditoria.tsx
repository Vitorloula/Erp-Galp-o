import { useEffect, useState } from 'react'
import { Cabecalho, Carregando } from '../../components/ui'
import { adminAuditoriaListar } from '../../lib/admin/cliente'

export function AdminAuditoria() {
  const [linhas, setLinhas] = useState<Awaited<ReturnType<typeof adminAuditoriaListar>>>([])
  const [carregando, setCarregando] = useState(true)
  useEffect(() => {
    adminAuditoriaListar({ limite: 200 }).then(setLinhas).finally(() => setCarregando(false))
  }, [])
  if (carregando) return <Carregando />
  return (
    <div>
      <Cabecalho titulo="Auditoria" subtitulo="Quem acessou o quê, quando." />
      <div className="cartao divide-y divide-slate-100 overflow-hidden">
        {linhas.map(l => (
          <div key={l.id} className="px-4 py-3 text-sm">
            <span className="font-mono text-xs text-slate-500">{l.criado_em}</span> · {l.acao} · {l.alvo} · {l.admin_id}
          </div>
        ))}
        {linhas.length === 0 && <div className="px-4 py-6 text-sm text-slate-500">Nenhuma entrada de auditoria.</div>}
      </div>
    </div>
  )
}
