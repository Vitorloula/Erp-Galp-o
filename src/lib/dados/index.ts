import { criarRepositorioDemo } from './demo'
import type { Repositorio } from './repositorio'
import { criarRepositorioSupabase } from './supabase'

export type { Repositorio } from './repositorio'

const urlConfigurada = import.meta.env.VITE_SUPABASE_URL as string | undefined
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Um caminho relativo (ex.: "/sb", usado pelo servidor local de teste) aponta para o
// mesmo endereço em que o sistema foi aberto: localhost no PC, IP da rede no celular.
const url = urlConfigurada?.startsWith('/') ? new URL(urlConfigurada, window.location.origin).href : urlConfigurada

/**
 * Com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY configurados, usa a nuvem (Supabase).
 * Sem eles, o sistema abre em MODO DEMONSTRAÇÃO, com dados salvos só neste navegador.
 */
export const repositorio: Repositorio = url && chave ? criarRepositorioSupabase(url, chave) : criarRepositorioDemo()

export const NOME_EMPRESA = (import.meta.env.VITE_NOME_EMPRESA as string | undefined) || 'Controle de Galpão'
