import { criarRepositorioDemo } from '../src/lib/dados/demo'
import type { Repositorio } from '../src/lib/dados/repositorio'
import type { Papel, Produto, ProdutoDados } from '../src/lib/tipos'

/**
 * Supabase simulado: responde às mesmas rotas que o app usa (Auth, PostgREST, RPC
 * e Realtime) no formato da API real, aplicando as permissões do banco
 * (pendente/operador/admin) e as regras de estoque do modo demonstração.
 *
 * Usado em dois lugares:
 *  - testes de ponta a ponta (e2e/supabase/falso.ts), via interceptação do Playwright;
 *  - servidor local de teste (servidor-local/plugin.ts), para celular e computador
 *    compartilharem os dados pelo Wi-Fi sem precisar de conta no Supabase.
 *
 * NÃO é seguro para dados reais: os tokens não são assinados.
 */

export class Memoria implements Storage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  clear() { this.m.clear() }
  getItem(k: string) { return this.m.get(k) ?? null }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  removeItem(k: string) { this.m.delete(k) }
  setItem(k: string, v: string) { this.m.set(k, v) }
}

export interface UsuarioLocal {
  id: string
  email: string
  senha: string
  nome: string
  papel: Papel
  criado_em: string
}

export interface PedidoHttp {
  metodo: string
  /** Caminho a partir da raiz da API, ex.: /rest/v1/produtos */
  caminho: string
  busca: URLSearchParams
  cabecalhos: Record<string, string | undefined>
  corpo: unknown
}

export interface RespostaHttp {
  status: number
  cabecalhos: Record<string, string>
  corpo: string
}

/** Conexão de tempo real (WebSocket) vinda do Playwright ou do servidor Node. */
export interface ConexaoSocket {
  enviar(mensagem: string): void
  aoReceber(cb: (mensagem: string) => void): void
  aoFechar?(cb: () => void): void
}

interface Canal {
  conexao: ConexaoSocket
  topico: string
  joinRef: string
  ids: number[]
  tabelas: string[]
}

export interface OpcoesSupabaseLocal {
  armazenamento?: Storage
  usuarios?: UsuarioLocal[]
  /** true: cadastro exige confirmar o e-mail (como no Supabase na nuvem). */
  confirmarEmail?: boolean
  /** Avisa os aparelhos conectados a cada alteração feita pela API. */
  tempoRealAutomatico?: boolean
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'access-control-expose-headers': 'content-range',
}

const CHAVE_USUARIOS = 'supabase-local-usuarios'

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')

export class SupabaseLocal {
  readonly repo: Repositorio
  readonly requisicoes: PedidoHttp[] = []
  readonly inesperadas: string[] = []
  readonly canais: Canal[] = []
  readonly usuarios: UsuarioLocal[]
  private readonly armazenamento: Storage
  private readonly confirmarEmail: boolean
  private readonly tempoRealAutomatico: boolean
  private autorAtual: UsuarioLocal | null = null

  constructor(opcoes: OpcoesSupabaseLocal = {}) {
    this.armazenamento = opcoes.armazenamento ?? new Memoria()
    this.confirmarEmail = opcoes.confirmarEmail ?? true
    this.tempoRealAutomatico = opcoes.tempoRealAutomatico ?? true
    const salvos = this.armazenamento.getItem(CHAVE_USUARIOS)
    this.usuarios = opcoes.usuarios ?? (salvos ? (JSON.parse(salvos) as UsuarioLocal[]) : [])
    this.repo = criarRepositorioDemo(this.armazenamento, {
      autor: () => ({ id: this.autorAtual?.id ?? null, nome: this.autorAtual?.nome ?? 'Sistema' }),
    })
  }

  usuario(email: string) {
    return this.usuarios.find(u => u.email === email)!
  }

  /** Grava a lista de usuários (cadastros e liberações sobrevivem a reinícios). */
  salvarUsuarios() {
    this.armazenamento.setItem(CHAVE_USUARIOS, JSON.stringify(this.usuarios))
  }

  /** Avisa os aparelhos conectados que uma tabela mudou (como o Supabase Realtime). */
  emitirMudanca(tabela: string) {
    for (const c of this.canais) {
      if (!c.tabelas.includes(tabela)) continue
      c.conexao.enviar(
        JSON.stringify([c.joinRef, null, c.topico, 'postgres_changes', {
          ids: c.ids,
          data: { type: 'INSERT', schema: 'public', table: tabela, commit_timestamp: new Date().toISOString(), columns: [], record: {}, errors: null },
        }]),
      )
    }
  }

  // ------------------------------------------------------------------ Realtime

  conectar(conexao: ConexaoSocket) {
    conexao.aoReceber(bruta => {
      let mensagem: [string, string, string, string, Record<string, any>]
      try {
        mensagem = JSON.parse(bruta)
      } catch {
        return
      }
      const [joinRef, ref, topico, evento, payload] = mensagem
      if (evento === 'heartbeat') {
        conexao.enviar(JSON.stringify([null, ref, 'phoenix', 'phx_reply', { status: 'ok', response: {} }]))
      } else if (evento === 'phx_join') {
        const filtros: { event: string; schema: string; table: string }[] = payload?.config?.postgres_changes ?? []
        const comIds = filtros.map((f, i) => ({ ...f, id: 1000 + i }))
        this.canais.push({ conexao, topico, joinRef, ids: comIds.map(f => f.id), tabelas: filtros.map(f => f.table) })
        conexao.enviar(JSON.stringify([joinRef, ref, topico, 'phx_reply', { status: 'ok', response: { postgres_changes: comIds } }]))
      } else if (evento === 'phx_leave') {
        this.removerCanais(c => c.conexao === conexao && c.topico === topico)
        conexao.enviar(JSON.stringify([joinRef, ref, topico, 'phx_reply', { status: 'ok', response: {} }]))
      }
    })
    conexao.aoFechar?.(() => this.removerCanais(c => c.conexao === conexao))
  }

  private removerCanais(filtro: (c: Canal) => boolean) {
    for (let i = this.canais.length - 1; i >= 0; i--) if (filtro(this.canais[i])) this.canais.splice(i, 1)
  }

  // ---------------------------------------------------------------------- HTTP

  async atender(pedido: PedidoHttp): Promise<RespostaHttp> {
    if (pedido.metodo === 'OPTIONS') return { status: 204, cabecalhos: CORS, corpo: '' }
    this.requisicoes.push(pedido)
    try {
      if (pedido.caminho.startsWith('/auth/v1/')) return this.auth(pedido)
      if (pedido.caminho.startsWith('/rest/v1/')) return await this.rest(pedido)
    } catch (e) {
      return this.erroBanco((e as Error).message)
    } finally {
      this.autorAtual = null
    }
    this.inesperadas.push(`${pedido.metodo} ${pedido.caminho}`)
    return this.json(404, { message: 'rota não simulada' })
  }

  private json(status: number, corpo: unknown): RespostaHttp {
    return { status, cabecalhos: { ...CORS, 'content-type': 'application/json' }, corpo: corpo === undefined ? '' : JSON.stringify(corpo) }
  }

  private sessao(u: UsuarioLocal) {
    const agora = Math.floor(Date.now() / 1000)
    const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp: agora + 3600, iat: agora })}.assinatura`
    return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: agora + 3600, refresh_token: `refresh-${u.id}`, user: this.usuarioAuth(u) }
  }

  private usuarioAuth(u: UsuarioLocal) {
    return {
      id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email,
      email_confirmed_at: u.criado_em, confirmed_at: u.criado_em, created_at: u.criado_em, updated_at: u.criado_em,
      app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { nome: u.nome }, identities: [],
    }
  }

  private eu(pedido: PedidoHttp): UsuarioLocal | null {
    const token = (pedido.cabecalhos['authorization'] ?? '').replace(/^Bearer /, '')
    try {
      const { sub } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
      return this.usuarios.find(u => u.id === sub) ?? null
    } catch {
      return null
    }
  }

  private auth(pedido: PedidoHttp): RespostaHttp {
    const corpo = (pedido.corpo ?? {}) as Record<string, any>
    const p = pedido.caminho.replace('/auth/v1', '')
    const tipo = pedido.busca.get('grant_type')
    if (p === '/token' && tipo === 'password') {
      const email = String(corpo.email ?? '').trim().toLowerCase()
      const u = this.usuarios.find(x => x.email === email && x.senha === corpo.password)
      if (!u) return this.json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
      return this.json(200, this.sessao(u))
    }
    if (p === '/token' && tipo === 'refresh_token') {
      const u = this.usuarios.find(x => `refresh-${x.id}` === corpo.refresh_token)
      if (!u) return this.json(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' })
      return this.json(200, this.sessao(u))
    }
    if (p === '/signup') {
      const email = String(corpo.email ?? '').trim().toLowerCase()
      if (this.usuarios.some(x => x.email === email))
        return this.json(422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' })
      // Mesma regra do banco: o primeiro usuário vira administrador; os demais esperam liberação.
      const papel: Papel = this.usuarios.some(x => x.papel === 'admin') ? 'pendente' : 'admin'
      const u: UsuarioLocal = { id: crypto.randomUUID(), email, senha: corpo.password, nome: corpo.data?.nome || email.split('@')[0], papel, criado_em: new Date().toISOString() }
      this.usuarios.push(u)
      this.salvarUsuarios()
      if (this.confirmarEmail) return this.json(200, { ...this.usuarioAuth(u), email_confirmed_at: null, confirmed_at: null })
      return this.json(200, this.sessao(u))
    }
    if (p === '/logout') return { status: 204, cabecalhos: CORS, corpo: '' }
    if (p === '/user') {
      const u = this.eu(pedido)
      return u ? this.json(200, this.usuarioAuth(u)) : this.json(401, { code: 401, msg: 'invalid JWT' })
    }
    this.inesperadas.push(`auth ${pedido.caminho}`)
    return this.json(404, { msg: 'rota de auth não simulada' })
  }

  private async rest(pedido: PedidoHttp): Promise<RespostaHttp> {
    const eu = this.eu(pedido)
    this.autorAtual = eu
    const liberado = !!eu && eu.papel !== 'pendente'
    const admin = eu?.papel === 'admin'
    const tabela = pedido.caminho.replace('/rest/v1/', '')
    const q = pedido.busca
    const corpo = (pedido.corpo ?? {}) as Record<string, any>
    const eq = (campo: string) => q.get(campo)?.replace(/^eq\./, '')
    const umObjeto = (pedido.cabecalhos['accept'] ?? '').includes('vnd.pgrst.object')
    const pagina = <T>(lista: T[]) => {
      const offset = Number(q.get('offset') ?? 0)
      const limite = Number(q.get('limit') ?? lista.length)
      return lista.slice(offset, offset + limite)
    }
    const responder = (linhas: unknown[]) => {
      if (umObjeto) {
        if (linhas.length !== 1) return this.json(406, { code: 'PGRST116', details: `The result contains ${linhas.length} rows`, hint: null, message: 'JSON object requested, multiple (or no) rows returned' })
        return this.json(200, linhas[0])
      }
      return this.json(200, linhas)
    }
    const alterou = (t: string) => {
      if (this.tempoRealAutomatico) this.emitirMudanca(t)
    }
    const rls = () => this.json(403, { code: '42501', details: null, hint: null, message: `new row violates row-level security policy for table "${tabela}"` })
    const metodo = pedido.metodo

    if (tabela === 'perfis' && metodo === 'GET') {
      const visiveis = this.usuarios.filter(u => eu && (u.id === eu.id || admin))
      const id = eq('id')
      return responder(visiveis.filter(u => !id || u.id === id).map(({ id, nome, email, papel, criado_em }) => ({ id, nome, email, papel, criado_em })))
    }
    if (tabela === 'perfis' && metodo === 'PATCH') {
      const alvo = this.usuarios.find(u => u.id === eq('id'))
      if (!alvo || !admin || alvo.id === eu!.id) return responder([])
      alvo.papel = corpo.papel
      this.salvarUsuarios()
      return responder([{ id: alvo.id }])
    }

    if (tabela === 'produtos' && metodo === 'GET') return responder(liberado ? pagina(await this.repo.listarProdutos()) : [])
    if (tabela === 'produtos' && metodo === 'POST') {
      if (!liberado) return rls()
      const produto = await this.repo.salvarProduto({ codigo_interno: '', ...corpo } as ProdutoDados)
      alterou('produtos')
      return responder([produto])
    }
    if (tabela === 'produtos' && metodo === 'PATCH') {
      const atual = (await this.repo.listarProdutos()).find(p => p.id === eq('id'))
      if (!atual || !admin) return responder([])
      const { id: _id, criado_em: _c, ...dados } = { ...atual, ...corpo } as Produto
      const produto = await this.repo.salvarProduto(dados, atual.id)
      alterou('produtos')
      return responder([produto])
    }
    if (tabela === 'vw_estoque_lotes' && metodo === 'GET') return responder(liberado ? pagina(await this.repo.listarLotes()) : [])
    if (tabela === 'lotes' && metodo === 'PATCH') {
      if (!admin) return responder([])
      await this.repo.atualizarLote(eq('id')!, corpo as { lote: string; validade: string | null })
      alterou('lotes')
      return responder([{ id: eq('id') }])
    }

    if (tabela === 'movimentacoes' && metodo === 'GET') {
      if (!liberado) return responder([])
      const datas = q.getAll('criado_em')
      const lista = await this.repo.listarMovimentacoes({
        desde: datas.find(d => d.startsWith('gte.'))?.slice(4),
        ate: datas.find(d => d.startsWith('lte.'))?.slice(4),
        produtoId: eq('produto_id'),
        loteId: eq('lote_id'),
        referenciaId: eq('referencia_id') ? Number(eq('referencia_id')) : undefined,
      })
      return responder(pagina(lista))
    }
    if (tabela === 'movimentacoes' && metodo === 'POST') {
      if (!liberado) return rls()
      const id =
        corpo.tipo === 'SAIDA'
          ? await this.repo.registrarSaida({ loteId: corpo.lote_id, quantidade: corpo.quantidade, documento: corpo.documento, observacao: corpo.observacao })
          : await this.repo.registrarCorrecao({ loteId: corpo.lote_id, quantidade: corpo.quantidade, observacao: corpo.observacao, referenciaId: corpo.referencia_id })
      alterou('movimentacoes')
      return responder([{ id }])
    }
    if (tabela === 'rpc/registrar_entrada' && metodo === 'POST') {
      if (!liberado) return rls()
      const id = await this.repo.registrarEntrada({
        produtoId: corpo.p_produto_id, lote: corpo.p_lote ?? '', validade: corpo.p_validade, quantidade: corpo.p_quantidade,
        documento: corpo.p_documento ?? undefined, observacao: corpo.p_observacao ?? undefined,
      })
      alterou('lotes')
      alterou('movimentacoes')
      return this.json(200, id)
    }

    this.inesperadas.push(`${metodo} ${pedido.caminho}`)
    return this.json(404, { message: 'rota não simulada' })
  }

  /** Converte erros das regras de negócio no formato de erro do PostgreSQL/PostgREST. */
  private erroBanco(mensagem: string): RespostaHttp {
    if (/código de barras/.test(mensagem))
      return this.json(409, { code: '23505', details: 'Key (codigo_barras) already exists.', hint: null, message: 'duplicate key value violates unique constraint "produtos_codigo_barras_unico"' })
    if (/código interno/.test(mensagem))
      return this.json(409, { code: '23505', details: 'Key (codigo_interno) already exists.', hint: null, message: 'duplicate key value violates unique constraint "produtos_codigo_interno_unico"' })
    return this.json(400, { code: 'P0001', details: null, hint: null, message: mensagem })
  }
}
