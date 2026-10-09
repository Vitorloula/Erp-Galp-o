import type { Perfil } from '../tipos'
import { memoria, sb, traduzirErro } from './cliente'

const CHAVE_PERFIL = 'galpao-perfil'

function perfilSalvo(id: string): Perfil | null {
  const salvo = memoria.ler<Perfil>(CHAVE_PERFIL)
  return salvo?.id === id ? salvo : null
}

/** Lê o perfil no servidor; sem internet, usa o último perfil conhecido neste aparelho. */
async function perfil(id: string, email: string | null): Promise<Perfil> {
  const { data, error } = await sb.from('perfis').select('id, nome, email').eq('id', id).maybeSingle()
  if (error) {
    const salvo = perfilSalvo(id)
    if (salvo) return salvo
    throw traduzirErro(error)
  }
  const p: Perfil = (data as Perfil | null) ?? { id, nome: email?.split('@')[0] ?? 'Usuário', email }
  memoria.gravar(CHAVE_PERFIL, p)
  return p
}

export async function sessaoAtual(aoAtualizar: (p: Perfil) => void): Promise<Perfil | null> {
  const { data } = await sb.auth.getSession()
  const u = data.session?.user
  if (!u) return null
  // Abre na hora com o perfil salvo neste aparelho (mesmo sem internet) e confirma
  // em segundo plano. As permissões reais são sempre garantidas pelo banco (RLS).
  const salvo = perfilSalvo(u.id)
  if (!salvo) return perfil(u.id, u.email ?? null)
  perfil(u.id, u.email ?? null).then(
    atual => atual.nome !== salvo.nome && aoAtualizar(atual),
    () => {},
  )
  return salvo
}

export async function entrar(email: string, senha: string): Promise<Perfil> {
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha })
  if (error) throw traduzirErro(error)
  return perfil(data.user.id, data.user.email ?? null)
}

/** Cria a conta. Retorna se é preciso confirmar o e-mail antes de entrar. */
export async function criarConta(nome: string, email: string, senha: string): Promise<{ confirmarEmail: boolean }> {
  if (senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.')
  const { data, error } = await sb.auth.signUp({
    email: email.trim(),
    password: senha,
    options: { data: { nome: nome.trim() }, emailRedirectTo: window.location.origin },
  })
  if (error) {
    if (/already registered/i.test(error.message)) throw new Error('Este e-mail já tem cadastro. Use "Entrar".')
    if (/signups? not allowed|disabled/i.test(error.message)) throw new Error('O cadastro está desativado no momento.')
    if (/at least 6/i.test(error.message)) throw new Error('A senha precisa ter pelo menos 6 caracteres.')
    throw traduzirErro(error)
  }
  // Com confirmação ligada, e-mail já cadastrado volta sem identidades (o Supabase não revela que existe).
  if (data.user && data.user.identities?.length === 0) throw new Error('Este e-mail já tem cadastro. Use "Entrar".')
  return { confirmarEmail: !data.session }
}

export async function enviarLinkNovaSenha(email: string) {
  const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
  if (error) throw traduzirErro(error)
}

export async function definirSenha(senha: string) {
  if (senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.')
  const { error } = await sb.auth.updateUser({ password: senha })
  if (error) {
    if (/different from the old/i.test(error.message)) throw new Error('A nova senha precisa ser diferente da anterior.')
    throw traduzirErro(error)
  }
}

export async function alterarNome(id: string, nome: string): Promise<Perfil> {
  const { data, error } = await sb.from('perfis').update({ nome: nome.trim() }).eq('id', id).select('id, nome, email').single()
  if (error) throw traduzirErro(error)
  memoria.gravar(CHAVE_PERFIL, data)
  return data as Perfil
}

export async function sair() {
  // Encerra só neste aparelho: o celular do pátio continua logado.
  await sb.auth.signOut({ scope: 'local' })
  memoria.apagar(CHAVE_PERFIL)
}

export function aoMudarSessao(cb: (p: Perfil | null) => void): () => void {
  const { data } = sb.auth.onAuthStateChange((evento, sessao) => {
    if (evento === 'TOKEN_REFRESHED' || evento === 'INITIAL_SESSION' || evento === 'USER_UPDATED') return
    const u = sessao?.user
    // Não chamar o Supabase dentro do callback (recomendação da biblioteca).
    setTimeout(() => {
      if (!u) cb(null)
      else perfil(u.id, u.email ?? null).then(cb, () => {}) // sem rede: mantém o usuário atual
    }, 0)
  })
  return () => data.subscription.unsubscribe()
}
