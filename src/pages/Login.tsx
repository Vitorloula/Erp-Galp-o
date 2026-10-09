import { CircleCheck, LoaderCircle, Lock, Mail, User } from 'lucide-react'
import { useState } from 'react'
import { Marca } from '../components/Layout'
import { Aviso, Segmentado } from '../components/ui'
import { useAuth } from '../contexto/Auth'
import { repositorio } from '../lib/dados'

export function Login() {
  const { entrar } = useAuth()
  const [modo, setModo] = useState<'entrar' | 'solicitar'>('entrar')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [confirmarEmail, setConfirmarEmail] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      if (modo === 'entrar') {
        await entrar(email, senha)
      } else {
        if (!nome.trim()) throw new Error('Informe seu nome.')
        const r = await repositorio.solicitarAcesso(nome, email, senha)
        if (r.confirmarEmail) setConfirmarEmail(true)
        else await entrar(email, senha)
      }
    } catch (er) {
      setErro((er as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-700 px-4">
      <div className="m-auto w-full max-w-sm py-10">
        <div className="mb-8 flex justify-center">
          <Marca claro />
        </div>
        {confirmarEmail ? (
          <div className="space-y-3 rounded-3xl bg-white p-6 text-center shadow-2xl">
            <CircleCheck className="mx-auto size-10 text-emerald-600" />
            <h1 className="text-lg font-bold text-slate-900">Confirme seu e-mail</h1>
            <p className="text-sm text-slate-600">
              Enviamos um link para <strong>{email}</strong>. Depois de confirmar, entre com sua senha e aguarde o administrador liberar seu acesso.
            </p>
            <button className="btn btn-secundario w-full" onClick={() => { setConfirmarEmail(false); setModo('entrar') }}>
              Voltar para entrar
            </button>
          </div>
        ) : (
          <form onSubmit={enviar} className="space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
            <Segmentado
              valor={modo}
              aoMudar={m => { setModo(m); setErro('') }}
              opcoes={[
                { valor: 'entrar', rotulo: 'Entrar' },
                { valor: 'solicitar', rotulo: 'Solicitar acesso' },
              ]}
            />
            <p className="text-sm text-slate-500">
              {modo === 'entrar'
                ? 'Você só precisa entrar uma vez neste aparelho.'
                : 'Crie sua conta. O administrador libera o acesso antes do primeiro uso.'}
            </p>
            {erro && <Aviso tom="erro">{erro}</Aviso>}
            {modo === 'solicitar' && (
              <div>
                <label className="rotulo" htmlFor="nome">Seu nome</label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-slate-400" />
                  <input id="nome" autoComplete="name" className="campo pl-10" value={nome} onChange={e => setNome(e.target.value)} required />
                </div>
              </div>
            )}
            <div>
              <label className="rotulo" htmlFor="email">E-mail</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-slate-400" />
                <input id="email" type="email" autoComplete="username" className="campo pl-10" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
            </div>
            <div>
              <label className="rotulo" htmlFor="senha">Senha</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-slate-400" />
                <input
                  id="senha"
                  type="password"
                  autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
                  minLength={modo === 'solicitar' ? 6 : undefined}
                  className="campo pl-10"
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  required
                />
              </div>
            </div>
            <button className="btn btn-primario btn-grande w-full" disabled={enviando}>
              {enviando && <LoaderCircle className="size-5 animate-spin" />}
              {modo === 'entrar' ? (enviando ? 'Entrando...' : 'Entrar') : enviando ? 'Enviando...' : 'Criar conta'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export function AguardandoLiberacao() {
  const { usuario, atualizar, sair } = useAuth()
  const [verificando, setVerificando] = useState(false)
  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-700 px-4">
      <div className="m-auto w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 text-center shadow-2xl">
        <Lock className="mx-auto size-10 text-amber-500" />
        <h1 className="text-lg font-bold text-slate-900">Aguardando liberação</h1>
        <p className="text-sm text-slate-600">
          Olá, <strong>{usuario?.nome}</strong>. Sua conta foi criada, mas o administrador ainda precisa liberar o seu acesso ao estoque.
        </p>
        <button
          className="btn btn-primario w-full"
          disabled={verificando}
          onClick={async () => {
            setVerificando(true)
            await atualizar().finally(() => setVerificando(false))
          }}
        >
          {verificando && <LoaderCircle className="size-4.5 animate-spin" />} Já fui liberado
        </button>
        <button className="btn btn-fantasma w-full" onClick={sair}>Sair</button>
      </div>
    </div>
  )
}
