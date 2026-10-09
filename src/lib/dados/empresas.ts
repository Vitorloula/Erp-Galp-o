import type { Convite, DadosEmpresa, Loja, Membro, Papel, Segmento, Vinculo } from '../tipos'
import { exigir, memoria, sb, traduzirErro } from './cliente'

const chaveVinculos = (usuarioId: string) => `galpao-empresas-${usuarioId}`

/** Empresas em que o usuário trabalha. Sem internet, usa a última lista conhecida neste aparelho. */
export async function minhasEmpresas(usuarioId: string): Promise<Vinculo[]> {
  const { data, error } = await sb.rpc('minhas_empresas')
  if (error) {
    const salvas = memoria.ler<Vinculo[]>(chaveVinculos(usuarioId))
    if (salvas) return salvas
    throw traduzirErro(error)
  }
  memoria.gravar(chaveVinculos(usuarioId), data)
  return data as Vinculo[]
}

export function empresasSalvas(usuarioId: string): Vinculo[] | null {
  return memoria.ler<Vinculo[]>(chaveVinculos(usuarioId))
}

export async function criarEmpresa(nome: string, segmento: Segmento, nomeLoja: string): Promise<string> {
  if (!nome.trim()) throw new Error('Informe o nome da empresa.')
  return exigir(await sb.rpc('criar_empresa', { p_nome: nome.trim(), p_segmento: segmento, p_nome_loja: nomeLoja.trim() || 'Loja principal' })) as string
}

export async function criarEmpresaExemplo(): Promise<string> {
  return exigir(await sb.rpc('criar_empresa_exemplo')) as string
}

export async function dadosEmpresa(empresaId: string): Promise<DadosEmpresa> {
  return exigir(await sb.from('empresas').select('id, nome, razao_social, documento').eq('id', empresaId).single()) as DadosEmpresa
}

export async function salvarEmpresa(empresaId: string, dados: Omit<DadosEmpresa, 'id'>) {
  if (!dados.nome.trim()) throw new Error('Informe o nome da empresa.')
  const { error } = await sb
    .from('empresas')
    .update({ nome: dados.nome.trim(), razao_social: dados.razao_social?.trim() || null, documento: dados.documento?.replace(/\D/g, '') || null })
    .eq('id', empresaId)
    .select('id')
    .single()
  if (error) throw error.code === 'PGRST116' ? new Error('Somente o dono altera os dados da empresa.') : traduzirErro(error)
}

// ------------------------------------------------------------------ lojas

export async function listarLojas(empresaId: string): Promise<Loja[]> {
  const lojas = exigir(await sb.from('lojas').select('id, nome, cnpj, endereco, ativo').eq('empresa_id', empresaId).order('criado_em')) as Loja[]
  return lojas
}

export async function salvarLoja(empresaId: string, dados: { nome: string; ativo?: boolean }, id?: string) {
  if (!dados.nome.trim()) throw new Error('Informe o nome da loja.')
  const r = id
    ? await sb.from('lojas').update({ nome: dados.nome.trim(), ativo: dados.ativo ?? true }).eq('id', id).select('id').single()
    : await sb.from('lojas').insert({ empresa_id: empresaId, nome: dados.nome.trim() }).select('id').single()
  if (r.error) throw r.error.code === 'PGRST116' ? new Error('Somente o dono altera as lojas.') : traduzirErro(r.error)
}

// ------------------------------------------------------------------ equipe

export async function listarEquipe(empresaId: string): Promise<Membro[]> {
  const membros = exigir(
    await sb.from('membros').select('usuario_id, nome, papel, lojas, ativo, criado_em').eq('empresa_id', empresaId).order('criado_em'),
  ) as Omit<Membro, 'email'>[]
  const perfis = exigir(
    await sb.from('perfis').select('id, nome, email').in('id', membros.map(m => m.usuario_id)),
  ) as { id: string; nome: string; email: string | null }[]
  const porId = new Map(perfis.map(p => [p.id, p]))
  return membros.map(m => ({ ...m, nome: porId.get(m.usuario_id)?.nome ?? m.nome ?? 'Usuário', email: porId.get(m.usuario_id)?.email ?? null }))
}

export async function alterarMembro(empresaId: string, usuarioId: string, dados: { papel?: Papel; ativo?: boolean }) {
  const { error } = await sb.from('membros').update(dados).eq('empresa_id', empresaId).eq('usuario_id', usuarioId).select('usuario_id').single()
  if (error) throw error.code === 'PGRST116' ? new Error('Somente o dono altera a equipe (e ninguém altera o próprio acesso).') : traduzirErro(error)
}

export async function removerMembro(empresaId: string, usuarioId: string) {
  const { error } = await sb.from('membros').delete().eq('empresa_id', empresaId).eq('usuario_id', usuarioId).select('usuario_id').single()
  if (error) throw error.code === 'PGRST116' ? new Error('Somente o dono remove pessoas da equipe.') : traduzirErro(error)
}

// ---------------------------------------------------------------- convites

export async function listarConvites(empresaId: string): Promise<Convite[]> {
  return exigir(
    await sb
      .from('convites')
      .select('id, email, papel, lojas, expira_em, aceito_em, cancelado_em, criado_em')
      .eq('empresa_id', empresaId)
      .order('criado_em', { ascending: false }),
  ) as Convite[]
}

/** Cria o convite e devolve o link (o token só existe neste momento; o banco guarda apenas o hash). */
export async function criarConvite(empresaId: string, papel: Exclude<Papel, 'dono'>, email: string, lojas: string[] | null): Promise<string> {
  const token = exigir(
    await sb.rpc('criar_convite', { p_empresa: empresaId, p_papel: papel, p_email: email.trim() || null, p_lojas: lojas }),
  ) as string
  return linkDoConvite(token)
}

export const linkDoConvite = (token: string) => `${window.location.origin}/convite#${token}`

/** Aceita o link inteiro, só o trecho depois do # ou o código puro. */
export function tokenDoConvite(texto: string): string | null {
  const m = /([0-9a-f]{64})/i.exec(texto.trim())
  return m ? m[1].toLowerCase() : null
}

export async function cancelarConvite(conviteId: string) {
  exigir(await sb.rpc('cancelar_convite', { p_convite: conviteId }))
}

export interface InfoConvite {
  empresa: string
  papel: Exclude<Papel, 'dono'>
  situacao: 'valido' | 'usado' | 'expirado'
}

export async function verConvite(token: string): Promise<InfoConvite | null> {
  const linhas = exigir(await sb.rpc('ver_convite', { p_token: token })) as InfoConvite[]
  return linhas[0] ?? null
}

export async function aceitarConvite(token: string): Promise<string> {
  return exigir(await sb.rpc('aceitar_convite', { p_token: token })) as string
}
