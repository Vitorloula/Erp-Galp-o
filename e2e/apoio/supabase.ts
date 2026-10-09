import type { BrowserContext, Page, Route } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { CHAVE_ANON_LOCAL, SupabaseLocal, type PedidoHttp } from '../../servidor-local/supabase-local.ts'
import type { Papel } from '../../src/lib/tipos.ts'

/**
 * Os testes de ponta a ponta usam o MESMO "Supabase" local do servidor de desenvolvimento
 * (banco real em PGlite, com as migrações de supabase/migrations), ligado ao navegador pela
 * interceptação do Playwright. Um banco por processo de teste; cada teste cria a própria
 * empresa — e o isolamento entre empresas (RLS) garante que um teste não vê o outro.
 */
export const URL_SUPABASE = 'http://supabase.test'
export const CHAVE_ANON = CHAVE_ANON_LOCAL
/** Senha das contas criadas pelos testes. */
export const SENHA_TESTE = 'senha-de-teste-1'

export function criarServidor() {
  return SupabaseLocal.criar({ confirmarEmail: true, chaveAnon: CHAVE_ANON })
}

/** Ligação de um teste (um contexto do navegador) com o servidor compartilhado. */
export class ConexaoTeste {
  /** Requisições deste teste, na ordem em que chegaram. */
  readonly requisicoes: PedidoHttp[] = []
  /** Rotas que o app chamou e o servidor não conhece. */
  readonly inesperadas: string[] = []
  /** Simula queda de rede para as consultas ao banco (a autenticação continua). */
  semRede = false
  /** Executa a gravação no servidor, mas a resposta "se perde" no caminho (uma vez). */
  perderProximaResposta: RegExp | null = null

  constructor(readonly servidor: SupabaseLocal) {}

  async instalar(context: BrowserContext) {
    await context.route(`${URL_SUPABASE}/**`, rota => this.tratar(rota))
    await context.routeWebSocket(/supabase\.test\/realtime/, ws =>
      this.servidor.conectar({
        enviar: m => ws.send(m),
        aoReceber: cb => ws.onMessage(m => cb(String(m))),
        aoFechar: cb => ws.onClose(() => cb()),
      }),
    )
  }

  chamadas(metodo: string, caminho: string | RegExp): PedidoHttp[] {
    return this.requisicoes.filter(r => r.metodo === metodo && (typeof caminho === 'string' ? r.caminho === caminho : caminho.test(r.caminho)))
  }

  private async tratar(rota: Route) {
    const req = rota.request()
    const url = new URL(req.url())
    if (this.semRede && url.pathname.startsWith('/rest/v1/')) return rota.abort('internetdisconnected')
    const pedido: PedidoHttp = {
      metodo: req.method(),
      caminho: url.pathname,
      busca: url.searchParams,
      cabecalhos: req.headers(),
      corpo: req.postData() ? JSON.parse(req.postData()!) : null,
      base: URL_SUPABASE,
    }
    if (pedido.metodo !== 'OPTIONS') this.requisicoes.push(pedido)
    const antes = this.servidor.inesperadas.length
    const resposta = await this.servidor.atender(pedido)
    this.inesperadas.push(...this.servidor.inesperadas.slice(antes))
    if (this.perderProximaResposta?.test(`${pedido.metodo} ${pedido.caminho}`)) {
      this.perderProximaResposta = null
      return rota.abort('connectionreset') // gravou no banco, mas o app não recebeu a resposta
    }
    return rota.fulfill({ status: resposta.status, headers: resposta.cabecalhos, body: resposta.corpo })
  }
}

export interface Conta {
  usuarioId: string
  email: string
  nome: string
}

export async function criarConta(servidor: SupabaseLocal, nome: string, prefixo = 'pessoa'): Promise<Conta> {
  const email = `${prefixo}-${randomUUID().slice(0, 8)}@teste.local`
  const usuarioId = await servidor.criarUsuario({ email, senha: SENHA_TESTE, nome })
  return { usuarioId, email, nome }
}

/** Conta nova, dona de uma empresa de exemplo (mesmos dados da antiga demonstração). */
export async function criarDonoComExemplo(servidor: SupabaseLocal, nome = 'Ana Teste') {
  const conta = await criarConta(servidor, nome, 'dono')
  const empresaId = await servidor.comoUsuario(conta.usuarioId, async tx => (await tx.query<{ id: string }>('select public.criar_empresa_exemplo() as id')).rows[0].id)
  return { ...conta, empresaId }
}

/** Coloca alguém na equipe pelo caminho real: convite do dono, aceito pela pessoa. */
export async function adicionarMembro(servidor: SupabaseLocal, donoId: string, empresaId: string, papel: Exclude<Papel, 'dono'>, nome: string): Promise<Conta> {
  const conta = await criarConta(servidor, nome, papel)
  const token = await servidor.comoUsuario(donoId, async tx => (await tx.query<{ t: string }>('select public.criar_convite($1, $2) as t', [empresaId, papel])).rows[0].t)
  await servidor.comoUsuario(conta.usuarioId, tx => tx.query('select public.aceitar_convite($1)', [token]))
  return conta
}

/** Entra no app como a conta, sem passar pela tela de login (sessão gravada no aparelho). */
export async function entrarComo(page: Page, servidor: SupabaseLocal, usuarioId: string) {
  const sessao = await servidor.sessao(usuarioId)
  await page.route('**/__preparar', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>preparando</title>' }))
  await page.goto('/__preparar')
  await page.evaluate(s => localStorage.setItem('galpao-sessao', JSON.stringify(s)), sessao)
  await page.unroute('**/__preparar')
}
