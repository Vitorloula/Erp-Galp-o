import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Cabecalho, Carregando } from '../../components/ui'
import { adminVerEmpresa } from '../../lib/admin/cliente'

export function AdminEmpresa() {
  const { id } = useParams()
  const [dados, setDados] = useState<Record<string, unknown> | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    if (!id) return
    adminVerEmpresa(id).then(setDados).catch(e => setErro((e as Error).message))
  }, [id])
  if (erro) return <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">{erro}</div>
  if (!dados) return <Carregando />
  return (
    <div>
      <Cabecalho titulo={String((dados.empresa as any)?.nome ?? 'Empresa')} subtitulo="Detalhe da empresa" acoes={<Link to="/admin" className="btn btn-fantasma">Voltar</Link>} />
      <pre className="cartao overflow-auto p-4 text-xs">{JSON.stringify(dados, null, 2)}</pre>
    </div>
  )
}
