import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { IncomingMessage } from 'node:http'
import type { Plugin } from 'vite'
import { WebSocketServer } from 'ws'
import { SupabaseLocal } from './nucleo'

/** Caminho onde o "Supabase" local fica servido, no mesmo endereço do sistema. */
const PREFIXO = '/sb'

/** Storage gravado em arquivo JSON (os dados sobrevivem ao reiniciar o servidor). */
class ArquivoStorage implements Storage {
  private dados: Record<string, string>
  constructor(private readonly arquivo: string) {
    this.dados = existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, 'utf8')) : {}
  }
  get length() { return Object.keys(this.dados).length }
  key(i: number) { return Object.keys(this.dados)[i] ?? null }
  getItem(k: string) { return this.dados[k] ?? null }
  setItem(k: string, v: string) {
    this.dados[k] = v
    this.salvar()
  }
  removeItem(k: string) {
    delete this.dados[k]
    this.salvar()
  }
  clear() {
    this.dados = {}
    this.salvar()
  }
  private salvar() {
    mkdirSync(dirname(this.arquivo), { recursive: true })
    const temporario = this.arquivo + '.tmp'
    writeFileSync(temporario, JSON.stringify(this.dados))
    renameSync(temporario, this.arquivo) // grava inteiro ou nada
  }
}

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

/**
 * Servidor local de teste: imita o Supabase dentro do servidor de desenvolvimento,
 * para celular e computador verem os mesmos dados pelo Wi-Fi, sem conta na nuvem.
 * Os dados ficam em servidor-local/dados.json. NÃO usar com dados reais.
 */
export function supabaseLocal(arquivo = process.env.GALPAO_DADOS_LOCAL || 'servidor-local/dados.json'): Plugin {
  // O app lê estas variáveis: aponta para /sb no mesmo endereço em que foi aberto.
  process.env.VITE_SUPABASE_URL = PREFIXO
  process.env.VITE_SUPABASE_ANON_KEY = 'chave-servidor-local'

  return {
    name: 'galpao-supabase-local',
    apply: 'serve',
    configureServer(server) {
      const supabase = new SupabaseLocal({ armazenamento: new ArquivoStorage(arquivo), confirmarEmail: false })

      server.middlewares.use(PREFIXO, async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://local')
        const resposta = await supabase.atender({
          metodo: req.method ?? 'GET',
          caminho: url.pathname,
          busca: url.searchParams,
          cabecalhos: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v])),
          corpo: req.method === 'GET' ? null : await lerCorpo(req),
        })
        res.writeHead(resposta.status, resposta.cabecalhos)
        res.end(resposta.corpo)
      })

      const sockets = new WebSocketServer({ noServer: true })
      server.httpServer?.on('upgrade', (req, socket, head) => {
        if (!req.url?.startsWith(`${PREFIXO}/realtime/`)) return // deixa o resto (HMR do Vite) em paz
        sockets.handleUpgrade(req, socket, head, ws =>
          supabase.conectar({
            enviar: m => ws.readyState === ws.OPEN && ws.send(m),
            aoReceber: cb => ws.on('message', m => cb(String(m))),
            aoFechar: cb => ws.on('close', cb),
          }),
        )
      })

      server.httpServer?.once('listening', () => {
        setTimeout(() => {
          const n = supabase.usuarios.length
          server.config.logger.info(
            `\n  Servidor local de teste ativo (dados em ${arquivo}).\n` +
              (n === 0
                ? '  Nenhum usuário ainda: abra o sistema e use "Solicitar acesso" — o primeiro vira administrador.\n'
                : `  ${n} usuário(s) cadastrado(s).\n`),
          )
        }, 50)
      })
    },
  }
}
