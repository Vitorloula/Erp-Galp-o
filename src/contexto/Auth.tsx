import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { repositorio } from '../lib/dados'
import type { Usuario } from '../lib/tipos'

interface AuthValor {
  usuario: Usuario | null
  pronto: boolean
  admin: boolean
  entrar(email: string, senha: string): Promise<void>
  sair(): Promise<void>
  /** Relê o perfil (ex.: para ver se o administrador já liberou o acesso). */
  atualizar(): Promise<void>
}

const AuthContexto = createContext<AuthValor | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    let ativo = true
    repositorio
      .sessaoAtual()
      .catch(() => null)
      .then(u => {
        if (!ativo) return
        setUsuario(u)
        setPronto(true)
      })
    const parar = repositorio.aoMudarSessao(u => ativo && setUsuario(u))
    return () => {
      ativo = false
      parar()
    }
  }, [])

  const valor: AuthValor = {
    usuario,
    pronto,
    admin: usuario?.papel === 'admin',
    async entrar(email, senha) {
      setUsuario(await repositorio.entrar(email, senha))
    },
    async sair() {
      await repositorio.sair()
      setUsuario(null)
    },
    async atualizar() {
      setUsuario(await repositorio.sessaoAtual())
    },
  }

  return <AuthContexto.Provider value={valor}>{children}</AuthContexto.Provider>
}

export function useAuth() {
  const c = useContext(AuthContexto)
  if (!c) throw new Error('useAuth fora do AuthProvider')
  return c
}
