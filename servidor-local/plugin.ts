import type { Plugin } from 'vite'
import { criarAdaptador } from './http.ts'
import { CHAVE_ANON_LOCAL, SupabaseLocal } from './supabase-local.ts'

/** Caminho onde o "Supabase" local fica servido, no mesmo endereço do sistema. */
const PREFIXO = '/sb'

/**
 * Servidor local de teste: o "Supabase" (banco real em PGlite + Auth, REST e tempo real)
 * roda dentro do servidor de desenvolvimento, para celular e computador verem os mesmos
 * dados pelo Wi-Fi sem conta na nuvem. O banco fica em servidor-local/banco/.
 * NÃO usar com dados reais: é um único processo, sem backup.
 */
export function supabaseLocal(pasta = process.env.GALPAO_BANCO_LOCAL || 'servidor-local/banco'): Plugin {
  // O app lê estas variáveis: aponta para /sb no mesmo endereço em que foi aberto.
  process.env.VITE_SUPABASE_URL = PREFIXO
  process.env.VITE_SUPABASE_ANON_KEY = CHAVE_ANON_LOCAL

  return {
    name: 'supabase-local',
    apply: 'serve',
    async configureServer(server) {
      const log = server.config.logger
      const supabase = await SupabaseLocal.criar({
        pasta,
        confirmarEmail: false,
        // Sem servidor de e-mail: o link aparece no terminal.
        aoEnviarEmail: e => log.info(`\n  E-mail para ${e.para} (${e.tipo === 'recovery' ? 'nova senha' : 'confirmação'}):\n  ${e.link}\n`),
      })
      const adaptador = criarAdaptador(supabase, PREFIXO)

      server.middlewares.use(PREFIXO, (req, res) => {
        adaptador.http(req, res).catch(e => {
          res.writeHead(500)
          res.end(String(e))
        })
      })
      // Tempo real; outros upgrades (HMR do Vite) seguem em paz.
      server.httpServer?.on('upgrade', (req, socket, head) => adaptador.upgrade(req, socket, head))
      server.httpServer?.once('close', () => {
        adaptador.fechar()
        supabase.fechar().catch(() => {})
      })

      const [{ n }] = await supabase.sql<{ n: number }>('select count(*)::int as n from auth.users')
      server.httpServer?.once('listening', () => {
        setTimeout(() => {
          log.info(
            `\n  Servidor local de teste ativo (banco em ${pasta}).` +
              (supabase.migracoesNovas.length ? `\n  Migrações aplicadas agora: ${supabase.migracoesNovas.join(', ')}` : '') +
              (n === 0
                ? '\n  Nenhuma conta ainda: abra o sistema e use "Criar conta". Dá para começar com dados de exemplo.\n'
                : `\n  ${n} conta(s) cadastrada(s).\n`),
          )
        }, 50)
      })
    },
  }
}
