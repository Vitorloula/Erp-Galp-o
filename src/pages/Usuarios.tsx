import { ShieldCheck, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router'
import { useToast } from '../components/Toast'
import { Aviso, Cabecalho, Carregando, Vazio, cx } from '../components/ui'
import { useAuth } from '../contexto/Auth'
import { repositorio } from '../lib/dados'
import { formatarData } from '../lib/formato'
import type { Papel, Usuario } from '../lib/tipos'

const PAPEIS: { valor: Papel; nome: string; descricao: string }[] = [
  { valor: 'pendente', nome: 'Sem acesso', descricao: 'Não vê nem altera nada' },
  { valor: 'operador', nome: 'Operador', descricao: 'Consulta, cadastra produtos e lança movimentações' },
  { valor: 'admin', nome: 'Administrador', descricao: 'Tudo do operador + edita cadastros e libera usuários' },
]

export function Usuarios() {
  const { usuario, admin } = useAuth()
  const toast = useToast()
  const [lista, setLista] = useState<Usuario[] | null>(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(() => {
    repositorio.listarUsuarios().then(setLista).catch(e => setErro((e as Error).message))
  }, [])
  useEffect(carregar, [carregar])

  if (!admin) return <Navigate to="/painel" replace />

  async function mudar(u: Usuario, papel: Papel) {
    try {
      await repositorio.alterarPapel(u.id, papel)
      toast.sucesso(`${u.nome}: ${PAPEIS.find(p => p.valor === papel)!.nome}.`)
      carregar()
    } catch (e) {
      toast.erro((e as Error).message)
    }
  }

  const pendentes = (lista ?? []).filter(u => u.papel === 'pendente').length

  return (
    <div className="mx-auto max-w-3xl">
      <Cabecalho titulo="Usuários" subtitulo="Libere o acesso da equipe e defina quem é administrador." />
      {pendentes > 0 && (
        <div className="mb-4">
          <Aviso tom="alerta">
            <strong>{pendentes}</strong> pessoa(s) aguardando liberação.
          </Aviso>
        </div>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!lista && !erro ? (
        <Carregando />
      ) : lista && lista.length === 0 ? (
        <div className="cartao"><Vazio icone={Users} titulo="Nenhum usuário" /></div>
      ) : (
        <div className="cartao divide-y divide-slate-100 overflow-hidden">
          {[...(lista ?? [])]
            .sort((a, b) => Number(b.papel === 'pendente') - Number(a.papel === 'pendente'))
            .map(u => {
              const eu = u.id === usuario?.id
              return (
                <div key={u.id} className={cx('flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center', u.papel === 'pendente' && 'bg-amber-50')}>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className={cx('grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold', u.papel === 'admin' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600')}>
                      {u.papel === 'admin' ? <ShieldCheck className="size-5" /> : u.nome.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">
                        {u.nome} {eu && <span className="text-xs font-normal text-slate-500">(você)</span>}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {u.email}
                        {u.criado_em && ` · desde ${formatarData(u.criado_em)}`}
                      </p>
                    </div>
                  </div>
                  <select
                    className="campo sm:w-48"
                    value={u.papel}
                    disabled={eu}
                    title={eu ? 'Ninguém altera o próprio acesso' : PAPEIS.find(p => p.valor === u.papel)?.descricao}
                    onChange={e => mudar(u, e.target.value as Papel)}
                    aria-label={`Acesso de ${u.nome}`}
                  >
                    {PAPEIS.map(p => <option key={p.valor} value={p.valor}>{p.nome}</option>)}
                  </select>
                </div>
              )
            })}
        </div>
      )}
      <div className="mt-4 space-y-1 text-xs text-slate-500">
        {PAPEIS.map(p => (
          <p key={p.valor}><strong className="text-slate-700">{p.nome}:</strong> {p.descricao}.</p>
        ))}
      </div>
    </div>
  )
}
