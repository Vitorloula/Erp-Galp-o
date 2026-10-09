import { createClient } from '@supabase/supabase-js'

const urlConfigurada = import.meta.env.VITE_SUPABASE_URL as string | undefined
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Um caminho relativo (ex.: "/sb", usado pelo servidor local de teste) aponta para o
// mesmo endereço em que o sistema foi aberto: localhost no PC, IP da rede no celular.
const url = urlConfigurada?.startsWith('/') ? new URL(urlConfigurada, window.location.origin).href : urlConfigurada

/** false quando o build foi feito sem VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. */
export const configurado = !!(url && chave)

/**
 * Aberto pelo link de "esqueci minha senha" (o Supabase volta com type=recovery na URL).
 * Lido antes de o cliente processar e limpar a URL.
 */
export const veioDaRecuperacaoDeSenha = /(^#|&)type=recovery(&|$)/.test(window.location.hash)

export const sb = createClient(url || 'http://nao-configurado.invalid', chave || 'nao-configurado', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'galpao-sessao' },
})

export interface ErroBanco {
  message?: string
  code?: string
  details?: string | null
  hint?: string | null
}

/** Traduz erros técnicos do Supabase/PostgreSQL para mensagens claras. */
export function traduzirErro(e: ErroBanco | null | undefined): Error {
  const msg = e?.message ?? 'Erro desconhecido.'
  const txt = `${msg} ${e?.details ?? ''}`
  if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(msg))
    return new Error('Sem conexão com o servidor. Verifique a internet e tente novamente.')
  if (msg === 'Invalid login credentials') return new Error('E-mail ou senha incorretos.')
  if (/Email not confirmed/i.test(msg)) return new Error('E-mail ainda não confirmado. Verifique sua caixa de entrada.')
  switch (e?.code) {
    case '23505':
      if (txt.includes('codigo_interno')) return new Error('Já existe um produto com este código interno.')
      if (txt.includes('lotes_unicos')) return new Error('Já existe outro lote igual (mesmo número e validade) para este produto.')
      if (txt.includes('categorias_nome')) return new Error('Já existe uma categoria com este nome.')
      return new Error('Registro duplicado.')
    case '23503':
      if (txt.includes('categoria')) return new Error('Esta categoria está em uso por produtos. Mude a categoria deles antes de excluir.')
      return new Error('Este registro está em uso e não pode ser excluído.')
    case '23514':
      if (txt.includes('com_motivo')) return new Error('Informe o motivo (mínimo 3 caracteres).')
      if (txt.includes('quantidade_valida')) return new Error('Quantidade inválida.')
      if (txt.includes('nome')) return new Error('Informe o nome.')
      return new Error('Dados inválidos: ' + msg)
    case '42501':
      // Mensagens já escritas em português pelas funções do banco passam direto.
      if (/permission denied|row-level security|violates/i.test(msg)) return new Error('Você não tem permissão para esta ação.')
      return new Error(msg)
    case 'PGRST116':
      return new Error('Registro não encontrado ou sem permissão para alterá-lo.')
  }
  return new Error(msg)
}

const TAM_PAGINA = 1000

/** Busca todas as linhas, paginando de 1000 em 1000 (limite padrão da API). */
export async function buscarTudo<T>(
  consulta: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: ErroBanco | null }>,
  mapear: (r: Record<string, unknown>) => T,
  limite = Infinity,
): Promise<T[]> {
  const saida: T[] = []
  for (let de = 0; de < limite; de += TAM_PAGINA) {
    const ate = Math.min(de + TAM_PAGINA, limite) - 1
    const { data, error } = await consulta(de, ate)
    if (error) throw traduzirErro(error)
    const linhas = (data ?? []) as Record<string, unknown>[]
    saida.push(...linhas.map(mapear))
    if (linhas.length < ate - de + 1) break
  }
  return saida
}

/** Falha com mensagem traduzida quando a resposta do Supabase traz erro. */
export function exigir<T>(r: { data: T; error: ErroBanco | null }): T {
  if (r.error) throw traduzirErro(r.error)
  return r.data
}

export const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))
export const numOuNulo = (v: unknown) => (v === null || v === undefined ? null : Number(v))

/** Lê/grava no armazenamento do aparelho sem quebrar quando ele está bloqueado. */
export const memoria = {
  ler<T>(chave: string): T | null {
    try {
      return JSON.parse(localStorage.getItem(chave) ?? 'null') as T | null
    } catch {
      return null
    }
  },
  gravar(chave: string, valor: unknown) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor))
    } catch {
      /* armazenamento indisponível */
    }
  },
  apagar(chave: string) {
    try {
      localStorage.removeItem(chave)
    } catch {
      /* armazenamento indisponível */
    }
  },
}
