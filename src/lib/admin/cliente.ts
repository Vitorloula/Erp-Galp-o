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

export async function adminLogListar(filtros: {
  empresa?: string | null
  usuario?: string | null
  modulo?: string | null
  fingerprint?: string | null
  gravidade?: string | null
  status?: string | null
  de?: string
  ate?: string
  limite?: number
} = {}): Promise<any[]> {
  const data = await chamar<any[]>('admin_log_listar', {
    p_empresa: filtros.empresa ?? null,
    p_usuario: filtros.usuario ?? null,
    p_modulo: filtros.modulo ?? null,
    p_fingerprint: filtros.fingerprint ?? null,
    p_gravidade: filtros.gravidade ?? null,
    p_status: filtros.status ?? null,
    p_de: filtros.de ?? null,
    p_ate: filtros.ate ?? null,
    p_limite: filtros.limite ?? 200,
  })
  return data ?? []
}

export async function adminLogGrupos(filtros: {
  empresa?: string | null
  de?: string
  ate?: string
} = {}): Promise<any[]> {
  const data = await chamar<any[]>('admin_log_grupos', {
    p_empresa: filtros.empresa ?? null,
    p_de: filtros.de ?? null,
    p_ate: filtros.ate ?? null,
  })
  return data ?? []
}

export async function adminLogStatus(erroId: number, status: string, causa?: string, sugestao?: string): Promise<void> {
  await chamar('admin_log_status', {
    p_erro: erroId,
    p_status: status,
    p_causa: causa ?? null,
    p_sugestao: sugestao ?? null,
  })
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

export async function adminIncidenteListar(filtros: {
  prioridade?: string | null
  situacao?: string | null
  empresa?: string | null
  de?: string
  ate?: string
} = {}): Promise<any[]> {
  const data = await chamar<any[]>('admin_incidente_listar', {
    p_prioridade: filtros.prioridade ?? null,
    p_situacao: filtros.situacao ?? null,
    p_empresa: filtros.empresa ?? null,
    p_de: filtros.de ?? null,
    p_ate: filtros.ate ?? null,
  })
  return data ?? []
}

export async function adminIncidenteVer(id: string): Promise<Record<string, unknown>> {
  return await chamar<Record<string, unknown>>('admin_incidente_ver', { p_id: id })
}

export async function adminIncidenteCriarDeGrupo(params: {
  fingerprint: string
  titulo: string
  prioridade?: string
  empresa?: string | null
  descricao?: string
}): Promise<string> {
  return await chamar<string>('admin_incidente_criar_de_grupo', {
    p_fingerprint: params.fingerprint,
    p_titulo: params.titulo,
    p_prioridade: params.prioridade ?? 'media',
    p_empresa: params.empresa ?? null,
    p_descricao: params.descricao ?? null,
  })
}

export async function adminIncidenteAtualizar(params: {
  id: string
  prioridade?: string
  situacao?: string
  diagnostico?: string
  solucao?: string
  titulo?: string
  descricao?: string
}): Promise<void> {
  await chamar('admin_incidente_atualizar', {
    p_id: params.id,
    p_prioridade: params.prioridade ?? null,
    p_situacao: params.situacao ?? null,
    p_diagnostico: params.diagnostico ?? null,
    p_solucao_recomendada: params.solucao ?? null,
    p_titulo: params.titulo ?? null,
    p_descricao: params.descricao ?? null,
  })
}

export async function adminIncidenteAcao(id: string, acao: string, detalhe?: string): Promise<void> {
  await chamar('admin_incidente_acao', { p_id: id, p_acao: acao, p_detalhe: detalhe ?? null })
}

export async function adminIncidenteRecontar(id: string): Promise<void> {
  await chamar('admin_incidente_recontar', { p_id: id })
}
