import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { sessao, veioDaRecuperacaoDeSenha } from '../lib/dados'
import type { Perfil } from '../lib/tipos'

interface AuthValor {
  usuario: Perfil | null
  pronto: boolean
  /** Entrou pelo link de "esqueci minha senha": precisa definir a nova senha. */
  definindoSenha: boolean
  entrar(email: string, senha: string): Promise<void>
  sair(): Promise<void>
  senhaDefinida(): void
  atualizarUsuario(p: Perfil): void
}

const AuthContexto = createContext<AuthValor | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Perfil | null>(null)
  const [pronto, setPronto] = useState(false)
  const [definindoSenha, setDefinindoSenha] = useState(veioDaRecuperacaoDeSenha)

  useEffect(() => {
    let ativo = true
    sessao
      .sessaoAtual(p => ativo && setUsuario(p))
      .catch(() => null)
      .then(u => {
        if (!ativo) return
        setUsuario(u)
        setPronto(true)
      })
    const parar = sessao.aoMudarSessao(u => ativo && setUsuario(u))
    return () => {
      ativo = false
      parar()
    }
  }, [])

  const valor: AuthValor = {
    usuario,
    pronto,
    definindoSenha: definindoSenha && !!usuario,
    async entrar(email, senha) {
      setUsuario(await sessao.entrar(email, senha))
    },
    async sair() {
      await sessao.sair()
      setUsuario(null)
      setDefinindoSenha(false)
    },
    senhaDefinida() {
      setDefinindoSenha(false)
    },
    atualizarUsuario: setUsuario,
  }

  return <AuthContexto.Provider value={valor}>{children}</AuthContexto.Provider>
}

export function useAuth() {
  const c = useContext(AuthContexto)
  if (!c) throw new Error('useAuth fora do AuthProvider')
  return c
}
