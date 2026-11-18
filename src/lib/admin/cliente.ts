import { sb, traduzirErro } from '../dados/cliente'
import type { AdminEmpresaResumo, AdminAuditoriaLinha } from './tipos'
export type { AdminEmpresaResumo, AdminAuditoriaLinha }

let correlacao = crypto.randomUUID()

/** Reinicia a correlação (nova sessão de investigação). */
export function novaCorrelacao() {
  correlacao = crypto.randomUUID()
  return correlacao
}

export function correlacaoAtual() {
  return correlacao
}

async function chamar<T>(nome: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb.rpc(nome, { ...params, p_correlacao: correlacao })
  if (error) {
    if (error.code === '42501') throw new Error('Sem acesso')
    throw traduzirErro(error)
  }
  return data as T
}

export async function adminSouAdmin(): Promise<boolean> {
  const { data, error } = await sb.rpc('admin_sou_admin')
  if (error) return false
  return !!data
}

export async function adminVisaoGeral(): Promise<AdminEmpresaResumo[]> {
  const data = await chamar<AdminEmpresaResumo[]>('admin_visao_geral')
  return data ?? []
}

export async function adminVerEmpresa(empresaId: string): Promise<Record<string, unknown>> {
  return await chamar<Record<string, unknown>>('admin_ver_empresa', { p_empresa: empresaId })
}

export async function adminAuditoriaListar(filtros: {
  adminId?: string | null
  de?: string
  ate?: string
  limite?: number
} = {}): Promise<AdminAuditoriaLinha[]> {
  const data = await chamar<AdminAuditoriaLinha[]>('admin_auditoria_listar', {
    p_admin_id: filtros.adminId ?? null,
    p_de: filtros.de ?? null,
    p_ate: filtros.ate ?? null,
    p_limite: filtros.limite ?? 200,
  })
  return data ?? []
}
