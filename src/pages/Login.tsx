import { CircleCheck, KeyRound, LoaderCircle, Lock, Mail, MailOpen, User } from 'lucide-react'
import { useState } from 'react'
import { conviteGuardado, useInfoConvite } from '../components/Convite'
import { TelaCheia } from '../components/TelaCheia'
import { useToast } from '../components/Toast'
import { Aviso, Segmentado } from '../components/ui'
import { useAuth } from '../contexto/Auth'
import { sessao } from '../lib/dados'
import { NOME_PAPEL } from '../lib/permissoes'

type Modo = 'entrar' | 'criar' | 'recuperar'

export function Login() {
  const { entrar } = useAuth()
  const [modo, setModo] = useState<Modo>('entrar')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState<'confirmacao' | 'recuperacao' | null>(null)
  const convite = useInfoConvite(conviteGuardado())

  function mudar(m: Modo) {
    setModo(m)
    setErro('')
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      if (modo === 'entrar') await entrar(email, senha)
      else if (modo === 'recuperar') {
        await sessao.enviarLinkNovaSenha(email)
        setEnviado('recuperacao')
      } else {
        if (!nome.trim()) throw new Error('Informe seu nome.')
        const r = await sessao.criarConta(nome, email, senha)
        if (r.confirmarEmail) setEnviado('confirmacao')
        else await entrar(email, senha)
      }
    } catch (er) {
      setErro((er as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  if (enviado)
    return (
      <TelaCheia>
        <div className="space-y-3 text-center">
          <CircleCheck className="mx-auto size-10 text-emerald-600" />
          <h1 className="text-lg font-bold text-slate-900">{enviado === 'confirmacao' ? 'Confirme seu e-mail' : 'Verifique seu e-mail'}</h1>
          <p className="text-sm text-slate-600">
            {enviado === 'confirmacao' ? (
              <>Enviamos um link para <strong>{email}</strong>. Depois de confirmar, você já entra no sistema.</>
            ) : (
              <>Se <strong>{email}</strong> tiver cadastro, enviamos um link para criar uma nova senha.</>
            )}
          </p>
          <button className="btn btn-secundario w-full" onClick={() => { setEnviado(null); mudar('entrar') }}>
            Voltar para entrar
          </button>
        </div>
      </TelaCheia>
    )

  return (
    <TelaCheia>
      <form onSubmit={enviar} className="space-y-4">
        {convite?.situacao === 'valido' && (
          <div className="flex gap-2.5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
            <MailOpen className="mt-0.5 size-4.5 shrink-0" />
            <p>
              Você foi convidado para <strong>{convite.empresa}</strong> como {NOME_PAPEL[convite.papel]}. Entre ou crie sua conta para aceitar.
            </p>
          </div>
        )}
        {modo === 'recuperar' ? (
          <div>
            <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900"><KeyRound className="size-5 text-marca" /> Esqueci minha senha</h1>
            <p className="mt-1 text-sm text-slate-500">Informe seu e-mail para receber o link de uma nova senha.</p>
          </div>
        ) : (
          <>
            <Segmentado
              valor={modo}
              aoMudar={mudar}
              opcoes={[
                { valor: 'entrar', rotulo: 'Entrar' },
                { valor: 'criar', rotulo: 'Criar conta' },
              ]}
            />
            <p className="text-sm text-slate-500">
              {modo === 'entrar' ? 'Você só precisa entrar uma vez neste aparelho.' : 'Crie sua conta para cadastrar sua empresa ou aceitar um convite.'}
            </p>
          </>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {modo === 'criar' && (
          <Campo id="nome" rotulo="Seu nome" icone={User}>
            <input id="nome" autoComplete="name" className="campo pl-10" value={nome} onChange={e => setNome(e.target.value)} required />
          </Campo>
        )}
        <Campo id="email" rotulo="E-mail" icone={Mail}>
          <input id="email" type="email" autoComplete="username" className="campo pl-10" value={email} onChange={e => setEmail(e.target.value)} required />
        </Campo>
        {modo !== 'recuperar' && (
          <Campo id="senha" rotulo="Senha" icone={Lock}>
            <input
              id="senha"
              type="password"
              autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
              minLength={modo === 'criar' ? 6 : undefined}
              className="campo pl-10"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              required
            />
          </Campo>
        )}
        <button className="btn btn-primario btn-grande w-full" disabled={enviando}>
          {enviando && <LoaderCircle className="size-5 animate-spin" />}
          {modo === 'entrar' ? (enviando ? 'Entrando...' : 'Entrar') : modo === 'criar' ? (enviando ? 'Criando...' : 'Criar conta') : 'Enviar link'}
        </button>
        {modo === 'entrar' && (
          <button type="button" className="w-full text-center text-sm font-medium text-marca-escura hover:underline" onClick={() => mudar('recuperar')}>
            Esqueci minha senha
          </button>
        )}
        {modo === 'recuperar' && (
          <button type="button" className="btn btn-fantasma w-full" onClick={() => mudar('entrar')}>
            Voltar
          </button>
        )}
      </form>
      <p className="mt-4 text-center text-xs text-slate-500">
        Ao entrar, você concorda com os{' '}
        <a className="font-medium underline hover:text-marca-escura" href="/termos.html" target="_blank" rel="noreferrer">Termos de Uso</a>
        {' '}e a{' '}
        <a className="font-medium underline hover:text-marca-escura" href="/privacidade.html" target="_blank" rel="noreferrer">Política de Privacidade</a>.
      </p>
    </TelaCheia>
  )
}

function Campo({ id, rotulo, icone: Icone, children }: { id: string; rotulo: string; icone: typeof Mail; children: React.ReactNode }) {
  return (
    <div>
      <label className="rotulo" htmlFor={id}>{rotulo}</label>
      <div className="relative">
        <Icone className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-slate-400" />
        {children}
      </div>
    </div>
  )
}

/** Aberta pelo link de "esqueci minha senha": a pessoa já está logada e define a nova senha. */
export function NovaSenha() {
  const { usuario, senhaDefinida, sair } = useAuth()
  const toast = useToast()
  const [senha, setSenha] = useState('')
  const [repetir, setRepetir] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (senha !== repetir) return setErro('As senhas não conferem.')
    setSalvando(true)
    try {
      await sessao.definirSenha(senha)
      toast.sucesso('Senha alterada.')
      senhaDefinida()
    } catch (er) {
      setErro((er as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <TelaCheia>
      <form onSubmit={salvar} className="space-y-4">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900"><KeyRound className="size-5 text-marca" /> Nova senha</h1>
          <p className="mt-1 text-sm text-slate-500">Olá, {usuario?.nome}. Escolha a nova senha de acesso.</p>
        </div>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <Campo id="nova-senha" rotulo="Nova senha" icone={Lock}>
          <input id="nova-senha" type="password" autoComplete="new-password" minLength={6} className="campo pl-10" value={senha} onChange={e => setSenha(e.target.value)} required />
        </Campo>
        <Campo id="repetir-senha" rotulo="Repita a nova senha" icone={Lock}>
          <input id="repetir-senha" type="password" autoComplete="new-password" minLength={6} className="campo pl-10" value={repetir} onChange={e => setRepetir(e.target.value)} required />
        </Campo>
        <button className="btn btn-primario btn-grande w-full" disabled={salvando}>
          {salvando && <LoaderCircle className="size-5 animate-spin" />} Salvar nova senha
        </button>
        <button type="button" className="btn btn-fantasma w-full" onClick={sair}>Cancelar e sair</button>
      </form>
    </TelaCheia>
  )
}
