import type { PGlite, Transaction } from '@electric-sql/pglite'
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { assinarJwt, verificarJwt } from './jwt.ts'
import { respostaJson, respostaVazia, type Claims, type PedidoHttp, type RespostaHttp } from './tipos.ts'

/**
 * Imitação do Supabase Auth (GoTrue) sobre a tabela auth.users do banco local:
 * cadastro, login, renovação de sessão, confirmação de e-mail e troca de senha,
 * com as mesmas rotas, respostas e códigos de erro usados pelo supabase-js.
 */

export interface EmailEnviado {
  para: string
  tipo: 'signup' | 'recovery'
  link: string
  enviado_em: string
}

export interface OpcoesAuth {
  /** true: cadastro exige confirmar o e-mail (como no Supabase na nuvem). */
  confirmarEmail: boolean
  /** Chave pública (anon) aceita como "visitante sem login". */
  chaveAnon: string
  aoEnviarEmail?: (email: EmailEnviado) => void
}

interface LinhaUsuario {
  id: string
  email: string
  encrypted_password: string | null
  email_confirmed_at: Date | null
  raw_app_meta_data: Record<string, unknown>
  raw_user_meta_data: Record<string, unknown>
  last_sign_in_at: Date | null
  created_at: Date
  updated_at: Date
}

type Db = PGlite | Transaction

const DURACAO_SESSAO = 3600
/** Como no GoTrue: o mesmo refresh token pode ser reapresentado por alguns segundos (abas concorrentes). */
const TOLERANCIA_REUSO_MS = 10_000
const API_VERSAO = { 'x-supabase-api-version': '2024-01-01' }

function hashSenha(senha: string) {
  const sal = randomBytes(16)
  return `scrypt$${sal.toString('base64url')}$${scryptSync(senha, sal, 32, { N: 4096 }).toString('base64url')}`
}

function conferirSenha(senha: string, salvo: string | null) {
  const [tipo, sal, hash] = (salvo ?? '').split('$')
  if (tipo !== 'scrypt' || !sal || !hash) return false
  const calculado = scryptSync(senha, Buffer.from(sal, 'base64url'), 32, { N: 4096 })
  const esperado = Buffer.from(hash, 'base64url')
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado)
}

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null)
const emailValido = (email: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)

/** Erro no formato do GoTrue (versão de API 2024-01-01, enviada pelo supabase-js). */
function erroAuth(status: number, codigo: string, mensagem: string, extra: Record<string, unknown> = {}) {
  return respostaJson(status, { code: codigo, error_code: codigo, msg: mensagem, message: mensagem, ...extra }, API_VERSAO)
}

export class AuthLocal {
  readonly emails: EmailEnviado[] = []

  private constructor(
    private readonly db: PGlite,
    private readonly segredo: string,
    private readonly opcoes: OpcoesAuth,
  ) {}

  /** O segredo dos tokens fica no próprio banco: quem estava logado continua logado após reiniciar. */
  static async iniciar(db: PGlite, opcoes: OpcoesAuth): Promise<AuthLocal> {
    await db.exec(`create table if not exists auth.servidor_local (chave text primary key, valor text not null)`)
    await db.query(`insert into auth.servidor_local (chave, valor) values ('jwt_secret', $1) on conflict (chave) do nothing`, [
      randomBytes(32).toString('hex'),
    ])
    const { rows } = await db.query<{ valor: string }>(`select valor from auth.servidor_local where chave = 'jwt_secret'`)
    return new AuthLocal(db, rows[0].valor, opcoes)
  }

  /**
   * Quem está chamando a API, a partir do cabeçalho Authorization (como o PostgREST):
   * sem token ou com a chave anon = visitante; token inválido/expirado = 401.
   */
  identificar(autorizacao: string | undefined): { ok: true; claims: Claims } | { ok: false; resposta: RespostaHttp } {
    const r = this.identificarToken((autorizacao ?? '').replace(/^Bearer\s+/i, ''))
    if (r.ok) return r
    const expirado = r.motivo === 'expirado'
    return {
      ok: false,
      resposta: respostaJson(
        401,
        { code: expirado ? 'PGRST303' : 'PGRST301', details: null, hint: null, message: expirado ? 'JWT expired' : 'JWT could not be decoded' },
        { 'www-authenticate': `Bearer error="invalid_token", error_description="${expirado ? 'JWT expired' : 'JWT could not be decoded'}"` },
      ),
    }
  }

  /** Mesma regra para o tempo real, que recebe o token no corpo da mensagem de entrada no canal. */
  identificarToken(token: string | undefined): { ok: true; claims: Claims } | { ok: false; motivo: 'invalido' | 'expirado' } {
    const t = (token ?? '').trim()
    if (!t || t === this.opcoes.chaveAnon) return { ok: true, claims: { role: 'anon' } }
    const r = verificarJwt(t, this.segredo)
    if (r.ok && (r.claims.role === 'anon' || r.claims.role === 'authenticated')) return { ok: true, claims: r.claims as Claims }
    return { ok: false, motivo: r.ok ? 'invalido' : r.motivo }
  }

  /** Cria um usuário direto no banco (sementes e testes). */
  async criarUsuario(dados: { email: string; senha: string; nome?: string; confirmado?: boolean }): Promise<string> {
    const { rows } = await this.db.query<{ id: string }>(
      `insert into auth.users (email, encrypted_password, raw_user_meta_data, email_confirmed_at)
       values ($1, $2, $3, case when $4 then now() end) returning id`,
      [dados.email.trim().toLowerCase(), hashSenha(dados.senha), dados.nome ? { nome: dados.nome } : {}, dados.confirmado ?? true],
    )
    return rows[0].id
  }

  /** Sessão nova para um usuário existente (testes que precisam de um token válido). */
  async sessaoDe(usuarioId: string) {
    return this.sessao(await this.usuarioPorId(this.db, usuarioId))
  }

  /** Rotas /auth/v1/*. Devolve null para rotas não simuladas. */
  async atender(pedido: PedidoHttp): Promise<RespostaHttp | null> {
    const corpo = (pedido.corpo ?? {}) as Record<string, unknown>
    const rota = `${pedido.metodo} ${pedido.caminho.replace(/^\/auth\/v1/, '')}`
    const tipo = pedido.busca.get('grant_type')

    if (rota === 'POST /signup') return this.cadastrar(corpo, pedido)
    if (rota === 'POST /token' && tipo === 'password') return this.entrar(corpo)
    if (rota === 'POST /token' && tipo === 'refresh_token') return this.renovar(String(corpo.refresh_token ?? ''))
    if (rota === 'GET /user') return this.comUsuario(pedido, async u => respostaJson(200, this.usuarioJson(u), API_VERSAO))
    if (rota === 'PUT /user') return this.comUsuario(pedido, u => this.alterarUsuario(u, corpo))
    if (rota === 'POST /logout') return this.sair(pedido)
    if (rota === 'POST /recover') return this.recuperar(corpo, pedido)
    if (rota === 'GET /verify') return this.verificarLink(pedido)
    return null
  }

  // ------------------------------------------------------------------ rotas

  private async cadastrar(corpo: Record<string, unknown>, pedido: PedidoHttp) {
    const email = String(corpo.email ?? '').trim().toLowerCase()
    const senha = String(corpo.password ?? '')
    if (!emailValido(email)) return erroAuth(400, 'validation_failed', 'Unable to validate email address: invalid format')
    if (senha.length < 6)
      return erroAuth(422, 'weak_password', 'Password should be at least 6 characters.', { weak_password: { reasons: ['length'] } })
    const metadados = typeof corpo.data === 'object' && corpo.data ? (corpo.data as Record<string, unknown>) : {}

    const existente = await this.usuarioPorEmail(this.db, email)
    if (existente) {
      if (!this.opcoes.confirmarEmail) return erroAuth(422, 'user_already_exists', 'User already registered')
      // Com confirmação ligada o GoTrue não revela que o e-mail existe: devolve um usuário "falso".
      if (existente.email_confirmed_at) return respostaJson(200, { ...this.usuarioJson({ ...existente, id: randomUUID() }), identities: [] }, API_VERSAO)
      await this.enviarLink(existente, 'signup', pedido)
      return respostaJson(200, this.usuarioJson(existente), API_VERSAO)
    }

    const { rows } = await this.db.query<LinhaUsuario>(
      `insert into auth.users (email, encrypted_password, raw_user_meta_data, email_confirmed_at)
       values ($1, $2, $3, case when $4 then null else now() end) returning *`,
      [email, hashSenha(senha), metadados, this.opcoes.confirmarEmail],
    )
    const u = rows[0]
    if (this.opcoes.confirmarEmail) {
      await this.enviarLink(u, 'signup', pedido)
      return respostaJson(200, { ...this.usuarioJson(u), confirmation_sent_at: new Date().toISOString() }, API_VERSAO)
    }
    return respostaJson(200, await this.sessao(u), API_VERSAO)
  }

  private async entrar(corpo: Record<string, unknown>) {
    const u = await this.usuarioPorEmail(this.db, String(corpo.email ?? '').trim().toLowerCase())
    if (!u || !conferirSenha(String(corpo.password ?? ''), u.encrypted_password))
      return erroAuth(400, 'invalid_credentials', 'Invalid login credentials')
    if (!u.email_confirmed_at) return erroAuth(400, 'email_not_confirmed', 'Email not confirmed')
    await this.db.query(`update auth.users set last_sign_in_at = now() where id = $1`, [u.id])
    return respostaJson(200, await this.sessao({ ...u, last_sign_in_at: new Date() }), API_VERSAO)
  }

  private async renovar(token: string) {
    return this.db.transaction(async tx => {
      const { rows } = await tx.query<{ user_id: string; session_id: string; revoked: boolean; updated_at: Date }>(
        `select user_id, session_id, revoked, updated_at from auth.refresh_tokens where token = $1 for update`,
        [token],
      )
      const t = rows[0]
      if (!t) return erroAuth(400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found')
      if (t.revoked && Date.now() - new Date(t.updated_at).getTime() > TOLERANCIA_REUSO_MS)
        return erroAuth(400, 'refresh_token_already_used', 'Invalid Refresh Token: Already Used')
      if (!t.revoked) await tx.query(`update auth.refresh_tokens set revoked = true, updated_at = now() where token = $1`, [token])
      return respostaJson(200, await this.sessao(await this.usuarioPorId(tx, t.user_id), tx, t.session_id), API_VERSAO)
    })
  }

  private async alterarUsuario(u: LinhaUsuario, corpo: Record<string, unknown>) {
    if (corpo.email !== undefined && String(corpo.email).trim().toLowerCase() !== u.email)
      return erroAuth(422, 'not_implemented', 'Troca de e-mail não é simulada pelo servidor local.')
    if (corpo.password !== undefined) {
      const senha = String(corpo.password)
      if (senha.length < 6)
        return erroAuth(422, 'weak_password', 'Password should be at least 6 characters.', { weak_password: { reasons: ['length'] } })
      if (conferirSenha(senha, u.encrypted_password))
        return erroAuth(422, 'same_password', 'New password should be different from the old password.')
      await this.db.query(`update auth.users set encrypted_password = $2, updated_at = now() where id = $1`, [u.id, hashSenha(senha)])
    }
    if (typeof corpo.data === 'object' && corpo.data)
      await this.db.query(`update auth.users set raw_user_meta_data = raw_user_meta_data || $2::jsonb, updated_at = now() where id = $1`, [u.id, corpo.data])
    return respostaJson(200, this.usuarioJson(await this.usuarioPorId(this.db, u.id)), API_VERSAO)
  }

  /** Sair encerra a sessão (apaga os refresh tokens): só deste aparelho, dos outros ou de todos. */
  private async sair(pedido: PedidoHttp) {
    const quem = this.identificar(pedido.cabecalhos['authorization'])
    if (!quem.ok || !quem.claims.sub) return respostaVazia(204)
    const escopo = pedido.busca.get('scope') ?? 'global'
    const sessao = String(quem.claims.session_id ?? '')
    if (escopo === 'local') await this.db.query(`delete from auth.refresh_tokens where session_id::text = $1`, [sessao])
    else if (escopo === 'others') await this.db.query(`delete from auth.refresh_tokens where user_id = $1 and session_id::text <> $2`, [quem.claims.sub, sessao])
    else await this.db.query(`delete from auth.refresh_tokens where user_id = $1`, [quem.claims.sub])
    return respostaVazia(204)
  }

  private async recuperar(corpo: Record<string, unknown>, pedido: PedidoHttp) {
    const u = await this.usuarioPorEmail(this.db, String(corpo.email ?? '').trim().toLowerCase())
    if (u) await this.enviarLink(u, 'recovery', pedido)
    return respostaJson(200, {}, API_VERSAO) // não revela se o e-mail existe
  }

  /** Link do e-mail: confirma/autoriza e volta para o app com a sessão no fragmento da URL (fluxo implícito). */
  private async verificarLink(pedido: PedidoHttp) {
    const tipo = pedido.busca.get('type')
    const coluna = tipo === 'signup' ? 'confirmation_token' : tipo === 'recovery' ? 'recovery_token' : null
    const destino = pedido.busca.get('redirect_to') || (pedido.base ? new URL(pedido.base).origin + '/' : '/')
    const token = pedido.busca.get('token') ?? ''
    const { rows } = coluna
      ? await this.db.query<LinhaUsuario>(
          `update auth.users set ${coluna} = null, email_confirmed_at = coalesce(email_confirmed_at, now()), last_sign_in_at = now()
           where ${coluna} = $1 and $1 <> '' returning *`,
          [token],
        )
      : { rows: [] }
    if (!rows[0]) {
      const erro = new URLSearchParams({ error: 'access_denied', error_code: 'otp_expired', error_description: 'Email link is invalid or has expired' })
      return respostaVazia(303, { location: `${destino}#${erro}` })
    }
    const s = await this.sessao(rows[0])
    const fragmento = new URLSearchParams({
      access_token: s.access_token,
      expires_at: String(s.expires_at),
      expires_in: String(s.expires_in),
      refresh_token: s.refresh_token,
      token_type: 'bearer',
      type: tipo!,
    })
    return respostaVazia(303, { location: `${destino}#${fragmento}` })
  }

  // -------------------------------------------------------------- auxiliares

  private async comUsuario(pedido: PedidoHttp, fn: (u: LinhaUsuario) => Promise<RespostaHttp>) {
    const token = (pedido.cabecalhos['authorization'] ?? '').replace(/^Bearer\s+/i, '')
    const r = verificarJwt(token, this.segredo)
    if (!r.ok || typeof r.claims.sub !== 'string')
      return erroAuth(403, 'bad_jwt', r.ok ? 'invalid claim: missing sub claim' : `invalid JWT: unable to parse or verify signature, token is ${r.motivo === 'expirado' ? 'expired' : 'invalid'}`)
    const { rows } = await this.db.query<LinhaUsuario>(`select * from auth.users where id = $1`, [r.claims.sub])
    if (!rows[0]) return erroAuth(403, 'user_not_found', 'User from sub claim in JWT does not exist')
    const { rows: sessoes } = await this.db.query(`select 1 from auth.refresh_tokens where session_id::text = $1 limit 1`, [String(r.claims.session_id ?? '')])
    if (!sessoes.length) return erroAuth(403, 'session_not_found', 'Session from session_id claim in JWT does not exist')
    return fn(rows[0])
  }

  private async enviarLink(u: LinhaUsuario, tipo: EmailEnviado['tipo'], pedido: PedidoHttp) {
    const token = randomBytes(24).toString('hex')
    await this.db.query(`update auth.users set ${tipo === 'signup' ? 'confirmation_token' : 'recovery_token'} = $2 where id = $1`, [u.id, token])
    const busca = new URLSearchParams({ token, type: tipo })
    const voltar = pedido.busca.get('redirect_to')
    if (voltar) busca.set('redirect_to', voltar)
    const email: EmailEnviado = { para: u.email, tipo, link: `${pedido.base ?? ''}/auth/v1/verify?${busca}`, enviado_em: new Date().toISOString() }
    this.emails.push(email)
    this.opcoes.aoEnviarEmail?.(email)
  }

  private async usuarioPorEmail(db: Db, email: string) {
    return (await db.query<LinhaUsuario>(`select * from auth.users where email = $1`, [email])).rows[0] ?? null
  }

  private async usuarioPorId(db: Db, id: string) {
    const u = (await db.query<LinhaUsuario>(`select * from auth.users where id = $1`, [id])).rows[0]
    if (!u) throw new Error('Usuário não encontrado: ' + id)
    return u
  }

  /** Sessão nova (login) ou continuação da mesma sessão (renovação), como no GoTrue. */
  private async sessao(u: LinhaUsuario, db: Db = this.db, sessionId: string = randomUUID()) {
    const agora = Math.floor(Date.now() / 1000)
    const expira = agora + DURACAO_SESSAO
    const refresh = randomBytes(24).toString('base64url')
    await db.query(`insert into auth.refresh_tokens (token, user_id, session_id) values ($1, $2, $3)`, [refresh, u.id, sessionId])
    const claims = {
      aud: 'authenticated', exp: expira, iat: agora, iss: 'supabase-local', sub: u.id, email: u.email, phone: '',
      app_metadata: u.raw_app_meta_data, user_metadata: u.raw_user_meta_data, role: 'authenticated',
      aal: 'aal1', amr: [{ method: 'password', timestamp: agora }], session_id: sessionId, is_anonymous: false,
    }
    return {
      access_token: assinarJwt(claims, this.segredo),
      token_type: 'bearer',
      expires_in: DURACAO_SESSAO,
      expires_at: expira,
      refresh_token: refresh,
      user: this.usuarioJson(u),
    }
  }

  private usuarioJson(u: LinhaUsuario) {
    const confirmado = iso(u.email_confirmed_at)
    return {
      id: u.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: u.email,
      email_confirmed_at: confirmado,
      phone: '',
      confirmed_at: confirmado,
      last_sign_in_at: iso(u.last_sign_in_at),
      app_metadata: u.raw_app_meta_data,
      user_metadata: u.raw_user_meta_data,
      identities: [
        {
          identity_id: u.id, id: u.id, user_id: u.id, provider: 'email', email: u.email,
          identity_data: { email: u.email, email_verified: !!confirmado, phone_verified: false, sub: u.id },
          last_sign_in_at: iso(u.last_sign_in_at), created_at: iso(u.created_at), updated_at: iso(u.updated_at),
        },
      ],
      created_at: iso(u.created_at),
      updated_at: iso(u.updated_at),
      is_anonymous: false,
    }
  }
}
