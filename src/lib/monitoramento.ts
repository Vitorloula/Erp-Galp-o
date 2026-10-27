import { sb } from './dados/cliente'

interface ContextoMonitoramento {
  empresaId?: string | null
  lojaId?: string | null
  usuarioId?: string | null
}

export interface ErroLocal {
  em: string
  mensagem: string
  stack?: string
  url: string
  userAgent: string
}

const CHAVE = 'galpao-erros-recentes'
const MAX_LOCAIS = 20
const IGNORAR = [
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications',
  'Script error.',
  'Failed to fetch',
  'Load failed',
]

let contexto: ContextoMonitoramento = {}
let ultimo = { mensagem: '', em: 0 }
let instalado = false

/** Chamado pelo layout quando a empresa/loja/usuário ativos mudam. */
export function configurarMonitoramento(c: ContextoMonitoramento) {
  contexto = c
}

function guardarLocal(erro: ErroLocal) {
  try {
    const atuais = lerErrosRecentes()
    localStorage.setItem(CHAVE, JSON.stringify([erro, ...atuais].slice(0, MAX_LOCAIS)))
  } catch {
    // Sem armazenamento: o erro ainda vai para o servidor, se houver sessão.
  }
}

export function lerErrosRecentes(): ErroLocal[] {
  try {
    const bruto = localStorage.getItem(CHAVE)
    return bruto ? (JSON.parse(bruto) as ErroLocal[]) : []
  } catch {
    return []
  }
}

export function limparErrosRecentes() {
  try {
    localStorage.removeItem(CHAVE)
  } catch {
    // ignora
  }
}

function deveIgnorar(mensagem: string) {
  return IGNORAR.some(i => mensagem.includes(i))
}

/** Remove query/hash: o link de convite carrega o token no hash e não vai para o log. */
function urlSegura(): string {
  try {
    const url = new URL(window.location.href)
    return `${url.origin}${url.pathname}`
  } catch {
    return window.location.origin
  }
}

/**
 * Registra um erro não tratado para o suporte do piloto.
 * Nunca lança: monitoramento não pode derrubar a operação da loja.
 */
export function registrarErro(mensagem: string, stack?: string) {
  try {
    if (!mensagem || deveIgnorar(mensagem)) return
    const agora = Date.now()
    if (ultimo.mensagem === mensagem && agora - ultimo.em < 5000) return
    ultimo = { mensagem, em: agora }

    const erro: ErroLocal = {
      em: new Date().toISOString(),
      mensagem: mensagem.slice(0, 2000),
      stack: stack?.slice(0, 8000),
      url: urlSegura(),
      userAgent: navigator.userAgent,
    }
    guardarLocal(erro)

    if (!contexto.usuarioId) return
    void sb
      .from('erros_cliente')
      .insert({
        empresa_id: contexto.empresaId ?? null,
        loja_id: contexto.lojaId ?? null,
        usuario_id: contexto.usuarioId,
        mensagem: erro.mensagem,
        stack: erro.stack ?? null,
        url: erro.url,
        user_agent: erro.userAgent,
      })
      .then(() => undefined, () => undefined)
  } catch {
    // Monitoramento silencioso.
  }
}

/** Instala os ouvintes globais uma única vez. */
export function instalarMonitoramento() {
  if (instalado) return
  instalado = true

  window.addEventListener('error', evento => {
    const erro = evento.error as Error | undefined
    registrarErro(erro?.message || evento.message, erro?.stack)
  })

  window.addEventListener('unhandledrejection', evento => {
    const motivo = evento.reason
    const mensagem = motivo instanceof Error ? motivo.message : typeof motivo === 'string' ? motivo : 'Promise rejeitada sem mensagem'
    const stack = motivo instanceof Error ? motivo.stack : undefined
    registrarErro(mensagem, stack)
  })
}

/** Texto pronto para colar no suporte (sem enviar nada automaticamente). */
export function diagnosticoParaSuporte(extra: Record<string, string | number | boolean> = {}): string {
  const linhas = [
    `Sistema: ${import.meta.env.VITE_NOME_SISTEMA || 'Controle de Estoque'}`,
    `URL: ${urlSegura()}`,
    `Quando: ${new Date().toISOString()}`,
    `Online: ${navigator.onLine ? 'sim' : 'não'}`,
    `Tela: ${window.screen.width}x${window.screen.height}`,
    `Navegador: ${navigator.userAgent}`,
    ...Object.entries(extra).map(([k, v]) => `${k}: ${v}`),
    '',
    'Últimos erros locais:',
    ...lerErrosRecentes().slice(0, 5).map(e => `- ${e.em} ${e.mensagem}`),
  ]
  return linhas.join('\n')
}
