import type { PGlite } from '@electric-sql/pglite'
import { ident, type Claims, type ConexaoSocket } from './tipos.ts'

/**
 * Imitação do Supabase Realtime (protocolo Phoenix, serializador 2.0.0) para
 * "postgres_changes". Os avisos vêm dos gatilhos instalados em servidor-local/banco.ts
 * (LISTEN/NOTIFY) e, como no Supabase, cada assinante só recebe as linhas que a
 * RLS deixa ele ler — a conferência roda no banco com o papel e o token dele.
 */

type Mensagem = [string | null, string | null, string, string, Record<string, unknown>]

interface FiltroRt {
  coluna: string
  op: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'in'
  valores: string[]
}

interface Vinculo {
  id: number
  event: string
  schema: string
  table?: string
  filter?: string
  filtro: FiltroRt | null
}

interface Canal {
  conexao: ConexaoSocket
  topico: string
  joinRef: string | null
  vinculos: Vinculo[]
  claims: Claims
}

interface Aviso {
  schema: string
  table: string
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  commit_timestamp: string
  chaves: Record<string, unknown>
  record?: Record<string, unknown> | null
  old_record?: Record<string, unknown> | null
  grande?: boolean
}

export type Identificar = (token: string | undefined) => { ok: true; claims: Claims } | { ok: false; motivo: string }

function lerFiltroRt(texto: string | undefined): FiltroRt | null {
  if (!texto) return null
  const m = /^([\p{L}\p{N}_]+)=(eq|neq|lt|lte|gt|gte|in)\.(.*)$/su.exec(texto)
  if (!m) throw new Error(`filtro não suportado: ${texto}`)
  const [, coluna, op, valor] = m
  const valores = op === 'in' ? valor.replace(/^\(|\)$/g, '').split(',').map(v => v.trim().replace(/^"(.*)"$/, '$1')) : [valor]
  return { coluna, op: op as FiltroRt['op'], valores }
}

function atendeFiltro(f: FiltroRt, registro: Record<string, unknown> | null | undefined) {
  if (!registro || !(f.coluna in registro)) return false
  const bruto = registro[f.coluna]
  const valor = bruto === null ? 'null' : typeof bruto === 'object' ? JSON.stringify(bruto) : String(bruto)
  const numerico = typeof bruto === 'number'
  const comparar = (alvo: string) => (numerico ? (bruto as number) - Number(alvo) : valor.localeCompare(alvo))
  switch (f.op) {
    case 'eq': return valor === f.valores[0]
    case 'neq': return valor !== f.valores[0]
    case 'in': return f.valores.includes(valor)
    case 'lt': return comparar(f.valores[0]) < 0
    case 'lte': return comparar(f.valores[0]) <= 0
    case 'gt': return comparar(f.valores[0]) > 0
    case 'gte': return comparar(f.valores[0]) >= 0
  }
}

export class TempoRealLocal {
  readonly canais: Canal[] = []
  private proximoId = 1
  private fila: Promise<void> = Promise.resolve()
  private colunas = new Map<string, { name: string; type: string }[]>()

  constructor(
    private readonly db: PGlite,
    private readonly identificar: Identificar,
  ) {}

  conectar(conexao: ConexaoSocket) {
    conexao.aoReceber(bruta => {
      let m: Mensagem
      try {
        m = JSON.parse(bruta)
      } catch {
        return
      }
      if (!Array.isArray(m) || m.length !== 5) return
      const [joinRef, ref, topico, evento, payload] = m
      const responder = (status: 'ok' | 'error', response: Record<string, unknown>) =>
        conexao.enviar(JSON.stringify([joinRef, ref, topico, 'phx_reply', { status, response }]))

      if (evento === 'heartbeat') responder('ok', {})
      else if (evento === 'phx_join') this.entrar(conexao, joinRef, topico, payload ?? {}, responder)
      else if (evento === 'phx_leave') {
        this.removerCanais(c => c.conexao === conexao && c.topico === topico)
        responder('ok', {})
      } else if (evento === 'access_token') {
        // Token renovado pelo app: passa a valer para as próximas conferências de permissão.
        const r = this.identificar(payload?.access_token as string | undefined)
        for (const c of this.canais) if (c.conexao === conexao && c.topico === topico && r.ok) c.claims = r.claims
      }
      // broadcast e presence: não usados pelo sistema; ignorados.
    })
    conexao.aoFechar?.(() => this.removerCanais(c => c.conexao === conexao))
  }

  /** Chamado a cada NOTIFY do banco; os avisos são entregues na ordem em que aconteceram. */
  aviso(payload: string) {
    this.fila = this.fila
      .then(() => this.distribuir(JSON.parse(payload) as Aviso))
      .catch(e => console.error('[servidor local] tempo real:', e))
  }

  /** Espera os avisos pendentes serem entregues (útil nos testes). */
  ocioso() {
    return this.fila
  }

  private entrar(
    conexao: ConexaoSocket,
    joinRef: string | null,
    topico: string,
    payload: Record<string, unknown>,
    responder: (status: 'ok' | 'error', response: Record<string, unknown>) => void,
  ) {
    const quem = this.identificar(payload.access_token as string | undefined)
    if (!quem.ok) return responder('error', { reason: quem.motivo })
    const config = (payload.config ?? {}) as { postgres_changes?: Omit<Vinculo, 'id' | 'filtro'>[] }
    let vinculos: Vinculo[]
    try {
      vinculos = (config.postgres_changes ?? []).map(f => ({ ...f, id: this.proximoId++, filtro: lerFiltroRt(f.filter) }))
    } catch (e) {
      return responder('error', { reason: `Unable to subscribe to changes with given parameters. ${(e as Error).message}` })
    }
    this.removerCanais(c => c.conexao === conexao && c.topico === topico)
    this.canais.push({ conexao, topico, joinRef, vinculos, claims: quem.claims })
    // O app confere se o servidor devolveu exatamente os filtros pedidos (mais o id).
    responder('ok', { postgres_changes: vinculos.map(({ filtro: _filtro, ...v }) => v) })
  }

  private removerCanais(filtro: (c: Canal) => boolean) {
    for (let i = this.canais.length - 1; i >= 0; i--) if (filtro(this.canais[i])) this.canais.splice(i, 1)
  }

  private async distribuir(aviso: Aviso) {
    if (aviso.grande && aviso.type !== 'DELETE') aviso.record = await this.buscarRegistro(aviso)
    const chavesSo = aviso.chaves
    for (const canal of [...this.canais]) {
      const ids = canal.vinculos
        .filter(
          v =>
            (v.event === '*' || v.event.toUpperCase() === aviso.type) &&
            (v.schema === '*' || v.schema === aviso.schema) &&
            (!v.table || v.table === '*' || v.table === aviso.table) &&
            (!v.filtro || atendeFiltro(v.filtro, aviso.type === 'DELETE' ? chavesSo : aviso.record)),
        )
        .map(v => v.id)
      if (!ids.length) continue
      // Exclusões não passam pela RLS (a linha já não existe) e trazem só a chave, como no Supabase.
      if (aviso.type !== 'DELETE' && !(await this.podeLer(canal.claims, aviso))) continue
      const data = {
        schema: aviso.schema,
        table: aviso.table,
        commit_timestamp: aviso.commit_timestamp,
        type: aviso.type,
        columns: await this.colunasDe(aviso.schema, aviso.table),
        ...(aviso.type !== 'DELETE' ? { record: aviso.record ?? {} } : {}),
        ...(aviso.type !== 'INSERT' ? { old_record: chavesSo } : {}),
        errors: null,
      }
      canal.conexao.enviar(JSON.stringify([canal.joinRef, null, canal.topico, 'postgres_changes', { ids, data }]))
    }
  }

  private async podeLer(claims: Claims, aviso: Aviso) {
    const colunas = Object.keys(aviso.chaves)
    if (!colunas.length) return false
    try {
      return await this.db.transaction(async tx => {
        await tx.query(`select set_config('role', $1, true), set_config('request.jwt.claims', $2, true)`, [claims.role, JSON.stringify(claims)])
        const { rows } = await tx.query(
          `select 1 from ${ident(aviso.schema)}.${ident(aviso.table)} where ${colunas.map((c, i) => `${ident(c)} = $${i + 1}`).join(' and ')} limit 1`,
          colunas.map(c => aviso.chaves[c]),
        )
        return rows.length > 0
      })
    } catch {
      return false // sem permissão na tabela
    }
  }

  private async buscarRegistro(aviso: Aviso) {
    const colunas = Object.keys(aviso.chaves)
    const { rows } = await this.db.query<{ r: Record<string, unknown> }>(
      `select to_jsonb(t) as r from ${ident(aviso.schema)}.${ident(aviso.table)} t where ${colunas.map((c, i) => `${ident(c)} = $${i + 1}`).join(' and ')}`,
      colunas.map(c => aviso.chaves[c]),
    )
    return rows[0]?.r ?? null
  }

  private async colunasDe(esquema: string, tabela: string) {
    const chave = `${esquema}.${tabela}`
    if (!this.colunas.has(chave)) {
      const { rows } = await this.db.query<{ name: string; type: string }>(
        `select a.attname as name, t.typname as type
         from pg_attribute a join pg_type t on t.oid = a.atttypid
         where a.attrelid = format('%I.%I', $1::text, $2::text)::regclass and a.attnum > 0 and not a.attisdropped
         order by a.attnum`,
        [esquema, tabela],
      )
      this.colunas.set(chave, rows)
    }
    return this.colunas.get(chave)!
  }
}
