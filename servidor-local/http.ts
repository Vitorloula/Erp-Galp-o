import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import type { TLSSocket } from 'node:tls'
import { WebSocketServer } from 'ws'
import type { SupabaseLocal } from './supabase-local.ts'

/** Liga o SupabaseLocal a um servidor Node (Vite ou avulso): HTTP + WebSocket do tempo real. */

function lerCorpo(req: IncomingMessage): Promise<unknown> {
  return new Promise((ok, falha) => {
    const partes: Buffer[] = []
    req.on('data', p => partes.push(p))
    req.on('error', falha)
    req.on('end', () => {
      const texto = Buffer.concat(partes).toString('utf8')
      try {
        ok(texto ? JSON.parse(texto) : null)
      } catch {
        ok(null)
      }
    })
  })
}

export function criarAdaptador(supabase: SupabaseLocal, prefixo = '') {
  const sockets = new WebSocketServer({ noServer: true })

  return {
    /** Atende uma requisição HTTP. Montado num prefixo (Vite/connect), req.url já vem sem ele. */
    async http(req: IncomingMessage, res: ServerResponse) {
      const url = new URL(req.url ?? '/', 'http://local')
      const metodo = req.method ?? 'GET'
      const protocolo = (req.socket as TLSSocket).encrypted ? 'https' : 'http'
      const resposta = await supabase.atender({
        metodo,
        caminho: url.pathname,
        busca: url.searchParams,
        cabecalhos: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v])),
        corpo: metodo === 'GET' || metodo === 'HEAD' ? null : await lerCorpo(req),
        base: `${protocolo}://${req.headers.host}${prefixo}`,
      })
      res.writeHead(resposta.status, resposta.cabecalhos)
      res.end(resposta.corpo)
    },

    /** Conexão do tempo real. Devolve false para deixar outros upgrades (ex.: HMR do Vite) em paz. */
    upgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
      if (new URL(req.url ?? '/', 'http://local').pathname !== `${prefixo}/realtime/v1/websocket`) return false
      sockets.handleUpgrade(req, socket, head, ws =>
        supabase.conectar({
          enviar: m => ws.readyState === ws.OPEN && ws.send(m),
          aoReceber: cb => ws.on('message', m => cb(String(m))),
          aoFechar: cb => ws.on('close', cb),
        }),
      )
      return true
    },

    fechar() {
      for (const c of sockets.clients) c.terminate()
      sockets.close()
    },
  }
}

/** Servidor HTTP avulso (testes): devolve a URL base, ex.: http://127.0.0.1:53211 */
export async function iniciarServidorHttp(supabase: SupabaseLocal, porta = 0, host = '127.0.0.1') {
  const adaptador = criarAdaptador(supabase)
  const servidor = createServer((req, res) => {
    adaptador.http(req, res).catch(e => {
      res.writeHead(500)
      res.end(String(e))
    })
  })
  servidor.on('upgrade', (req, socket, head) => {
    if (!adaptador.upgrade(req, socket, head)) socket.destroy()
  })
  await new Promise<void>(ok => servidor.listen(porta, host, ok))
  const { port } = servidor.address() as AddressInfo
  return {
    url: `http://${host}:${port}`,
    fechar: () =>
      new Promise<void>(ok => {
        adaptador.fechar()
        servidor.closeAllConnections()
        servidor.close(() => ok())
      }),
  }
}
