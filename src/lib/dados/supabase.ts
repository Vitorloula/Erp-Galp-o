import { createClient } from '@supabase/supabase-js'
import type { Lote, Movimentacao, Produto, Usuario } from '../tipos'
import type { Repositorio } from './repositorio'

interface ErroBanco {
  message?: string
  code?: string
  details?: string | null
  hint?: string | null
}

/** Traduz erros técnicos do Supabase/PostgreSQL para mensagens claras ao operador. */
export function traduzirErro(e: ErroBanco | null | undefined): Error {
  const msg = e?.message ?? 'Erro desconhecido.'
  const txt = `${msg} ${e?.details ?? ''}`
  if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(msg))
    return new Error('Sem conexão com o servidor. Verifique a internet e tente novamente.')
  if (msg === 'Invalid login credentials') return new Error('E-mail ou senha incorretos.')
  if (/Email not confirmed/i.test(msg)) return new Error('E-mail ainda não confirmado. Verifique sua caixa de entrada.')
  switch (e?.code) {
    case '23505':
      if (txt.includes('codigo_barras')) return new Error('Já existe um produto com este código de barras.')
      if (txt.includes('codigo_interno')) return new Error('Já existe um produto com este código interno.')
      if (txt.includes('lotes_unicos')) return new Error('Já existe outro lote igual (mesmo número e validade) para este produto.')
      return new Error('Registro duplicado.')
    case '23514':
      if (txt.includes('correcao_com_motivo')) return new Error('Informe o motivo da correção (mínimo 3 caracteres).')
      if (txt.includes('quantidade_valida')) return new Error('Quantidade inválida.')
      if (txt.includes('nome')) return new Error('Informe o nome do produto.')
      return new Error('Dados inválidos: ' + msg)
    case '42501':
      return new Error('Você não tem permissão para esta ação.')
    case 'PGRST116':
      return new Error('Registro não encontrado ou sem permissão para alterá-lo.')
  }
  return new Error(msg)
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))

function paraProduto(r: Record<string, unknown>): Produto {
  return {
    ...(r as unknown as Produto),
    conteudo_embalagem: r.conteudo_embalagem === null ? null : num(r.conteudo_embalagem),
  }
}

function paraLote(r: Record<string, unknown>): Lote {
  return { ...(r as unknown as Lote), saldo: num(r.saldo) }
}

function paraMov(r: Record<string, unknown>): Movimentacao {
  return { ...(r as unknown as Movimentacao), id: num(r.id), quantidade: num(r.quantidade), delta: num(r.delta) }
}

const TAM_PAGINA = 1000

export function criarRepositorioSupabase(url: string, chave: string): Repositorio {
  const sb = createClient(url, chave, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'galpao-sessao' },
  })

  const CHAVE_PERFIL = 'galpao-perfil'
  const ouvintesSessao = new Set<(u: Usuario | null) => void>()

  function perfilSalvo(id: string): Usuario | null {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE_PERFIL) ?? 'null') as Usuario | null
      return salvo?.id === id ? salvo : null
    } catch {
      return null
    }
  }

  /** Lê o perfil no servidor; sem internet, usa o último perfil conhecido neste aparelho. */
  async function perfil(id: string, email: string | null): Promise<Usuario> {
    const { data, error } = await sb.from('perfis').select('id, nome, email, papel').eq('id', id).maybeSingle()
    if (error) {
      const salvo = perfilSalvo(id)
      if (salvo) return salvo
      throw traduzirErro(error)
    }
    const u: Usuario = data ? (data as Usuario) : { id, nome: email?.split('@')[0] ?? 'Usuário', email, papel: 'pendente' }
    try {
      localStorage.setItem(CHAVE_PERFIL, JSON.stringify(u))
    } catch {
      /* armazenamento indisponível */
    }
    return u
  }

  /** Busca todas as linhas, paginando de 1000 em 1000 (limite padrão da API). */
  async function buscarTudo<T>(
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

  return {
    modo: 'supabase',

    async sessaoAtual() {
      const { data } = await sb.auth.getSession()
      const u = data.session?.user
      if (!u) return null
      // Abre na hora com o perfil salvo neste aparelho (mesmo sem internet) e confirma
      // em segundo plano; se o papel mudou (ex.: conta liberada), a tela se atualiza.
      // As permissões reais continuam sendo garantidas pelo banco (RLS).
      const salvo = perfilSalvo(u.id)
      if (!salvo) return perfil(u.id, u.email ?? null)
      perfil(u.id, u.email ?? null).then(
        atual => {
          if (atual.papel !== salvo.papel || atual.nome !== salvo.nome) ouvintesSessao.forEach(cb => cb(atual))
        },
        () => {},
      )
      return salvo
    },

    async entrar(email, senha) {
      const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha })
      if (error) throw traduzirErro(error)
      return perfil(data.user.id, data.user.email ?? null)
    },

    async solicitarAcesso(nome, email, senha) {
      if (senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.')
      const { data, error } = await sb.auth.signUp({
        email: email.trim(),
        password: senha,
        options: { data: { nome: nome.trim() }, emailRedirectTo: window.location.origin },
      })
      if (error) {
        if (/already registered/i.test(error.message)) throw new Error('Este e-mail já tem cadastro. Use "Entrar".')
        if (/signups? not allowed|disabled/i.test(error.message)) throw new Error('O cadastro está desativado. Peça ao administrador para criar seu acesso.')
        throw traduzirErro(error)
      }
      return { confirmarEmail: !data.session }
    },

    async sair() {
      await sb.auth.signOut()
    },

    async listarUsuarios() {
      const { data, error } = await sb.from('perfis').select('id, nome, email, papel, criado_em').order('criado_em')
      if (error) throw traduzirErro(error)
      return data as Usuario[]
    },

    async alterarPapel(usuarioId, papel) {
      const { error } = await sb.from('perfis').update({ papel }).eq('id', usuarioId).select('id').single()
      if (error) {
        if (error.code === 'PGRST116') throw new Error('Somente administradores alteram acessos (e ninguém altera o próprio).')
        throw traduzirErro(error)
      }
    },

    aoMudarSessao(cb) {
      ouvintesSessao.add(cb)
      const { data } = sb.auth.onAuthStateChange((evento, sessao) => {
        if (evento === 'TOKEN_REFRESHED' || evento === 'INITIAL_SESSION') return
        const u = sessao?.user
        // Não chamar o Supabase dentro do callback (recomendação da biblioteca).
        setTimeout(() => {
          if (!u) cb(null)
          else perfil(u.id, u.email ?? null).then(cb, () => {}) // sem rede: mantém o usuário atual
        }, 0)
      })
      return () => {
        ouvintesSessao.delete(cb)
        data.subscription.unsubscribe()
      }
    },

    listarProdutos() {
      return buscarTudo((de, ate) => sb.from('produtos').select('*').order('nome').order('id').range(de, ate), paraProduto)
    },

    async salvarProduto(dados, id) {
      const consulta = id
        ? sb.from('produtos').update(dados).eq('id', id).select().single()
        : sb.from('produtos').insert(dados).select().single()
      const { data, error } = await consulta
      if (error) {
        if (id && error.code === 'PGRST116') throw new Error('Somente administradores podem editar produtos.')
        throw traduzirErro(error)
      }
      return paraProduto(data)
    },

    listarLotes() {
      return buscarTudo((de, ate) => sb.from('vw_estoque_lotes').select('*').order('lote_id').range(de, ate), paraLote)
    },

    async atualizarLote(loteId, dados) {
      const { error } = await sb.from('lotes').update(dados).eq('id', loteId).select('id').single()
      if (error) {
        if (error.code === 'PGRST116') throw new Error('Somente administradores podem corrigir lotes.')
        throw traduzirErro(error)
      }
    },

    listarMovimentacoes(f = {}) {
      return buscarTudo(
        (de, ate) => {
          let q = sb.from('movimentacoes').select('*')
          if (f.desde) q = q.gte('criado_em', f.desde)
          if (f.ate) q = q.lte('criado_em', f.ate)
          if (f.produtoId) q = q.eq('produto_id', f.produtoId)
          if (f.loteId) q = q.eq('lote_id', f.loteId)
          if (f.referenciaId) q = q.eq('referencia_id', f.referenciaId)
          return q.order('id', { ascending: false }).range(de, ate)
        },
        paraMov,
        f.limite,
      )
    },

    async registrarEntrada(e) {
      const { data, error } = await sb.rpc('registrar_entrada', {
        p_produto_id: e.produtoId,
        p_lote: e.lote,
        p_validade: e.validade,
        p_quantidade: e.quantidade,
        p_documento: e.documento ?? null,
        p_observacao: e.observacao ?? null,
      })
      if (error) throw traduzirErro(error)
      return Number(data)
    },

    async registrarSaida(s) {
      const { data, error } = await sb
        .from('movimentacoes')
        .insert({ tipo: 'SAIDA', lote_id: s.loteId, quantidade: s.quantidade, documento: s.documento ?? null, observacao: s.observacao ?? null })
        .select('id')
        .single()
      if (error) throw traduzirErro(error)
      return Number(data.id)
    },

    async registrarCorrecao(c) {
      const { data, error } = await sb
        .from('movimentacoes')
        .insert({ tipo: 'CORRECAO', lote_id: c.loteId, quantidade: c.quantidade, observacao: c.observacao, referencia_id: c.referenciaId ?? null })
        .select('id')
        .single()
      if (error) throw traduzirErro(error)
      return Number(data.id)
    },

    escutarAlteracoes(cb) {
      const canal = sb.channel(`galpao-${Math.random().toString(36).slice(2)}`)
      for (const table of ['produtos', 'lotes', 'movimentacoes'])
        canal.on('postgres_changes', { event: '*', schema: 'public', table }, () => cb())
      canal.subscribe()
      return () => {
        sb.removeChannel(canal)
      }
    },
  }
}
