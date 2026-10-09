import type { Page, Route } from '@playwright/test'
import { SupabaseLocal, type PedidoHttp } from '../../servidor-local/nucleo'

/**
 * Supabase simulado para os testes: o mesmo núcleo do servidor local de teste
 * (servidor-local/nucleo.ts), ligado ao navegador pela interceptação do Playwright.
 */
export const URL_SUPABASE = 'http://supabase.test'

export class SupabaseFalso extends SupabaseLocal {
  /** Simula queda de rede para as consultas ao banco. */
  semRede = false

  constructor() {
    super({
      confirmarEmail: true,
      tempoRealAutomatico: false, // nos testes, o "outro aparelho" avisa quando quiser
      usuarios: [
        { id: '00000000-0000-4000-8000-000000000001', email: 'admin@galpao.test', senha: 'admin123', nome: 'Ana Admin', papel: 'admin', criado_em: '2026-01-01T10:00:00Z' },
        { id: '00000000-0000-4000-8000-000000000002', email: 'joao@galpao.test', senha: 'joao123', nome: 'João Operador', papel: 'operador', criado_em: '2026-02-01T10:00:00Z' },
        { id: '00000000-0000-4000-8000-000000000003', email: 'carlos@galpao.test', senha: 'carlos123', nome: 'Carlos Novo', papel: 'pendente', criado_em: '2026-09-30T10:00:00Z' },
      ],
    })
  }

  async instalar(page: Page) {
    await page.route(`${URL_SUPABASE}/**`, rota => this.tratar(rota))
    await page.routeWebSocket(/supabase\.test\/realtime/, ws => this.conectar({ enviar: m => ws.send(m), aoReceber: cb => ws.onMessage(m => cb(String(m))) }))
  }

  /** Requisições ao servidor, na ordem em que chegaram. */
  chamadas(metodo: string, caminho: string | RegExp): PedidoHttp[] {
    return this.requisicoes.filter(r => r.metodo === metodo && (typeof caminho === 'string' ? r.caminho === caminho : caminho.test(r.caminho)))
  }

  private async tratar(rota: Route) {
    const req = rota.request()
    const url = new URL(req.url())
    if (this.semRede && url.pathname.startsWith('/rest/v1/')) return rota.abort('internetdisconnected')
    const resposta = await this.atender({
      metodo: req.method(),
      caminho: url.pathname,
      busca: url.searchParams,
      cabecalhos: req.headers(),
      corpo: req.postData() ? JSON.parse(req.postData()!) : null,
    })
    return rota.fulfill({ status: resposta.status, headers: resposta.cabecalhos, body: resposta.corpo })
  }
}
