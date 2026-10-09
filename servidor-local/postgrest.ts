import type { PGlite, Transaction } from '@electric-sql/pglite'
import { ident, respostaJson, respostaVazia, type Claims, type PedidoHttp, type RespostaHttp } from './tipos.ts'

/**
 * Tradutor HTTP → SQL no formato do PostgREST (a API REST do Supabase), executado
 * no banco local com o papel e as claims de quem chamou — exatamente como o
 * PostgREST faz. RLS, permissões por coluna, gatilhos e funções são os do banco.
 *
 * Cobre o que o supabase-js usa: select com filtros (eq, neq, gt, gte, lt, lte,
 * like, ilike, match, imatch, in, is, isdistinct, cs, cd, ov, not, or/and),
 * order, limit/offset, count, single/maybeSingle, insert (inclusive em lote),
 * upsert, update, delete, return=representation e rpc.
 *
 * Fora do escopo (responde 400 com aviso claro, para não mascarar diferença com
 * a nuvem): recursos embutidos — select=*,tabela(*) —, caminhos JSON (col->x),
 * missing=default, tx=rollback, CSV e EXPLAIN.
 */

interface Relacao {
  nome: string
  colunas: Set<string>
  chave: string[]
}

interface Funcao {
  nome: string
  args: { nome: string; tipo: string; temPadrao: boolean }[]
  retorno: 'void' | 'valor'
  conjunto: boolean
}

type Condicao =
  | { tipo: 'filtro'; coluna: string; negar: boolean; op: string; valor: string }
  | { tipo: 'logica'; op: 'and' | 'or'; negar: boolean; itens: Condicao[] }

interface CorpoErro {
  code: string
  details: string | null
  hint: string | null
  message: string
}

class ErroApi extends Error {
  constructor(
    readonly status: number,
    readonly corpo: CorpoErro,
  ) {
    super(corpo.message)
  }
}

const erro = (status: number, code: string, message: string, details: string | null = null, hint: string | null = null) =>
  new ErroApi(status, { code, details, hint, message })

const naoSimulado = (oque: string) =>
  erro(400, 'PGRST100', `O servidor local não simula ${oque}. Ajuste a consulta (o Supabase real aceitaria, mas o teste não cobriria).`)

const PARAMS_RESERVADOS = new Set(['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'])
const OPERADORES: Record<string, string> = {
  eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=',
  like: 'like', ilike: 'ilike', match: '~', imatch: '~*',
  cs: '@>', cd: '<@', ov: '&&', isdistinct: 'is distinct from',
}
const ALVO = 'pgrst_alvo'
const NOME_VALIDO = /^[\p{L}\p{N}_]+$/u

function validarNome(nome: string, contexto: string) {
  if (!NOME_VALIDO.test(nome)) {
    if (/->/.test(nome)) throw naoSimulado(`caminhos JSON (${nome})`)
    throw erro(400, 'PGRST100', `"failed to parse ${contexto}" (${nome})`)
  }
  return nome
}

/** Divide no primeiro nível: vírgulas fora de parênteses e de aspas. */
function dividir(texto: string): string[] {
  const partes: string[] = []
  let atual = ''
  let nivel = 0
  let aspas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (aspas) {
      if (c === '\\' && i + 1 < texto.length) {
        atual += c + texto[++i]
        continue
      }
      if (c === '"') aspas = false
    } else if (c === '"') aspas = true
    else if (c === '(') nivel++
    else if (c === ')') nivel--
    else if (c === ',' && nivel === 0) {
      partes.push(atual)
      atual = ''
      continue
    }
    atual += c
  }
  if (atual !== '' || partes.length) partes.push(atual)
  return partes
}

const desaspar = (v: string) => (v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/\\(.)/g, '$1') : v)

function lerFiltro(coluna: string, texto: string, dentroDeLogica: boolean): Condicao {
  validarNome(coluna, 'filter')
  let negar = false
  let resto = texto
  if (resto.startsWith('not.')) {
    negar = true
    resto = resto.slice(4)
  }
  const ponto = resto.indexOf('.')
  if (ponto < 0) throw erro(400, 'PGRST100', `"failed to parse filter (${texto})"`)
  const op = resto.slice(0, ponto)
  const valor = resto.slice(ponto + 1)
  if (/\((any|all)\)$/.test(op)) throw naoSimulado(`modificadores any/all (${op})`)
  if (/^(fts|plfts|phfts|wfts)$/.test(op)) throw naoSimulado('busca textual (fts)')
  if (op !== 'in' && op !== 'is' && !OPERADORES[op]) throw erro(400, 'PGRST100', `"failed to parse filter (${texto})"`, `unexpected "${op}"`)
  return { tipo: 'filtro', coluna, negar, op, valor: dentroDeLogica && op !== 'in' ? desaspar(valor) : valor }
}

function lerLogica(op: 'and' | 'or', negar: boolean, texto: string): Condicao {
  if (!texto.startsWith('(') || !texto.endsWith(')')) throw erro(400, 'PGRST100', `"failed to parse logic tree (${texto})"`)
  const itens = dividir(texto.slice(1, -1)).map((item): Condicao => {
    const sub = /^(not\.)?(and|or)(\(.*\))$/s.exec(item)
    if (sub) return lerLogica(sub[2] as 'and' | 'or', !!sub[1], sub[3])
    const ponto = item.indexOf('.')
    if (ponto < 0) throw erro(400, 'PGRST100', `"failed to parse logic tree (${texto})"`)
    return lerFiltro(item.slice(0, ponto), item.slice(ponto + 1), true)
  })
  return { tipo: 'logica', op, negar, itens }
}

function lerCondicoes(busca: URLSearchParams): Condicao[] {
  const condicoes: Condicao[] = []
  for (const [chave, valor] of busca) {
    if (PARAMS_RESERVADOS.has(chave)) continue
    const logica = /^(not\.)?(and|or)$/.exec(chave)
    if (logica) condicoes.push(lerLogica(logica[2] as 'and' | 'or', !!logica[1], valor))
    else if (chave.includes('.')) throw naoSimulado(`filtros em recursos embutidos (${chave})`)
    else condicoes.push(lerFiltro(chave, valor, false))
  }
  return condicoes
}

class Parametros {
  readonly valores: unknown[]
  constructor(iniciais: unknown[] = []) {
    this.valores = [...iniciais]
  }
  add(v: unknown) {
    this.valores.push(v)
    return `$${this.valores.length}`
  }
}

function sqlCondicao(c: Condicao, p: Parametros): string {
  if (c.tipo === 'logica') {
    const partes = c.itens.map(i => sqlCondicao(i, p))
    const s = partes.length ? `(${partes.join(c.op === 'and' ? ' and ' : ' or ')})` : c.op === 'and' ? 'true' : 'false'
    return c.negar ? `not ${s}` : s
  }
  const col = `${ALVO}.${ident(c.coluna)}`
  let s: string
  if (c.op === 'in') {
    if (!c.valor.startsWith('(') || !c.valor.endsWith(')')) throw erro(400, 'PGRST100', `"failed to parse filter (in.${c.valor})"`)
    const itens = dividir(c.valor.slice(1, -1)).map(desaspar)
    s = itens.length ? `${col} in (${itens.map(v => p.add(v)).join(', ')})` : 'false'
  } else if (c.op === 'is') {
    const v = c.valor.toLowerCase()
    if (!['null', 'not_null', 'true', 'false', 'unknown'].includes(v)) throw erro(400, 'PGRST100', `"failed to parse filter (is.${c.valor})"`)
    s = `${col} is ${v === 'not_null' ? 'not null' : v}`
  } else {
    const valor = c.op === 'like' || c.op === 'ilike' ? c.valor.replaceAll('*', '%') : c.valor
    s = `${col} ${OPERADORES[c.op]} ${p.add(valor)}`
  }
  return c.negar ? `not (${s})` : s
}

function lerOrdem(texto: string): string {
  return texto
    .split(',')
    .map(item => {
      const [coluna, ...mods] = item.split('.')
      validarNome(coluna, 'order')
      let sql = `${ALVO}.${ident(coluna)}`
      for (const m of mods) {
        if (m === 'asc' || m === 'desc') sql += ` ${m}`
        else if (m === 'nullsfirst') sql += ' nulls first'
        else if (m === 'nullslast') sql += ' nulls last'
        else throw erro(400, 'PGRST100', `"failed to parse order (${texto})"`)
      }
      return sql
    })
    .join(', ')
}

/** Lista de colunas do select (ou do RETURNING), com alias e cast. */
function lerSelect(texto: string | null, qualificar: boolean): string {
  const limpo = (texto ?? '*').trim()
  if (limpo === '' || limpo === '*') return qualificar ? `${ALVO}.*` : '*'
  if (/[()]/.test(limpo)) throw naoSimulado(`recursos embutidos no select (${limpo}); busque cada tabela separadamente`)
  if (limpo.includes('...')) throw naoSimulado('spread (...) no select')
  return dividir(limpo)
    .map(parte => {
      if (parte === '*') return qualificar ? `${ALVO}.*` : '*'
      const m = /^(?:([\p{L}\p{N}_]+):)?([^:]+)(?:::([a-z0-9_ ]+(?:\[\])?))?$/iu.exec(parte)
      if (!m) throw erro(400, 'PGRST100', `"failed to parse select parameter (${limpo})"`)
      const [, alias, coluna, cast] = m
      validarNome(coluna, 'select parameter')
      const ref = (qualificar ? `${ALVO}.` : '') + ident(coluna)
      if (!alias && !cast) return ref
      return `${ref}${cast ? `::${cast}` : ''} as ${ident(alias ?? coluna)}`
    })
    .join(', ')
}

function lerPrefer(cabecalho: string | undefined) {
  const prefer: Record<string, string> = {}
  for (const item of (cabecalho ?? '').split(/[,\n]/)) {
    const [k, v] = item.split('=').map(s => s.trim())
    if (k) prefer[k] = v ?? ''
  }
  return prefer
}

function inteiro(texto: string | null, nome: string) {
  if (texto === null) return null
  if (!/^\d+$/.test(texto)) throw erro(400, 'PGRST100', `"failed to parse ${nome} (${texto})"`)
  return Number(texto)
}

/** Status HTTP de cada erro do PostgreSQL, como o PostgREST faz. */
function statusDoErro(codigo: string, autenticado: boolean): number {
  if (codigo === '42501') return autenticado ? 403 : 401
  if (codigo === '23503' || codigo === '23505') return 409
  if (codigo === '25006') return 405
  if (codigo === 'P0001') return 400
  if (codigo === '42883' || codigo === '42P01') return 404
  if (codigo === '42P17') return 500
  if (/^PT\d{3}$/.test(codigo)) return Number(codigo.slice(2))
  const porClasse: Record<string, number> = {
    '08': 503, '09': 500, '0L': 403, '0P': 403, '25': 500, '28': 403, '2D': 500, '38': 500, '39': 500, '3B': 500,
    '40': 500, '53': 503, '54': 500, '55': 500, '57': 500, '58': 500, F0: 500, HV: 500, P0: 500, XX: 500,
  }
  return porClasse[codigo.slice(0, 2)] ?? 400
}

interface ErroBanco {
  code: string
  message: string
  detail?: string
  hint?: string
  severity?: string
}
const ehErroBanco = (e: unknown): e is ErroBanco =>
  typeof e === 'object' && e !== null && typeof (e as ErroBanco).code === 'string' && 'severity' in e

export class PostgrestLocal {
  private relacoes = new Map<string, Relacao>()
  private funcoes = new Map<string, Funcao[]>()

  private constructor(private readonly db: PGlite) {}

  static async iniciar(db: PGlite) {
    const p = new PostgrestLocal(db)
    await p.recarregarEsquema()
    return p
  }

  /** Lê tabelas, visões e funções do schema public (o "schema cache" do PostgREST). */
  async recarregarEsquema() {
    const colunas = await this.db.query<{ relacao: string; coluna: string }>(`
      select c.relname as relacao, a.attname as coluna
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f')
      order by c.relname, a.attnum`)
    const chaves = await this.db.query<{ relacao: string; colunas: string[] }>(`
      select c.relname as relacao,
             array(select a.attname::text from pg_attribute a
                   where a.attrelid = c.oid and a.attnum = any (i.indkey)
                   order by array_position(i.indkey::int2[], a.attnum)) as colunas
      from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and i.indisprimary`)
    const funcoes = await this.db.query<{
      nome: string
      nomes: string[] | null
      modos: string[] | null
      tipos: string[]
      padroes: number
      conjunto: boolean
      retorno: string
    }>(`
      select p.proname as nome, p.proargnames as nomes, p.proargmodes::text[] as modos,
             array(select format_type(t, null) from unnest(p.proargtypes) with ordinality u(t, i) order by i) as tipos,
             p.pronargdefaults as padroes, p.proretset as conjunto, format_type(p.prorettype, null) as retorno
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f'`)

    this.relacoes.clear()
    for (const { relacao, coluna } of colunas.rows) {
      if (!this.relacoes.has(relacao)) this.relacoes.set(relacao, { nome: relacao, colunas: new Set(), chave: [] })
      this.relacoes.get(relacao)!.colunas.add(coluna)
    }
    for (const { relacao, colunas: c } of chaves.rows) {
      const r = this.relacoes.get(relacao)
      if (r) r.chave = c
    }

    this.funcoes.clear()
    for (const f of funcoes.rows) {
      const nomes = f.modos ? (f.nomes ?? []).filter((_, i) => ['i', 'b', 'v'].includes(f.modos![i])) : (f.nomes ?? []).slice(0, f.tipos.length)
      if (nomes.length !== f.tipos.length || nomes.some(n => !n)) continue // argumentos sem nome não são chamáveis por nome
      const args = nomes.map((nome, i) => ({ nome, tipo: f.tipos[i], temPadrao: i >= f.tipos.length - f.padroes }))
      const lista = this.funcoes.get(f.nome) ?? []
      lista.push({ nome: f.nome, args, retorno: f.retorno === 'void' ? 'void' : 'valor', conjunto: f.conjunto })
      this.funcoes.set(f.nome, lista)
    }
  }

  /** Rotas /rest/v1/*. Devolve null para métodos não simulados. */
  async atender(pedido: PedidoHttp, claims: Claims): Promise<RespostaHttp | null> {
    try {
      const perfil = pedido.cabecalhos['accept-profile'] ?? pedido.cabecalhos['content-profile']
      if (perfil && perfil !== 'public')
        throw erro(406, 'PGRST106', 'The schema must be one of the following: public', null, 'Only the public schema is exposed by the local server')
      const aceita = pedido.cabecalhos['accept'] ?? ''
      if (/text\/csv|vnd\.pgrst\.plan/.test(aceita)) throw naoSimulado(`o formato de resposta ${aceita}`)
      const prefer = lerPrefer(pedido.cabecalhos['prefer'])
      if ('missing' in prefer) throw naoSimulado('Prefer: missing=default')
      if (prefer.tx === 'rollback') throw naoSimulado('Prefer: tx=rollback')

      const recurso = decodeURIComponent(pedido.caminho.replace(/^\/rest\/v1\/?/, ''))
      const ctx: Contexto = {
        pedido,
        claims,
        prefer,
        objeto: aceita.includes('application/vnd.pgrst.object+json'),
        semNulos: aceita.includes('nulls=stripped'),
      }

      if (recurso.startsWith('rpc/')) {
        if (pedido.metodo !== 'POST' && pedido.metodo !== 'GET') return null
        return await this.chamarFuncao(recurso.slice(4), ctx)
      }
      const rel = this.relacoes.get(recurso)
      if (!rel) throw erro(404, 'PGRST205', `Could not find the table 'public.${recurso}' in the schema cache`)
      switch (pedido.metodo) {
        case 'GET':
        case 'HEAD':
          return await this.ler(rel, ctx)
        case 'POST':
          return await this.inserir(rel, ctx)
        case 'PATCH':
          return await this.atualizar(rel, ctx)
        case 'DELETE':
          return await this.excluir(rel, ctx)
        default:
          return null
      }
    } catch (e) {
      if (e instanceof ErroApi) return respostaJson(e.status, e.corpo)
      if (ehErroBanco(e))
        return respostaJson(statusDoErro(e.code, claims.role === 'authenticated'), {
          code: e.code,
          details: e.detail ?? null,
          hint: e.hint ?? null,
          message: e.message,
        })
      throw e
    }
  }

  // ------------------------------------------------------------------ leitura

  private async ler(rel: Relacao, ctx: Contexto): Promise<RespostaHttp> {
    const { busca } = ctx.pedido
    const p = new Parametros()
    const where = this.where(lerCondicoes(busca), p)
    const ordem = busca.get('order') ? ` order by ${lerOrdem(busca.get('order')!)}` : ''
    const limite = inteiro(busca.get('limit'), 'limit')
    const inicio = inteiro(busca.get('offset'), 'offset') ?? 0
    const q = this.qualificada(rel)
    const linhas =
      `select ${lerSelect(busca.get('select'), true)} from ${q} as ${ALVO}${where}${ordem}` +
      (limite !== null ? ` limit ${limite}` : '') +
      (inicio ? ` offset ${inicio}` : '')

    const r = await this.comPapel(ctx, async tx => {
      const { rows } = await tx.query<Agregado>(`select ${this.agregado(ctx)} from (${linhas}) _postgrest_t`, p.valores)
      const contagem =
        'count' in ctx.prefer
          ? (await tx.query<{ n: number }>(`select count(*)::int as n from ${q} as ${ALVO}${where}`, p.valores)).rows[0].n
          : null
      return { ...rows[0], contagem }
    })

    const faixa = r.total ? `${inicio}-${inicio + r.total - 1}` : '*'
    const cabecalhos = { 'content-range': `${faixa}/${r.contagem ?? '*'}` }
    const parcial = r.contagem !== null && r.total < r.contagem
    if (ctx.pedido.metodo === 'HEAD') return respostaVazia(parcial ? 206 : 200, cabecalhos)
    if (ctx.objeto) return this.umObjeto(r, cabecalhos)
    return { ...respostaJson(parcial ? 206 : 200, undefined, cabecalhos), corpo: r.corpo! }
  }

  // ----------------------------------------------------------------- gravação

  private async inserir(rel: Relacao, ctx: Contexto): Promise<RespostaHttp> {
    const { corpo, busca } = ctx.pedido
    const linhas = Array.isArray(corpo) ? corpo : corpo && typeof corpo === 'object' ? [corpo] : null
    if (!linhas || linhas.some(l => !l || typeof l !== 'object' || Array.isArray(l))) throw erro(400, 'PGRST102', 'Empty or invalid json')

    let colunas: string[]
    if (busca.get('columns')) colunas = busca.get('columns')!.split(',').map(c => desaspar(c.trim()))
    else {
      colunas = Object.keys(linhas[0] ?? {})
      const mesma = (l: object) => Object.keys(l).length === colunas.length && colunas.every(c => c in l)
      if (!linhas.every(mesma)) throw erro(400, 'PGRST102', 'All object keys must match')
    }
    this.conferirColunas(rel, colunas)

    let conflito = ''
    const resolucao = ctx.prefer.resolution
    if (resolucao === 'merge-duplicates' || resolucao === 'ignore-duplicates') {
      const alvo = busca.get('on_conflict')?.split(',').map(c => c.trim()) ?? rel.chave
      this.conferirColunas(rel, alvo)
      const set = colunas.map(c => `${ident(c)} = excluded.${ident(c)}`).join(', ')
      conflito =
        ` on conflict (${alvo.map(ident).join(', ')})` + (resolucao === 'ignore-duplicates' || !set ? ' do nothing' : ` do update set ${set}`)
    }

    const q = this.qualificada(rel)
    const lista = colunas.map(ident).join(', ')
    const sql = colunas.length
      ? `insert into ${q} as ${ALVO} (${lista}) select ${lista} from json_populate_recordset(null::${q}, $1::json) _${conflito} returning ${this.retorno(ctx)}`
      : `insert into ${q} as ${ALVO} default values${conflito} returning ${this.retorno(ctx)}`
    return this.mutar(sql, colunas.length ? [JSON.stringify(linhas)] : [], 201, ctx)
  }

  private async atualizar(rel: Relacao, ctx: Contexto): Promise<RespostaHttp> {
    const { corpo, busca } = ctx.pedido
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw erro(400, 'PGRST102', 'Empty or invalid json')
    const colunas = Object.keys(corpo)
    if (!colunas.length) throw erro(400, 'PGRST102', 'Empty or invalid json', 'O corpo do PATCH não tem colunas.')
    this.conferirColunas(rel, colunas)
    const p = new Parametros([JSON.stringify(corpo)])
    const where = this.where(lerCondicoes(busca), p)
    const q = this.qualificada(rel)
    const set = colunas.map(c => `${ident(c)} = _.${ident(c)}`).join(', ')
    const sql = `update ${q} as ${ALVO} set ${set} from (select * from json_populate_record(null::${q}, $1::json)) _${where} returning ${this.retorno(ctx)}`
    return this.mutar(sql, p.valores, 200, ctx)
  }

  private async excluir(rel: Relacao, ctx: Contexto): Promise<RespostaHttp> {
    const p = new Parametros()
    const where = this.where(lerCondicoes(ctx.pedido.busca), p)
    return this.mutar(`delete from ${this.qualificada(rel)} as ${ALVO}${where} returning ${this.retorno(ctx)}`, p.valores, 200, ctx)
  }

  /**
   * Executa a gravação numa transação. Sem return=representation usa "RETURNING 1"
   * (como o PostgREST): assim não exige permissão de leitura na linha gravada.
   */
  private async mutar(sql: string, valores: unknown[], statusComCorpo: number, ctx: Contexto): Promise<RespostaHttp> {
    const representacao = ctx.prefer.return === 'representation'
    const r = await this.comPapel(ctx, async tx => {
      const { rows } = await tx.query<Agregado>(
        `with pgrst_fonte as (${sql}) select ${representacao ? this.agregado(ctx) : 'count(*)::int as total'} from pgrst_fonte _postgrest_t`,
        valores,
      )
      // single() numa gravação: mais de uma linha afetada desfaz tudo.
      if (ctx.objeto && rows[0].total !== 1) throw this.erroObjeto(rows[0].total)
      return rows[0]
    })
    const cabecalhos = { 'content-range': `${r.total ? `0-${r.total - 1}` : '*'}/*` }
    if (!representacao) return respostaVazia(statusComCorpo === 201 ? 201 : 204, cabecalhos)
    if (ctx.objeto) return { ...respostaJson(statusComCorpo, undefined, cabecalhos), corpo: r.primeiro! }
    return { ...respostaJson(statusComCorpo, undefined, cabecalhos), corpo: r.corpo! }
  }

  // ---------------------------------------------------------------------- rpc

  private async chamarFuncao(nome: string, ctx: Contexto): Promise<RespostaHttp> {
    const { pedido } = ctx
    let args: Record<string, unknown>
    if (pedido.metodo === 'POST') {
      if (pedido.corpo !== null && pedido.corpo !== undefined && (typeof pedido.corpo !== 'object' || Array.isArray(pedido.corpo)))
        throw erro(400, 'PGRST102', 'Empty or invalid json')
      args = (pedido.corpo as Record<string, unknown>) ?? {}
      if ([...pedido.busca.keys()].some(k => k !== 'select')) throw naoSimulado('filtros sobre o resultado de rpc')
    } else {
      args = Object.fromEntries([...pedido.busca].filter(([k]) => !PARAMS_RESERVADOS.has(k)))
    }
    const chaves = Object.keys(args)
    const f = (this.funcoes.get(nome) ?? []).find(
      f => chaves.every(k => f.args.some(a => a.nome === k)) && f.args.every(a => a.temPadrao || chaves.includes(a.nome)),
    )
    if (!f)
      throw erro(
        404,
        'PGRST202',
        `Could not find the function public.${nome}(${[...chaves].sort().join(', ')}) in the schema cache`,
        `Searched for the function public.${nome} with parameters ${[...chaves].sort().join(', ') || 'none'} or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache.`,
      )

    const chamada = `${ident('public')}.${ident(nome)}(${chaves.map(k => `${ident(k)} => _.${ident(k)}`).join(', ')})`
    const registro = `json_to_record($1::json) as _(${chaves.map(k => `${ident(k)} ${f.args.find(a => a.nome === k)!.tipo}`).join(', ')})`
    const valores = chaves.length ? [JSON.stringify(args)] : []

    if (f.retorno === 'void') {
      await this.comPapel(ctx, tx => tx.query(`select ${chamada} is null as ok${chaves.length ? ` from ${registro}` : ''}`, valores))
      return respostaVazia(204)
    }
    const origem = chaves.length ? `${registro} cross join lateral ${chamada} as pgrst_r` : `${chamada} as pgrst_r`
    const r = await this.comPapel(ctx, async tx => {
      const { rows } = await tx.query<Agregado>(
        `select count(*)::int as total, coalesce(json_agg(pgrst_r), '[]')::text as corpo, (json_agg(pgrst_r) -> 0)::text as primeiro from ${origem}`,
        valores,
      )
      return rows[0]
    })
    if (f.conjunto && ctx.objeto) return this.umObjeto(r, {})
    return { ...respostaJson(200, undefined), corpo: f.conjunto ? r.corpo! : (r.primeiro ?? 'null') }
  }

  // --------------------------------------------------------------- auxiliares

  /** Transação com o papel e as claims do token, como o PostgREST faz a cada requisição. */
  private comPapel<T>(ctx: Contexto, fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async tx => {
      await tx.query(
        `select set_config('role', $1, true), set_config('request.jwt.claims', $2, true),
                set_config('request.method', $3, true), set_config('request.path', $4, true)`,
        [ctx.claims.role, JSON.stringify(ctx.claims), ctx.pedido.metodo, ctx.pedido.caminho],
      )
      return fn(tx)
    })
  }

  private qualificada(rel: Relacao) {
    return `${ident('public')}.${ident(rel.nome)}`
  }

  private where(condicoes: Condicao[], p: Parametros) {
    return condicoes.length ? ` where ${condicoes.map(c => sqlCondicao(c, p)).join(' and ')}` : ''
  }

  private retorno(ctx: Contexto) {
    return ctx.prefer.return === 'representation' ? lerSelect(ctx.pedido.busca.get('select'), true) : '1'
  }

  private agregado(ctx: Contexto) {
    const item = ctx.semNulos ? 'json_strip_nulls(row_to_json(_postgrest_t))' : '_postgrest_t'
    return `count(*)::int as total, coalesce(json_agg(${item}), '[]')::text as corpo, (json_agg(${item}) -> 0)::text as primeiro`
  }

  private conferirColunas(rel: Relacao, colunas: string[]) {
    for (const c of colunas)
      if (!rel.colunas.has(c)) throw erro(400, 'PGRST204', `Could not find the '${c}' column of '${rel.nome}' in the schema cache`)
  }

  private erroObjeto(total: number) {
    return erro(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned', `The result contains ${total} rows`)
  }

  private umObjeto(r: Agregado, cabecalhos: Record<string, string>): RespostaHttp {
    if (r.total !== 1) {
      const e = this.erroObjeto(r.total)
      return respostaJson(e.status, e.corpo)
    }
    return { ...respostaJson(200, undefined, { ...cabecalhos, 'content-type': 'application/vnd.pgrst.object+json; charset=utf-8' }), corpo: r.primeiro! }
  }
}

interface Contexto {
  pedido: PedidoHttp
  claims: Claims
  prefer: Record<string, string>
  objeto: boolean
  semNulos: boolean
}

interface Agregado {
  total: number
  corpo?: string | null
  primeiro?: string | null
}
