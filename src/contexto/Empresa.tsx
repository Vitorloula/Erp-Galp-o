import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { empresas } from '../lib/dados'
import { memoria } from '../lib/dados/cliente'
import { permissoes, type Permissoes } from '../lib/permissoes'
import type { Loja, Vinculo } from '../lib/tipos'
import { useAuth } from './Auth'

interface EmpresaValor {
  /** null enquanto carrega pela primeira vez. */
  vinculos: Vinculo[] | null
  erro: string | null
  /** Empresa ativa (null quando o usuário ainda não tem nenhuma). */
  empresa: Vinculo | null
  /** Lojas ativas que o usuário pode acessar na empresa ativa. */
  lojas: Loja[] | null
  loja: Loja | null
  pode: Permissoes
  trocarEmpresa(id: string): void
  trocarLoja(id: string): void
  /** Relê empresas e lojas (após criar empresa, aceitar convite, mudar plano...). Opcionalmente ativa uma empresa. */
  recarregar(ativar?: string): Promise<void>
}

const EmpresaContexto = createContext<EmpresaValor | null>(null)

const SEM_PERMISSAO: Permissoes = permissoes('caixa', 'suspensa')

export function EmpresaProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth()
  const uid = usuario!.id
  const chaveAtiva = `galpao-empresa-ativa-${uid}`
  const [vinculos, setVinculos] = useState<Vinculo[] | null>(() => empresas.empresasSalvas(uid))
  const [erro, setErro] = useState<string | null>(null)
  const [ativaId, setAtivaId] = useState<string | null>(() => memoria.ler<string>(chaveAtiva))
  const [lojas, setLojas] = useState<Loja[] | null>(null)
  const [lojaId, setLojaId] = useState<string | null>(null)
  const [versaoLojas, setVersaoLojas] = useState(0)

  const recarregar = useCallback(
    async (ativar?: string) => {
      try {
        const lista = await empresas.minhasEmpresas(uid)
        setVinculos(lista)
        setVersaoLojas(v => v + 1)
        setErro(null)
        if (ativar) {
          setAtivaId(ativar)
          memoria.gravar(chaveAtiva, ativar)
        }
      } catch (e) {
        setErro((e as Error).message)
        setVinculos(v => v ?? [])
      }
    },
    [uid, chaveAtiva],
  )

  useEffect(() => {
    recarregar()
  }, [recarregar])

  const empresa = vinculos?.find(v => v.empresa_id === ativaId) ?? vinculos?.[0] ?? null
  const empresaId = empresa?.empresa_id ?? null
  const lojasPermitidas = empresa?.lojas?.join(',') ?? ''

  // Lojas da empresa ativa (com cópia no aparelho para abrir sem internet).
  useEffect(() => {
    if (!empresaId) return
    let ativo = true
    const chave = `galpao-lojas-${empresaId}`
    const filtrar = (todas: Loja[]) => todas.filter(l => l.ativo && (!lojasPermitidas || lojasPermitidas.split(',').includes(l.id)))
    const salvas = memoria.ler<Loja[]>(chave)
    setLojas(salvas ? filtrar(salvas) : null)
    setLojaId(memoria.ler<string>(`galpao-loja-${empresaId}`))
    empresas.listarLojas(empresaId).then(
      todas => {
        if (!ativo) return
        memoria.gravar(chave, todas)
        setLojas(filtrar(todas))
      },
      e => ativo && !salvas && (setErro((e as Error).message), setLojas([])),
    )
    return () => {
      ativo = false
    }
  }, [empresaId, lojasPermitidas, versaoLojas])

  const loja = lojas?.find(l => l.id === lojaId) ?? lojas?.[0] ?? null

  const trocarEmpresa = useCallback(
    (id: string) => {
      setAtivaId(id)
      memoria.gravar(chaveAtiva, id)
    },
    [chaveAtiva],
  )

  const trocarLoja = useCallback(
    (id: string) => {
      if (!empresaId) return
      setLojaId(id)
      memoria.gravar(`galpao-loja-${empresaId}`, id)
    },
    [empresaId],
  )

  const valor = useMemo<EmpresaValor>(
    () => ({
      vinculos,
      erro,
      empresa,
      lojas,
      loja,
      pode: empresa ? permissoes(empresa.papel, empresa.estado) : SEM_PERMISSAO,
      trocarEmpresa,
      trocarLoja,
      recarregar,
    }),
    [vinculos, erro, empresa, lojas, loja, trocarEmpresa, trocarLoja, recarregar],
  )

  return <EmpresaContexto.Provider value={valor}>{children}</EmpresaContexto.Provider>
}

export function useEmpresa() {
  const c = useContext(EmpresaContexto)
  if (!c) throw new Error('useEmpresa fora do EmpresaProvider')
  return c
}

/** Empresa e loja ativas, garantidas (para telas que só aparecem depois da escolha). */
export function useAtiva() {
  const c = useEmpresa()
  if (!c.empresa || !c.loja) throw new Error('useAtiva sem empresa/loja ativa')
  return { ...c, empresa: c.empresa, loja: c.loja }
}
