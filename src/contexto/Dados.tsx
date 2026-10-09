import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { repositorio } from '../lib/dados'
import { agruparLotes } from '../lib/estoque'
import type { Lote, Produto } from '../lib/tipos'

interface DadosValor {
  produtos: Produto[]
  lotes: Lote[]
  produtoPorId: Map<string, Produto>
  lotePorId: Map<string, Lote>
  lotesPorProduto: Map<string, Lote[]>
  carregando: boolean
  erro: string | null
  /** Incrementa a cada atualização — telas de histórico usam para recarregar. */
  versao: number
  recarregar(): Promise<void>
}

const DadosContexto = createContext<DadosValor | null>(null)

/**
 * Mantém produtos e saldos sempre atualizados: carrega ao abrir, escuta alterações
 * em tempo real (outros celulares/computadores) e recarrega ao voltar para o app.
 */
export function DadosProvider({ children }: { children: ReactNode }) {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const pedido = useRef(0)

  const recarregar = useCallback(async () => {
    const meu = ++pedido.current
    try {
      const [p, l] = await Promise.all([repositorio.listarProdutos(), repositorio.listarLotes()])
      if (meu !== pedido.current) return // uma recarga mais nova já está a caminho
      setProdutos(p)
      setLotes(l)
      setErro(null)
      setVersao(v => v + 1)
    } catch (e) {
      if (meu === pedido.current) setErro((e as Error).message)
    } finally {
      if (meu === pedido.current) setCarregando(false)
    }
  }, [])

  useEffect(() => {
    recarregar()
    let espera: ReturnType<typeof setTimeout> | undefined
    const agendar = () => {
      clearTimeout(espera)
      espera = setTimeout(recarregar, 250)
    }
    const parar = repositorio.escutarAlteracoes(agendar)
    const aoVoltar = () => document.visibilityState === 'visible' && agendar()
    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('online', agendar)
    return () => {
      clearTimeout(espera)
      parar()
      document.removeEventListener('visibilitychange', aoVoltar)
      window.removeEventListener('online', agendar)
    }
  }, [recarregar])

  const valor = useMemo<DadosValor>(
    () => ({
      produtos,
      lotes,
      produtoPorId: new Map(produtos.map(p => [p.id, p])),
      lotePorId: new Map(lotes.map(l => [l.lote_id, l])),
      lotesPorProduto: agruparLotes(lotes),
      carregando,
      erro,
      versao,
      recarregar,
    }),
    [produtos, lotes, carregando, erro, versao, recarregar],
  )

  return <DadosContexto.Provider value={valor}>{children}</DadosContexto.Provider>
}

export function useDados() {
  const c = useContext(DadosContexto)
  if (!c) throw new Error('useDados fora do DadosProvider')
  return c
}
