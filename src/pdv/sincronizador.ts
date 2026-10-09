import type { SupabaseClient } from '@supabase/supabase-js'
import type { BancoPdv, EventoPendente, ProdutoLocal, TipoEvento } from './local'
import { uuidv7 } from './venda'

/**
 * Leva os eventos do caixa ao servidor (em ordem, pela fila do aparelho) e traz o catálogo.
 *  - Sem internet, nada se perde: os eventos ficam na fila e vão quando a conexão voltar.
 *  - Reenviar é seguro: o servidor reconhece eventos já recebidos pelo id.
 *  - O relógio do aparelho é corrigido pela hora do servidor a cada resposta.
 */

export interface EstadoSync {
  situacao: 'ok' | 'enviando' | 'offline' | 'erro'
  pendentes: number
  invalidos: number
  ultimaSync: string | null
  mensagem: string | null
  /** Diferença do relógio do aparelho para o do servidor, em ms (servidor − aparelho). */
  desvioRelogio: number
}

export interface Licenca {
  estado: string
  papel: string
  verificada_em: string
}

const PROTOCOLO = 1
const LOTE = 50
/** Produtos alterados há menos que isto voltam de novo na próxima sincronização (transações demoradas). */
const MARGEM_CATALOGO_MS = 2 * 60_000

const ehFalhaDeRede = (msg: string) => /Failed to fetch|NetworkError|fetch failed|Load failed|network|ECONNREFUSED|aborted/i.test(msg)

type ResultadoEvento = { id: string; status: 'aplicado' | 'duplicado' | 'quarentena' | 'invalido'; mensagem?: string; codigo?: string }

export class Sincronizador {
  private ouvintes = new Set<(e: EstadoSync) => void>()
  private estado: EstadoSync = { situacao: 'ok', pendentes: 0, invalidos: 0, ultimaSync: null, mensagem: null, desvioRelogio: 0 }
  private emAndamento: Promise<void> | null = null
  private deNovo = false
  private desvio = 0

  constructor(
    readonly banco: BancoPdv,
    private readonly sb: SupabaseClient,
    readonly empresaId: string,
    readonly lojaId: string,
    readonly dispositivo: string,
    /** Relógio do aparelho (substituível nos testes). */
    private readonly relogio: () => number = Date.now,
  ) {}

  async iniciar() {
    this.desvio = (await this.banco.ler<number>('relogio')) ?? 0
    this.estado.ultimaSync = await this.banco.ler<string>('ultima_sync')
    this.estado.desvioRelogio = this.desvio
    await this.contar()
  }

  ouvir(cb: (e: EstadoSync) => void): () => void {
    this.ouvintes.add(cb)
    cb(this.estado)
    return () => this.ouvintes.delete(cb)
  }

  get atual() {
    return this.estado
  }

  /** Hora corrigida pelo servidor (o relógio do aparelho pode estar errado). */
  agora(): Date {
    return new Date(this.relogio() + this.desvio)
  }

  /** Grava o evento na fila do aparelho (nunca falha por falta de internet) e tenta enviar. */
  async enfileirar(tipo: TipoEvento, dados: Record<string, unknown>): Promise<EventoPendente> {
    const evento: EventoPendente = { id: uuidv7(this.agora().getTime()), tipo, dados, criado_em: this.agora().toISOString(), tentativas: 0 }
    await this.banco.fila.add(evento)
    await this.contar()
    void this.sincronizar()
    return evento
  }

  /** Envia a fila e baixa o catálogo. Chamadas simultâneas aguardam a que está em andamento. */
  sincronizar(): Promise<void> {
    if (this.emAndamento) {
      this.deNovo = true
      return this.emAndamento
    }
    this.emAndamento = (async () => {
      do {
        this.deNovo = false
        await this.ciclo()
      } while (this.deNovo)
    })().finally(() => (this.emAndamento = null))
    return this.emAndamento
  }

  private async ciclo() {
    this.mudar({ situacao: 'enviando' })
    try {
      await this.enviarFila()
      await this.baixarCatalogo()
      await this.verificarLicenca()
      const agora = this.agora().toISOString()
      await this.banco.gravar('ultima_sync', agora)
      this.mudar({ situacao: 'ok', mensagem: null, ultimaSync: agora })
    } catch (e) {
      const msg = (e as { message?: string }).message ?? String(e)
      const offline = ehFalhaDeRede(msg)
      this.mudar({
        situacao: offline ? 'offline' : 'erro',
        mensagem: offline ? 'Sem conexão com o servidor.' : /PROTOCOLO|não suportada/.test(msg) ? 'Atualize o aplicativo (recarregue a página).' : msg,
      })
    } finally {
      await this.contar()
    }
  }

  private async enviarFila() {
    for (;;) {
      const lote = await this.banco.fila.orderBy('ordem').filter(e => !e.invalido).limit(LOTE).toArray()
      if (!lote.length) return
      const t0 = this.relogio()
      const { data, error } = await this.sb.rpc('pdv_sincronizar', {
        p_protocolo: PROTOCOLO,
        p_dispositivo: this.dispositivo,
        p_eventos: lote.map(({ id, tipo, dados }) => ({ id, tipo, dados })),
      })
      if (error) {
        await this.banco.fila.bulkUpdate(lote.map(e => ({ key: e.ordem!, changes: { tentativas: e.tentativas + 1 } })))
        throw error
      }
      const resposta = data as { agora: string; resultados: ResultadoEvento[] }
      await this.ajustarRelogio(resposta.agora, t0, this.relogio())
      await this.banco.transaction('rw', this.banco.fila, this.banco.vendas, async () => {
        for (const r of resposta.resultados) {
          const evento = lote.find(e => e.id === r.id)
          if (!evento) continue
          if (r.status === 'invalido') {
            await this.banco.fila.update(evento.ordem!, { invalido: true, erro: r.mensagem ?? 'Recusado pelo servidor.', tentativas: evento.tentativas + 1 })
            continue
          }
          await this.banco.fila.delete(evento.ordem!)
          if (evento.tipo === 'venda') await this.banco.vendas.update(evento.dados.venda_id as string, { sincronizada: true })
        }
      })
      if (lote.length < LOTE) return
    }
  }

  async baixarCatalogo() {
    const desde = await this.banco.ler<string>('catalogo_desde')
    const t0 = this.relogio()
    const { data, error } = await this.sb.rpc('pdv_catalogo', { p_loja: this.lojaId, p_desde: desde })
    if (error) throw error
    const cat = data as {
      agora: string
      completo: boolean
      produtos: (Omit<ProdutoLocal, 'saldo'> & { codigos: { codigo: string; fator: number | string }[] })[]
      saldos: { produto_id: string; saldo: number | string }[]
    }
    await this.ajustarRelogio(cat.agora, t0, this.relogio())
    const b = this.banco
    await b.transaction('rw', b.produtos, b.codigos, b.meta, async () => {
      if (cat.completo) await Promise.all([b.produtos.clear(), b.codigos.clear()])
      for (const p of cat.produtos) {
        const atual = cat.completo ? undefined : await b.produtos.get(p.id)
        const codigos = p.codigos.map(c => ({ codigo: c.codigo, fator: Number(c.fator) }))
        await b.codigos.where('produto_id').equals(p.id).delete()
        await b.produtos.put({
          ...p,
          preco_venda: p.preco_venda === null ? null : Number(p.preco_venda),
          conteudo_embalagem: p.conteudo_embalagem === null ? null : Number(p.conteudo_embalagem),
          codigos,
          saldo: atual?.saldo ?? 0,
        })
        await b.codigos.bulkPut(codigos.map(c => ({ ...c, produto_id: p.id })))
      }
      for (const s of cat.saldos) await b.produtos.update(s.produto_id, { saldo: Number(s.saldo) })
      await b.gravar('catalogo_desde', new Date(Date.parse(cat.agora) - MARGEM_CATALOGO_MS).toISOString())
    })
  }

  /** Licença guardada no aparelho: o caixa abre offline enquanto ela for recente. */
  private async verificarLicenca() {
    const { data, error } = await this.sb.rpc('minhas_empresas')
    if (error) throw error
    const v = (data as { empresa_id: string; estado: string; papel: string }[]).find(x => x.empresa_id === this.empresaId)
    if (v) await this.banco.gravar('licenca', { estado: v.estado, papel: v.papel, verificada_em: this.agora().toISOString() } satisfies Licenca)
  }

  private async ajustarRelogio(agoraServidor: string, enviado: number, recebido: number) {
    const servidor = Date.parse(agoraServidor)
    if (Number.isNaN(servidor)) return
    this.desvio = Math.round(servidor - (enviado + recebido) / 2)
    this.estado.desvioRelogio = this.desvio
    await this.banco.gravar('relogio', this.desvio)
  }

  private async contar() {
    const todos = await this.banco.fila.toArray()
    this.mudar({ pendentes: todos.filter(e => !e.invalido).length, invalidos: todos.filter(e => e.invalido).length })
  }

  private mudar(parcial: Partial<EstadoSync>) {
    this.estado = { ...this.estado, ...parcial }
    for (const cb of this.ouvintes) cb(this.estado)
  }
}
