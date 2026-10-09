import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { catalogo, escutarEmpresa, movimentos, type Alteracao } from '../lib/dados'
import { agruparLotes } from '../lib/estoque'
import type { Categoria, Lote, Produto } from '../lib/tipos'
import { useAtiva } from './Empresa'

interface DadosValor {
  produtos: Produto[]
  categorias: Categoria[]
  lotes: Lote[]
  produtoPorId: Map<string, Produto>
  lotePorId: Map<string, Lote>
  lotesPorProduto: Map<string, Lote[]>
  nomeCategoria(id: string | null): string
  carregando: boolean
  erro: string | null
  /** Incrementa a cada atualização — telas de histórico usam para recarregar. */
  versao: number
  /** Recarrega e devolve o catálogo novo (quando recarregou o catálogo). */
  recarregar(oque?: Alteracao): Promise<Produto[] | null>
}

const DadosContexto = createContext<DadosValor | null>(null)

/**
 * Catálogo da empresa e saldos da loja ativa, sempre atualizados: carrega ao abrir,
 * escuta alterações em tempo real (outros aparelhos) e recarrega ao voltar para o app.
 */
export function DadosProvider({ children }: { children: ReactNode }) {
  const { empresa, loja } = useAtiva()
  const empresaId = empresa.empresa_id
  const lojaId = loja.id
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const pedido = useRef({ catalogo: 0, estoque: 0 })

  const recarregar = useCallback(
    async (oque?: Alteracao): Promise<Produto[] | null> => {
      const partes: Alteracao[] = oque ? [oque] : ['catalogo', 'estoque']
      const meus = partes.map(p => [p, ++pedido.current[p]] as const)
      const atual = () => meus.every(([p, n]) => pedido.current[p] === n) // uma recarga mais nova já está a caminho
      try {
        const [cat, est] = await Promise.all([
          partes.includes('catalogo') ? Promise.all([catalogo.listarProdutos(empresaId), catalogo.listarCategorias(empresaId)]) : null,
          partes.includes('estoque') ? movimentos.listarSaldos(empresaId, lojaId) : null,
        ])
        if (!atual()) return null
        if (cat) {
          setProdutos(cat[0])
          setCategorias(cat[1])
        }
        if (est) setLotes(est)
        setErro(null)
        setVersao(v => v + 1)
        return cat?.[0] ?? null
      } catch (e) {
        if (atual()) setErro((e as Error).message)
        return null
      } finally {
        if (atual()) setCarregando(false)
      }
    },
    [empresaId, lojaId],
  )

  useEffect(() => {
    recarregar()
    const pendentes = new Set<Alteracao>()
    let espera: ReturnType<typeof setTimeout> | undefined
    const agendar = (oque?: Alteracao) => {
      if (oque) pendentes.add(oque)
      else pendentes.add('catalogo').add('estoque')
      clearTimeout(espera)
      espera = setTimeout(() => {
        const lista = [...pendentes]
        pendentes.clear()
        recarregar(lista.length === 1 ? lista[0] : undefined)
      }, 250)
    }
    const parar = escutarEmpresa(empresaId, agendar)
    const aoVoltar = () => document.visibilityState === 'visible' && agendar()
    const aoReconectar = () => agendar()
    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('online', aoReconectar)
    return () => {
      clearTimeout(espera)
      parar()
      document.removeEventListener('visibilitychange', aoVoltar)
      window.removeEventListener('online', aoReconectar)
    }
  }, [recarregar, empresaId])

  const valor = useMemo<DadosValor>(() => {
    const nomes = new Map(categorias.map(c => [c.id, c.nome]))
    return {
      produtos,
      categorias,
      lotes,
      produtoPorId: new Map(produtos.map(p => [p.id, p])),
      lotePorId: new Map(lotes.map(l => [l.lote_id, l])),
      lotesPorProduto: agruparLotes(lotes),
      nomeCategoria: id => (id && nomes.get(id)) || 'Sem categoria',
      carregando,
      erro,
      versao,
      recarregar,
    }
  }, [produtos, categorias, lotes, carregando, erro, versao, recarregar])

  return <DadosContexto.Provider value={valor}>{children}</DadosContexto.Provider>
}

export function useDados() {
  const c = useContext(DadosContexto)
  if (!c) throw new Error('useDados fora do DadosProvider')
  return c
}
