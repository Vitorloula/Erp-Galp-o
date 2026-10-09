/** Requisição HTTP já separada do transporte (servidor Node, Vite ou interceptação do Playwright). */
export interface PedidoHttp {
  metodo: string
  /** Caminho a partir da raiz da API, ex.: /rest/v1/produtos */
  caminho: string
  busca: URLSearchParams
  cabecalhos: Record<string, string | undefined>
  corpo: unknown
  /** Endereço público da raiz da API (para montar links de e-mail), ex.: http://192.168.0.10:5173/sb */
  base?: string
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

/** Conteúdo do token (JWT), no mesmo formato do Supabase Auth. */
export interface Claims {
  role: 'anon' | 'authenticated'
  sub?: string
  email?: string
  exp?: number
  [campo: string]: unknown
}

export const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-expose-headers': 'content-range, content-profile, location, x-supabase-api-version',
}

export function respostaJson(status: number, corpo: unknown, cabecalhos: Record<string, string> = {}): RespostaHttp {
  return {
    status,
    cabecalhos: { ...CORS, 'content-type': 'application/json; charset=utf-8', ...cabecalhos },
    corpo: corpo === undefined ? '' : JSON.stringify(corpo),
  }
}

export function respostaVazia(status: number, cabecalhos: Record<string, string> = {}): RespostaHttp {
  return { status, cabecalhos: { ...CORS, ...cabecalhos }, corpo: '' }
}

/** Identificador SQL entre aspas (escapa aspas internas). */
export const ident = (nome: string) => '"' + nome.replaceAll('"', '""') + '"'
