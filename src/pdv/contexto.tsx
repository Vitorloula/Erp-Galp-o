import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAtiva } from '../contexto/Empresa'
import { sb } from '../lib/dados/cliente'
import { canonizarCodigo } from '../lib/formato'
import { lerCodigo } from '../lib/gs1'
import { lerEtiquetaBalanca, mesmoPlu, type ConfigBalanca } from './balanca'
import { bancoDaLoja, dispositivoId, type BancoPdv, type ProdutoLocal, type VendaLocal } from './local'
import { Sincronizador, type EstadoSync, type Licenca } from './sincronizador'

/** Caixa ligado a este aparelho (pdv_assumir_caixa). */
export interface CaixaLocal {
  caixa_id: string
  numero: number
  nome: string
}

export interface SessaoLocal {
  id: string
  aberta_em: string
  valor_abertura: number
}

export interface MovimentoLocal {
  id: string
  tipo: 'sangria' | 'suprimento'
  valor: number
  motivo: string
  ocorrido_em: string
}

export interface Leitura {
  produto: ProdutoLocal
  quantidade: number
  /** Preço unitário em centavos quando a etiqueta de balança define o total. */
  precoUnitario?: number
  codigoLido: string
}

/** Licença guardada no aparelho vale por 7 dias sem internet. */
const VALIDADE_LICENCA_MS = 7 * 86_400_000

interface PdvValor {
  banco: BancoPdv
  sinc: Sincronizador
  sync: EstadoSync
  pronto: boolean
  /** Outra aba deste aparelho já está com o caixa aberto. */
  bloqueadoPorOutraAba: boolean
  caixa: CaixaLocal | null
  sessao: SessaoLocal | null
  licenca: Licenca | null
  /** Pode abrir uma sessão nova? (assinatura e licença) */
  podeAbrir: { ok: boolean; motivo?: string }
  temCatalogo: boolean
  definirCaixa(c: CaixaLocal, ultimoNumero: number): Promise<void>
  /** Desliga este aparelho do caixa (só sem sessão aberta). */
  esquecerCaixa(): Promise<void>
  definirSessao(s: SessaoLocal | null): Promise<void>
  proximoNumero(): Promise<number>
  identificar(texto: string, quantidade: number): Promise<Leitura | null>
  buscarPorNome(termo: string): Promise<ProdutoLocal[]>
  produtoDiversos(): Promise<ProdutoLocal | undefined>
  /** Saldo de referência menos o que já foi vendido neste aparelho e ainda não sincronizou. */
  disponivel(produto: ProdutoLocal): Promise<number>
  vendasDaSessao(): Promise<VendaLocal[]>
  movimentosDaSessao(): Promise<MovimentoLocal[]>
  registrarMovimento(m: MovimentoLocal): Promise<void>
}

const PdvContexto = createContext<PdvValor | null>(null)

const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function PdvProvider({ children }: { children: ReactNode }) {
  const { empresa, loja } = useAtiva()
  const banco = useMemo(() => bancoDaLoja(empresa.empresa_id, loja.id), [empresa.empresa_id, loja.id])
  const sinc = useMemo(() => new Sincronizador(banco, sb, empresa.empresa_id, loja.id, dispositivoId()), [banco, empresa.empresa_id, loja.id])
  const [sync, setSync] = useState<EstadoSync>(sinc.atual)
  const [pronto, setPronto] = useState(false)
  const [bloqueado, setBloqueado] = useState(false)
  const [caixa, setCaixa] = useState<CaixaLocal | null>(null)
  const [sessao, setSessao] = useState<SessaoLocal | null>(null)
  const [licenca, setLicenca] = useState<Licenca | null>(null)
  const [temCatalogo, setTemCatalogo] = useState(false)

  // Uma aba por caixa: duas abas vendendo no mesmo aparelho embaralhariam a numeração.
  // Se outra aba está com o caixa, tenta de novo de tempos em tempos (assume quando ela fechar).
  useEffect(() => {
    if (!('locks' in navigator)) return
    let ativo = true
    let tentativas = 0
    let espera: ReturnType<typeof setTimeout> | undefined
    let soltar: () => void = () => {}
    const segurando = new Promise<void>(ok => (soltar = ok))
    const tentar = () =>
      navigator.locks.request(`pdv-${empresa.empresa_id}-${loja.id}`, { ifAvailable: true }, async lock => {
        if (!ativo) return
        if (!lock) {
          // A própria tela pode estar remontando (a trava anterior ainda sendo solta): só bloqueia na insistência.
          if (++tentativas >= 3) setBloqueado(true)
          espera = setTimeout(tentar, tentativas < 3 ? 300 : 2000)
          return
        }
        setBloqueado(false)
        await segurando
      })
    tentar()
    return () => {
      ativo = false
      clearTimeout(espera)
      soltar()
    }
  }, [empresa.empresa_id, loja.id])

  useEffect(() => {
    let ativo = true
    const parar = sinc.ouvir(e => {
      if (!ativo) return
      setSync(e)
      banco.produtos.count().then(n => ativo && setTemCatalogo(n > 0))
      banco.ler<Licenca>('licenca').then(l => ativo && setLicenca(l))
    })
    ;(async () => {
      // Pede ao navegador para não apagar os dados do caixa (vendas ainda não enviadas).
      navigator.storage?.persist?.().catch(() => {})
      await sinc.iniciar()
      const [c, s, l, n] = await Promise.all([banco.ler<CaixaLocal>('caixa'), banco.ler<SessaoLocal>('sessao'), banco.ler<Licenca>('licenca'), banco.produtos.count()])
      if (!ativo) return
      setCaixa(c)
      setSessao(s)
      setLicenca(l)
      setTemCatalogo(n > 0)
      setPronto(true)
      sinc.sincronizar()
    })()
    const tentar = () => sinc.sincronizar()
    const intervalo = setInterval(tentar, 30_000)
    window.addEventListener('online', tentar)
    return () => {
      ativo = false
      parar()
      clearInterval(intervalo)
      window.removeEventListener('online', tentar)
    }
  }, [banco, sinc])

  const definirCaixa = useCallback(
    async (c: CaixaLocal, ultimoNumero: number) => {
      await banco.gravar('caixa', c)
      const atual = (await banco.ler<number>(`ultimo_numero-${c.caixa_id}`)) ?? 0
      await banco.gravar(`ultimo_numero-${c.caixa_id}`, Math.max(atual, ultimoNumero))
      setCaixa(c)
    },
    [banco],
  )

  const esquecerCaixa = useCallback(async () => {
    await banco.gravar('caixa', null)
    setCaixa(null)
  }, [banco])

  const definirSessao = useCallback(
    async (s: SessaoLocal | null) => {
      await banco.gravar('sessao', s)
      setSessao(s)
    },
    [banco],
  )

  const valor = useMemo<PdvValor>(() => {
    const config = empresa.config as { balanca?: ConfigBalanca }
    const licencaValida = !!licenca && Date.now() - Date.parse(licenca.verificada_em) < VALIDADE_LICENCA_MS
    const estado = (sync.situacao === 'ok' ? licenca?.estado : null) ?? (licencaValida ? licenca!.estado : empresa.estado)
    const podeAbrir =
      estado === 'suspensa' || estado === 'cancelada'
        ? { ok: false, motivo: 'A assinatura está suspensa: não é possível abrir o caixa. Fale com o responsável pela empresa.' }
        : !licencaValida && sync.situacao !== 'ok'
          ? { ok: false, motivo: 'Conecte à internet para confirmar a assinatura antes de abrir o caixa (a confirmação vale por 7 dias).' }
          : { ok: true }

    async function porCodigo(codigo: string): Promise<{ produto: ProdutoLocal; fator: number } | null> {
      const canonico = canonizarCodigo(codigo)
      const indice = await banco.codigos.get(canonico)
      if (indice) {
        const produto = await banco.produtos.get(indice.produto_id)
        if (produto) return { produto, fator: indice.fator }
      }
      const interno = await banco.produtos.where('codigo_interno').equals(codigo.trim().toUpperCase()).first()
      return interno ? { produto: interno, fator: 1 } : null
    }

    return {
      banco,
      sinc,
      sync,
      pronto,
      bloqueadoPorOutraAba: bloqueado,
      caixa,
      sessao,
      licenca,
      podeAbrir,
      temCatalogo,
      definirCaixa,
      esquecerCaixa,
      definirSessao,
      async proximoNumero() {
        const chave = `ultimo_numero-${caixa!.caixa_id}`
        const n = ((await banco.ler<number>(chave)) ?? 0) + 1
        await banco.gravar(chave, n)
        return n
      },
      async identificar(texto, quantidade) {
        // 1) etiqueta de balança
        const etiqueta = lerEtiquetaBalanca(texto, config.balanca)
        if (etiqueta) {
          const pesaveis = await banco.produtos.filter(p => p.pesavel && mesmoPlu(etiqueta.plu, p.codigo_balanca)).toArray()
          const produto = pesaveis[0]
          if (produto) {
            if (etiqueta.peso !== undefined) return { produto, quantidade: etiqueta.peso, codigoLido: texto }
            const preco = Math.round((produto.preco_venda ?? 0) * 100)
            if (!preco) return { produto, quantidade: 1, precoUnitario: etiqueta.precoTotal, codigoLido: texto }
            const qtd = Math.max(0.001, Math.round((etiqueta.precoTotal! / preco) * 1000) / 1000)
            return { produto, quantidade: qtd, precoUnitario: etiqueta.precoTotal! / qtd, codigoLido: texto }
          }
        }
        // 2) código de barras / código interno; 3) GS1 (DataMatrix com lote e validade)
        let achado = await porCodigo(texto)
        if (!achado) {
          const gs1 = lerCodigo(texto)
          if (gs1.gs1) achado = await porCodigo(gs1.codigo)
        }
        if (!achado) return null
        return { produto: achado.produto, quantidade: Math.round(quantidade * achado.fator * 1000) / 1000, codigoLido: texto }
      },
      async buscarPorNome(termo) {
        const t = normal(termo.trim())
        if (!t) return []
        const lista = await banco.produtos.filter(p => p.ativo && (normal(p.nome).includes(t) || p.codigo_interno.toLowerCase().includes(t))).limit(30).toArray()
        return lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      },
      produtoDiversos: () => banco.produtos.where('codigo_interno').equals('DIVERSOS').first(),
      async disponivel(produto) {
        const pendentes = await banco.vendas.filter(v => !v.sincronizada && v.status === 'concluida').toArray()
        const vendido = pendentes
          .flatMap(v => (v.dados.itens as { produto_id: string; quantidade: number }[]) ?? [])
          .filter(i => i.produto_id === produto.id)
          .reduce((s, i) => s + i.quantidade, 0)
        return Math.round((produto.saldo - vendido) * 1000) / 1000
      },
      async vendasDaSessao() {
        if (!sessao) return []
        const lista = await banco.vendas.where('sessao_id').equals(sessao.id).toArray()
        return lista.sort((a, b) => b.numero - a.numero)
      },
      async movimentosDaSessao() {
        return sessao ? ((await banco.ler<MovimentoLocal[]>(`movimentos-${sessao.id}`)) ?? []) : []
      },
      async registrarMovimento(m) {
        if (!sessao || !caixa) return
        const chave = `movimentos-${sessao.id}`
        await banco.gravar(chave, [...((await banco.ler<MovimentoLocal[]>(chave)) ?? []), m])
        await sinc.enfileirar('movimento_caixa', { caixa_id: caixa.caixa_id, sessao_id: sessao.id, movimento_id: m.id, tipo: m.tipo, valor: m.valor / 100, motivo: m.motivo, ocorrido_em: m.ocorrido_em })
      },
    }
  }, [banco, sinc, sync, pronto, bloqueado, caixa, sessao, licenca, temCatalogo, definirCaixa, esquecerCaixa, definirSessao, empresa.config, empresa.estado])

  return <PdvContexto.Provider value={valor}>{children}</PdvContexto.Provider>
}

export function usePdv() {
  const c = useContext(PdvContexto)
  if (!c) throw new Error('usePdv fora do PdvProvider')
  return c
}
