import type { PGlite, Transaction } from '@electric-sql/pglite'
import { AuthLocal, type EmailEnviado } from './auth.ts'
import { abrirBanco, CANAL_TEMPO_REAL } from './banco.ts'
import { PostgrestLocal } from './postgrest.ts'
import { TempoRealLocal } from './tempo-real.ts'
import { respostaJson, respostaVazia, type Claims, type ConexaoSocket, type PedidoHttp, type RespostaHttp } from './tipos.ts'

/**
 * "Supabase" local: banco PostgreSQL de verdade (PGlite) com as migrações de
 * supabase/migrations, mais imitações fiéis das APIs que o app usa — Auth (/auth/v1),
 * PostgREST (/rest/v1, inclusive rpc) e Realtime (WebSocket).
 *
 * Usado em dois lugares:
 *  - testes (vitest e Playwright), com o banco em memória;
 *  - servidor local de teste (npm run dev:servidor), com o banco numa pasta, para
 *    celular e computador compartilharem os dados pelo Wi-Fi sem conta na nuvem.
 *
 * Não substitui o Supabase em produção: é um único processo, sem backup.
 */

export const CHAVE_ANON_LOCAL = 'chave-anon-servidor-local'

export interface OpcoesSupabaseLocal {
  /** Pasta do banco (persistente). Sem pasta, o banco fica em memória. */
  pasta?: string
  /** true (padrão): cadastro exige confirmar o e-mail, como no Supabase na nuvem. */
  confirmarEmail?: boolean
  chaveAnon?: string
  /** Chamado a cada e-mail que o Supabase enviaria (confirmação, redefinição de senha). */
  aoEnviarEmail?: (email: EmailEnviado) => void
}

export type { ConexaoSocket, EmailEnviado, PedidoHttp, RespostaHttp }

export class SupabaseLocal {
  /** Requisições recebidas, na ordem (os testes conferem o que o app pediu). */
  readonly requisicoes: PedidoHttp[] = []
  /** Rotas pedidas pelo app que o servidor local não conhece (devem ficar vazias). */
  readonly inesperadas: string[] = []

  private constructor(
    readonly db: PGlite,
    readonly auth: AuthLocal,
    readonly rest: PostgrestLocal,
    readonly tempoReal: TempoRealLocal,
    readonly chaveAnon: string,
    /** Migrações aplicadas ao abrir (vazio quando o banco já estava em dia). */
    readonly migracoesNovas: string[],
  ) {}

  static async criar(opcoes: OpcoesSupabaseLocal = {}): Promise<SupabaseLocal> {
    const { db, migracoesNovas } = await abrirBanco(opcoes.pasta)
    const chaveAnon = opcoes.chaveAnon ?? CHAVE_ANON_LOCAL
    const auth = await AuthLocal.iniciar(db, { confirmarEmail: opcoes.confirmarEmail ?? true, chaveAnon, aoEnviarEmail: opcoes.aoEnviarEmail })
    const rest = await PostgrestLocal.iniciar(db)
    const tempoReal = new TempoRealLocal(db, token => auth.identificarToken(token))
    await db.listen(CANAL_TEMPO_REAL, aviso => tempoReal.aviso(aviso))
    return new SupabaseLocal(db, auth, rest, tempoReal, chaveAnon, migracoesNovas)
  }

  async atender(pedido: PedidoHttp): Promise<RespostaHttp> {
    if (pedido.metodo === 'OPTIONS') return respostaVazia(204)
    this.requisicoes.push(pedido)
    const rota = `${pedido.metodo} ${pedido.caminho}`
    try {
      // Como no Supabase, toda chamada precisa da chave pública — exceto o link de e-mail.
      if (rota !== 'GET /auth/v1/verify' && pedido.cabecalhos['apikey'] !== this.chaveAnon)
        return respostaJson(401, { message: 'Invalid API key', hint: 'Double check your Supabase `anon` or `service_role` API key.' })
      if (pedido.caminho.startsWith('/auth/v1/')) {
        const r = await this.auth.atender(pedido)
        if (r) return r
      } else if (pedido.caminho.startsWith('/rest/v1/')) {
        const quem = this.auth.identificar(pedido.cabecalhos['authorization'])
        if (!quem.ok) return quem.resposta
        const r = await this.rest.atender(pedido, quem.claims)
        if (r) return r
      }
    } catch (e) {
      console.error('[servidor local]', rota, e)
      return respostaJson(500, { code: 'LOCAL', details: null, hint: null, message: 'Erro no servidor local: ' + (e as Error).message })
    }
    this.inesperadas.push(rota)
    return respostaJson(404, { message: 'rota não simulada pelo servidor local' })
  }

  conectar(conexao: ConexaoSocket) {
    this.tempoReal.conectar(conexao)
  }

  // --------------------------------------------- utilidades (testes e sementes)

  /** E-mails que o Supabase teria enviado. */
  get emails() {
    return this.auth.emails
  }

  /** SQL como administrador do banco (sem RLS). */
  async sql<T = Record<string, unknown>>(consulta: string, parametros?: unknown[]): Promise<T[]> {
    return (await this.db.query<T>(consulta, parametros)).rows
  }

  /** Executa como um usuário (ou visitante, com null), com RLS — igual a uma chamada da API. */
  async comoUsuario<T>(usuarioId: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
    let claims: Claims = { role: 'anon' }
    if (usuarioId) {
      const [u] = await this.sql<{ email: string }>('select email from auth.users where id = $1', [usuarioId])
      claims = { role: 'authenticated', sub: usuarioId, email: u?.email }
    }
    return this.db.transaction(async tx => {
      await tx.query(`select set_config('role', $1, true), set_config('request.jwt.claims', $2, true)`, [claims.role, JSON.stringify(claims)])
      return fn(tx)
    })
  }

  criarUsuario(dados: { email: string; senha: string; nome?: string; confirmado?: boolean }) {
    return this.auth.criarUsuario(dados)
  }

  /** Sessão válida (tokens) para um usuário, sem passar pela tela de login. */
  sessao(usuarioId: string) {
    return this.auth.sessaoDe(usuarioId)
  }

  async fechar() {
    await this.tempoReal.ocioso()
    await this.db.close()
  }
}
