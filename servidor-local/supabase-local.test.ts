import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { iniciarServidorHttp } from './http.ts'
import { assinarJwt } from './jwt.ts'
import { CHAVE_ANON_LOCAL, SupabaseLocal, type OpcoesSupabaseLocal } from './supabase-local.ts'

// O servidor local é testado com o cliente OFICIAL do Supabase (supabase-js), por HTTP
// e WebSocket de verdade: se o protocolo divergir do Supabase, estes testes quebram.

const LENTO = { timeout: 60_000 }

interface Ambiente {
  supabase: SupabaseLocal
  url: string
  cliente(chave?: string): SupabaseClient
  entrar(email: string, senha?: string): Promise<SupabaseClient>
  novaEmpresa(nome: string, segmento?: string): Promise<{ c: SupabaseClient; usuario: string; empresa: string; loja: string }>
  fechar(): Promise<void>
}

async function subir(opcoes: OpcoesSupabaseLocal = {}): Promise<Ambiente> {
  const supabase = await SupabaseLocal.criar({ confirmarEmail: false, ...opcoes })
  const http = await iniciarServidorHttp(supabase)
  const clientes: SupabaseClient[] = []
  const cliente = (chave = CHAVE_ANON_LOCAL) => {
    const c = createClient(http.url, chave, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    clientes.push(c)
    return c
  }
  const entrar = async (email: string, senha = 'segredo1') => {
    const c = cliente()
    const { error } = await c.auth.signInWithPassword({ email, password: senha })
    expect(error).toBeNull()
    return c
  }
  const novaEmpresa = async (nome: string, segmento = 'galpao') => {
    const email = `${randomUUID().slice(0, 8)}@teste.local`
    const usuario = await supabase.criarUsuario({ email, senha: 'segredo1', nome: `Dono ${nome}` })
    const c = await entrar(email)
    const { data: empresa, error } = await c.rpc('criar_empresa', { p_nome: nome, p_segmento: segmento })
    expect(error).toBeNull()
    const { data: lojas } = await c.from('lojas').select('id')
    return { c, usuario, empresa: empresa as string, loja: lojas![0].id as string }
  }
  return {
    supabase,
    url: http.url,
    cliente,
    entrar,
    novaEmpresa,
    async fechar() {
      for (const c of clientes) await c.removeAllChannels()
      await http.fechar()
      await supabase.fechar()
    },
  }
}

// ---------------------------------------------------------------------------
describe('Auth (cadastro sem confirmação, como no servidor local)', LENTO, () => {
  let a: Ambiente
  beforeAll(async () => (a = await subir()), 60_000)
  afterAll(() => a.fechar())

  test('cadastro já entra e cria o perfil com o nome informado', async () => {
    const c = a.cliente()
    const { data, error } = await c.auth.signUp({ email: 'Maria@Teste.local', password: 'segredo1', options: { data: { nome: 'Maria Pátio' } } })
    expect(error).toBeNull()
    expect(data.session?.access_token).toBeTruthy()
    expect(data.user?.email).toBe('maria@teste.local')
    const { data: perfil } = await c.from('perfis').select('nome, email').single()
    expect(perfil).toEqual({ nome: 'Maria Pátio', email: 'maria@teste.local' })
  })

  test('senha errada, e-mail repetido e senha curta têm os códigos do Supabase', async () => {
    await a.supabase.criarUsuario({ email: 'jose@teste.local', senha: 'segredo1' })
    const c = a.cliente()
    const errada = await c.auth.signInWithPassword({ email: 'jose@teste.local', password: 'outra' })
    expect(errada.error).toMatchObject({ code: 'invalid_credentials', status: 400 })
    const repetido = await c.auth.signUp({ email: 'jose@teste.local', password: 'segredo1' })
    expect(repetido.error).toMatchObject({ code: 'user_already_exists', status: 422 })
    const curta = await c.auth.signUp({ email: 'novo@teste.local', password: '123' })
    expect(curta.error).toMatchObject({ code: 'weak_password', status: 422 })
  })

  test('renovar a sessão troca o refresh token; o antigo deixa de valer', async () => {
    await a.supabase.criarUsuario({ email: 'ana@teste.local', senha: 'segredo1' })
    const c = await a.entrar('ana@teste.local')
    const antigo = (await c.auth.getSession()).data.session!.refresh_token
    const { data, error } = await c.auth.refreshSession()
    expect(error).toBeNull()
    expect(data.session!.refresh_token).not.toBe(antigo)
    // Passada a tolerância para abas concorrentes, reapresentar o token antigo é recusado.
    await a.supabase.sql(`update auth.refresh_tokens set updated_at = now() - interval '1 minute' where token = $1`, [antigo])
    const reuso = await a.cliente().auth.refreshSession({ refresh_token: antigo })
    expect(reuso.error).toMatchObject({ code: 'refresh_token_already_used' })
  })

  test('sair encerra a sessão: só deste aparelho (local) ou de todos (padrão)', async () => {
    await a.supabase.criarUsuario({ email: 'saida@teste.local', senha: 'segredo1' })
    const computador = await a.entrar('saida@teste.local')
    const celular = await a.entrar('saida@teste.local')
    const sessaoComputador = (await computador.auth.getSession()).data.session!
    const refreshCelular = (await celular.auth.getSession()).data.session!.refresh_token

    await computador.auth.signOut({ scope: 'local' })
    expect((await a.cliente().auth.refreshSession({ refresh_token: sessaoComputador.refresh_token })).error).toMatchObject({
      code: 'refresh_token_not_found',
    })
    const usuario = await fetch(`${a.url}/auth/v1/user`, {
      headers: { apikey: CHAVE_ANON_LOCAL, authorization: `Bearer ${sessaoComputador.access_token}` },
    })
    expect(await usuario.json()).toMatchObject({ code: 'session_not_found' })

    const renovado = await celular.auth.refreshSession({ refresh_token: refreshCelular })
    expect(renovado.error).toBeNull() // o celular continua logado
    await celular.auth.signOut() // padrão do supabase-js: encerra em todos os aparelhos
    expect((await a.cliente().auth.refreshSession({ refresh_token: renovado.data.session!.refresh_token })).error).toBeTruthy()
  })

  test('token adulterado, expirado ou chave pública errada são recusados', async () => {
    const usuario = await a.supabase.criarUsuario({ email: 'token@teste.local', senha: 'segredo1' })
    const { access_token } = await a.supabase.sessao(usuario)
    const [cab, corpo] = access_token.split('.')
    const adulterado = `${cab}.${corpo}.assinatura-falsa`
    const chamar = (token: string, apikey = CHAVE_ANON_LOCAL) =>
      fetch(`${a.url}/rest/v1/produtos?select=id`, { headers: { apikey, authorization: `Bearer ${token}` } })

    const r1 = await chamar(adulterado)
    expect(r1.status).toBe(401)
    expect(await r1.json()).toMatchObject({ code: 'PGRST301' })

    const [{ valor: segredo }] = await a.supabase.sql<{ valor: string }>(`select valor from auth.servidor_local where chave = 'jwt_secret'`)
    const expirado = assinarJwt({ sub: usuario, role: 'authenticated', exp: Math.floor(Date.now() / 1000) - 10 }, segredo)
    const r2 = await chamar(expirado)
    expect(r2.status).toBe(401)
    expect(await r2.json()).toMatchObject({ code: 'PGRST303', message: 'JWT expired' })

    const r3 = await chamar(access_token, 'chave-errada')
    expect(r3.status).toBe(401)
    expect(await r3.json()).toMatchObject({ message: 'Invalid API key' })

    const u = await fetch(`${a.url}/auth/v1/user`, { headers: { apikey: CHAVE_ANON_LOCAL, authorization: `Bearer ${adulterado}` } })
    expect(u.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
describe('Auth com confirmação de e-mail (como no Supabase na nuvem)', LENTO, () => {
  let a: Ambiente
  beforeAll(async () => (a = await subir({ confirmarEmail: true })), 60_000)
  afterAll(() => a.fechar())

  test('cadastro pede confirmação; o link do e-mail confirma e volta ao app já logado', async () => {
    const c = a.cliente()
    const { data, error } = await c.auth.signUp({
      email: 'pedro@teste.local',
      password: 'segredo1',
      options: { emailRedirectTo: 'http://app.local/painel' },
    })
    expect(error).toBeNull()
    expect(data.session).toBeNull()
    expect(data.user?.email).toBe('pedro@teste.local')

    const naoConfirmado = await c.auth.signInWithPassword({ email: 'pedro@teste.local', password: 'segredo1' })
    expect(naoConfirmado.error).toMatchObject({ code: 'email_not_confirmed' })

    const email = a.supabase.emails.find(e => e.para === 'pedro@teste.local' && e.tipo === 'signup')!
    expect(email.link).toContain(`${a.url}/auth/v1/verify?`)
    const r = await fetch(email.link, { redirect: 'manual' })
    expect(r.status).toBe(303)
    const destino = new URL(r.headers.get('location')!)
    expect(destino.origin + destino.pathname).toBe('http://app.local/painel')
    const fragmento = new URLSearchParams(destino.hash.slice(1))
    expect(fragmento.get('type')).toBe('signup')
    expect(fragmento.get('access_token')).toBeTruthy()

    // O link é de uso único.
    const denovo = await fetch(email.link, { redirect: 'manual' })
    expect(denovo.headers.get('location')).toContain('error_code=otp_expired')

    const ok = await c.auth.signInWithPassword({ email: 'pedro@teste.local', password: 'segredo1' })
    expect(ok.error).toBeNull()
  })

  test('esqueci a senha: link de redefinição permite trocar a senha', async () => {
    await a.supabase.criarUsuario({ email: 'lia@teste.local', senha: 'antiga1' })
    const c = a.cliente()
    const { error } = await c.auth.resetPasswordForEmail('lia@teste.local', { redirectTo: 'http://app.local/nova-senha' })
    expect(error).toBeNull()
    const email = a.supabase.emails.find(e => e.para === 'lia@teste.local' && e.tipo === 'recovery')!
    const r = await fetch(email.link, { redirect: 'manual' })
    const fragmento = new URLSearchParams(new URL(r.headers.get('location')!).hash.slice(1))
    expect(fragmento.get('type')).toBe('recovery')
    await c.auth.setSession({ access_token: fragmento.get('access_token')!, refresh_token: fragmento.get('refresh_token')! })
    expect((await c.auth.updateUser({ password: 'nova123' })).error).toBeNull()

    expect((await a.cliente().auth.signInWithPassword({ email: 'lia@teste.local', password: 'antiga1' })).error).toBeTruthy()
    expect((await a.cliente().auth.signInWithPassword({ email: 'lia@teste.local', password: 'nova123' })).error).toBeNull()
  })

  test('e-mail desconhecido em "esqueci a senha" não revela nada', async () => {
    const { error } = await a.cliente().auth.resetPasswordForEmail('ninguem@teste.local')
    expect(error).toBeNull()
    expect(a.supabase.emails.some(e => e.para === 'ninguem@teste.local')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
describe('API REST (PostgREST) com as regras reais do banco', LENTO, () => {
  let a: Ambiente
  let A: Awaited<ReturnType<Ambiente['novaEmpresa']>>
  let B: Awaited<ReturnType<Ambiente['novaEmpresa']>>
  beforeAll(async () => {
    a = await subir()
    A = await a.novaEmpresa('Agro A', 'galpao')
    B = await a.novaEmpresa('Mercadinho B', 'mercadinho')
  }, 60_000)
  afterAll(() => a.fechar())

  test('visitante sem login não lê tabelas nem chama funções', async () => {
    const c = a.cliente()
    const r = await c.from('produtos').select('id')
    expect(r.error).toMatchObject({ code: '42501' })
    expect(r.status).toBe(401)
    const f = await c.rpc('criar_empresa', { p_nome: 'X', p_segmento: 'galpao' })
    expect(f.error).toMatchObject({ code: '42501' })
  })

  test('criar_empresa já deixa loja, assinatura de teste e categorias do segmento', async () => {
    const { data: empresas } = await A.c.from('empresas').select('id, nome, segmento')
    expect(empresas).toEqual([{ id: A.empresa, nome: 'Agro A', segmento: 'galpao' }])
    const { data: assinatura } = await A.c.from('assinaturas').select('plano_id, status').single()
    expect(assinatura).toEqual({ plano_id: 'teste', status: 'trial' })
    const { count } = await A.c.from('categorias').select('*', { count: 'exact', head: true })
    expect(count).toBe(5)
    const { count: doMercadinho } = await B.c.from('categorias').select('*', { count: 'exact', head: true })
    expect(doMercadinho).toBe(7)
  })

  test('insert com select().single() devolve a linha como o banco gravou', async () => {
    const { data, error, status } = await A.c
      .from('produtos')
      .insert({ empresa_id: A.empresa, nome: '  Glifosato   480 ', unidade: 'L', preco_venda: 89.9 })
      .select()
      .single()
    expect(error).toBeNull()
    expect(status).toBe(201)
    expect(data).toMatchObject({ codigo_interno: 'P0001', nome: 'Glifosato 480', unidade: 'L', preco_venda: 89.9, rastreio: 'nenhum', ativo: true })
    expect(data.criado_em).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+\+00:00$/)
    expect(typeof data.versao).toBe('number')
  })

  test('insert em lote, filtros, ordenação, paginação e contagem', async () => {
    const { error } = await B.c.from('produtos').insert([
      { empresa_id: B.empresa, nome: 'Arroz 5kg', unidade: 'un', preco_venda: 27.5, pesavel: false },
      { empresa_id: B.empresa, nome: 'Água 500ml', unidade: 'un', preco_venda: 2.5, pesavel: false },
      { empresa_id: B.empresa, nome: 'Banana', unidade: 'kg', preco_venda: null, pesavel: true },
      { empresa_id: B.empresa, nome: 'Feijão 1kg', unidade: 'un', preco_venda: 8.99, pesavel: false },
    ])
    expect(error).toBeNull()
    const nomes = (r: { data: { nome: string }[] | null }) => r.data!.map(p => p.nome)
    const p = () => B.c.from('produtos').select('nome, codigo_interno, preco_venda')

    expect(nomes(await p().eq('unidade', 'kg'))).toEqual(['Banana'])
    expect(nomes(await p().ilike('nome', '%ARROZ%'))).toEqual(['Arroz 5kg'])
    // Ordem por código: o banco ordena texto byte a byte ("Água" depois de "Feijão"); nomes se ordenam no app.
    expect(nomes(await p().in('codigo_interno', ['P0002', 'P0004']).order('codigo_interno'))).toEqual(['Água 500ml', 'Feijão 1kg'])
    expect(nomes(await p().is('preco_venda', null))).toEqual(['Banana'])
    expect(nomes(await p().not('preco_venda', 'is', null).gt('preco_venda', 5).order('preco_venda', { ascending: false }))).toEqual([
      'Arroz 5kg',
      'Feijão 1kg',
    ])
    expect(nomes(await p().or('nome.ilike.*água*,codigo_interno.eq.P0003').order('codigo_interno'))).toEqual(['Água 500ml', 'Banana'])
    expect(nomes(await p().or('and(unidade.eq.un,preco_venda.lt.3),nome.eq."Banana"').order('codigo_interno'))).toEqual(['Água 500ml', 'Banana'])
    expect(nomes(await p().order('codigo_interno', { ascending: false }).range(1, 2))).toEqual(['Banana', 'Água 500ml'])

    const contagem = await B.c.from('produtos').select('*', { count: 'exact', head: true }).eq('unidade', 'un')
    expect(contagem.count).toBe(3)
    expect(contagem.data).toBeNull()

    const { data: renomeado } = await B.c.from('produtos').select('produto:nome, preco:preco_venda::text').eq('codigo_interno', 'P0001').single()
    expect(renomeado).toEqual({ produto: 'Arroz 5kg', preco: '27.50' })
  })

  test('insert em lote com campos diferentes: o que falta vira null, não o padrão (igual ao Supabase)', async () => {
    // O supabase-js manda a união das chaves; o PostgREST grava null onde o objeto não tem a chave.
    const r = await B.c.from('produtos').insert([
      { empresa_id: B.empresa, nome: 'Com pesável', unidade: 'kg', pesavel: true },
      { empresa_id: B.empresa, nome: 'Sem pesável', unidade: 'un' },
    ])
    expect(r.error).toMatchObject({ code: '23502' })
    expect(r.error!.message).toContain('"pesavel"')
  })

  test('single() sem resultado dá PGRST116; maybeSingle() devolve null', async () => {
    const um = await A.c.from('produtos').select('id').eq('codigo_interno', 'NAO-EXISTE').single()
    expect(um.error).toMatchObject({ code: 'PGRST116' })
    expect(um.status).toBe(406)
    const talvez = await A.c.from('produtos').select('id').eq('codigo_interno', 'NAO-EXISTE').maybeSingle()
    expect(talvez).toMatchObject({ data: null, error: null })
  })

  test('uma empresa não lê nem altera dados da outra', async () => {
    const { data: deA } = await A.c.from('produtos').select('id').eq('codigo_interno', 'P0001').single()
    expect((await B.c.from('produtos').select('id').eq('id', deA!.id)).data).toEqual([])

    const invasao = await B.c.from('produtos').update({ nome: 'invadido' }).eq('id', deA!.id).select()
    expect(invasao.error).toBeNull()
    expect(invasao.data).toEqual([]) // nenhuma linha visível para atualizar

    const propria = await A.c.from('produtos').update({ preco_venda: 95 }).eq('id', deA!.id).select('nome, preco_venda')
    expect(propria.data).toEqual([{ nome: 'Glifosato 480', preco_venda: 95 }])

    const forjado = await B.c.from('produtos').insert({ empresa_id: A.empresa, nome: 'X', unidade: 'un' })
    expect(forjado.error).toMatchObject({ code: '42501' })
    expect(forjado.status).toBe(403)
  })

  test('códigos de barras: GTIN-14, código repetido é recusado e upsert esbarra na permissão por coluna', async () => {
    const { data: prod } = await B.c.from('produtos').select('id').eq('codigo_interno', 'P0002').single()
    const base = { empresa_id: B.empresa, produto_id: prod!.id }
    expect((await B.c.from('produtos_codigos').insert({ ...base, codigo: '7891000000021' })).error).toBeNull()
    expect((await B.c.from('produtos_codigos').insert({ ...base, codigo: '07891000000021' })).error).toMatchObject({ code: '23505' })

    // O upsert do PostgREST regrava TODAS as colunas enviadas (inclusive empresa_id), e o banco
    // só libera alterar codigo/tipo/fator: no Supabase real dá o mesmo erro. O app usa update.
    const upsert = await B.c.from('produtos_codigos').upsert({ ...base, codigo: '07891000000021', fator: 12 }, { onConflict: 'empresa_id,codigo' })
    expect(upsert.error).toMatchObject({ code: '42501', message: 'permission denied for table produtos_codigos' })

    const caixa = await B.c.from('produtos_codigos').update({ fator: 12, tipo: 'dun' }).eq('codigo', '07891000000021').select('codigo, fator, tipo')
    expect(caixa.error).toBeNull()
    expect(caixa.data).toEqual([{ codigo: '07891000000021', fator: 12, tipo: 'dun' }])
    const { count } = await B.c.from('produtos_codigos').select('*', { count: 'exact', head: true })
    expect(count).toBe(1)
    expect((await B.c.from('produtos_codigos').delete().eq('codigo', '07891000000021')).status).toBe(204)
  })

  test('erros saem no formato do PostgREST', async () => {
    const repetido = await A.c.from('produtos').insert({ empresa_id: A.empresa, codigo_interno: 'p0001', nome: 'Outro', unidade: 'L' })
    expect(repetido.error).toMatchObject({ code: '23505' })
    expect(repetido.status).toBe(409)

    const colunaInexistente = await A.c.from('produtos').insert({ empresa_id: A.empresa, nome: 'X', unidade: 'L', cor: 'azul' })
    expect(colunaInexistente.error).toMatchObject({ code: 'PGRST204' })

    const tabelaInexistente = await A.c.from('produtoz').select()
    expect(tabelaInexistente.error).toMatchObject({ code: 'PGRST205' })
    expect(tabelaInexistente.status).toBe(404)

    const funcaoInexistente = await A.c.rpc('criar_empresa', { p_nome: 'X', p_cor: 'azul' })
    expect(funcaoInexistente.error).toMatchObject({ code: 'PGRST202' })

    const embutido = await A.c.from('produtos').select('*, lotes(*)')
    expect(embutido.error).toMatchObject({ code: 'PGRST100' })
    expect(embutido.error!.message).toContain('não simula')

    const invalido = await A.c.from('produtos').select('id').eq('id', 'nao-e-uuid')
    expect(invalido.error).toMatchObject({ code: '22P02' })
    expect(invalido.status).toBe(400)
  })

  test('entrada idempotente, saída com saldo insuficiente e histórico imutável', async () => {
    const { data: prod } = await A.c.from('produtos').select('id').eq('codigo_interno', 'P0001').single()
    const entrada = { p_loja_id: A.loja, p_produto_id: prod!.id, p_lote: 'l-01', p_validade: '2027-03-31', p_quantidade: 10, p_origem_id: randomUUID() }
    const e1 = await A.c.rpc('registrar_entrada', entrada)
    expect(e1.error).toBeNull()
    expect(typeof e1.data).toBe('number')
    expect((await A.c.rpc('registrar_entrada', entrada)).data).toBe(e1.data) // reenvio não duplica

    const { data: estoque } = await A.c.from('vw_estoque').select('lote_id, lote, validade, saldo').eq('produto_id', prod!.id).single()
    expect(estoque).toMatchObject({ lote: 'L-01', validade: '2027-03-31', saldo: 10 })

    const saida = (quantidade: number) =>
      A.c.from('movimentacoes').insert({ empresa_id: A.empresa, loja_id: A.loja, lote_id: estoque!.lote_id, tipo: 'SAIDA', quantidade })
    const demais = await saida(15)
    expect(demais.error).toMatchObject({ code: 'P0001', message: 'Saldo insuficiente. Disponível neste lote: 10 L', hint: 'SALDO_INSUFICIENTE' })
    expect(demais.status).toBe(400)
    expect((await saida(4)).status).toBe(201)
    expect((await A.c.from('vw_estoque').select('saldo').eq('lote_id', estoque!.lote_id).single()).data).toEqual({ saldo: 6 })

    const alterar = await A.c.from('movimentacoes').update({ quantidade: 1 }).eq('id', e1.data)
    expect(alterar.error).toMatchObject({ code: '42501' })
    expect(alterar.status).toBe(403)
    expect((await A.c.from('movimentacoes').delete().eq('id', e1.data)).error).toMatchObject({ code: '42501' })

    const { data: historico } = await A.c.from('movimentacoes').select('tipo, quantidade, usuario_id').order('id')
    expect(historico).toEqual([
      { tipo: 'ENTRADA', quantidade: 10, usuario_id: A.usuario },
      { tipo: 'SAIDA', quantidade: 4, usuario_id: A.usuario },
    ])
  })

  test('convites: permissão por coluna esconde o hash; link aceito vira membro com o papel certo', async () => {
    const { data: token, error } = await A.c.rpc('criar_convite', { p_empresa: A.empresa, p_papel: 'caixa' })
    expect(error).toBeNull()
    expect(token).toMatch(/^[0-9a-f]{64}$/)

    expect((await A.c.from('convites').select('*')).error).toMatchObject({ code: '42501' })
    const { data: convites } = await A.c.from('convites').select('id, papel, aceito_em')
    expect(convites).toEqual([{ id: expect.any(String), papel: 'caixa', aceito_em: null }])
    expect((await B.c.from('convites').select('id')).data).toEqual([])

    const email = `caixa-${randomUUID().slice(0, 6)}@teste.local`
    const caixaId = await a.supabase.criarUsuario({ email, senha: 'segredo1', nome: 'Carla Caixa' })
    const caixa = await a.entrar(email)
    const aceite = await caixa.rpc('aceitar_convite', { p_token: token })
    expect(aceite.data).toBe(A.empresa)
    expect((await caixa.rpc('aceitar_convite', { p_token: token })).error).toMatchObject({ code: 'P0001' })

    const { data: equipe } = await A.c.from('membros').select('usuario_id, papel, nome').order('papel')
    expect(equipe).toEqual([
      { usuario_id: caixaId, papel: 'caixa', nome: 'Carla Caixa' },
      { usuario_id: A.usuario, papel: 'dono', nome: 'Dono Agro A' },
    ])
    // Caixa não cadastra produto.
    const cadastro = await caixa.from('produtos').insert({ empresa_id: A.empresa, nome: 'X', unidade: 'un' })
    expect(cadastro.error).toMatchObject({ code: '42501' })
    expect(cadastro.error!.message).toContain('row-level security')
  })

  test('função sem retorno responde 204', async () => {
    await A.c.rpc('criar_convite', { p_empresa: A.empresa, p_papel: 'estoquista' })
    const { data: pendente } = await A.c.from('convites').select('id').eq('papel', 'estoquista').single()
    const r = await A.c.rpc('cancelar_convite', { p_convite: pendente!.id })
    expect(r).toMatchObject({ status: 204, data: null, error: null })
    expect((await A.c.from('convites').select('cancelado_em').eq('id', pendente!.id).single()).data!.cancelado_em).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
describe('Tempo real (WebSocket)', LENTO, () => {
  let a: Ambiente
  beforeAll(async () => (a = await subir()), 60_000)
  afterAll(() => a.fechar())

  type Evento = { eventType: string; table: string; new: Record<string, unknown>; old: Record<string, unknown> }

  async function ouvir(c: SupabaseClient, filtro?: string) {
    const eventos: Evento[] = []
    await new Promise<void>((ok, falha) => {
      c.channel(`teste-${randomUUID()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos', ...(filtro ? { filter: filtro } : {}) }, p => eventos.push(p as Evento))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'estoque_saldos' }, p => eventos.push(p as Evento))
        .subscribe((status, erro) => (status === 'SUBSCRIBED' ? ok() : status !== 'CLOSED' && falha(erro ?? new Error(status))))
    })
    return eventos
  }

  const entregue = async () => {
    await a.supabase.tempoReal.ocioso()
    await new Promise(r => setTimeout(r, 150))
  }

  test('cada aparelho só recebe alterações que tem permissão de ver', async () => {
    const A = await a.novaEmpresa('Tempo A')
    const B = await a.novaEmpresa('Tempo B')
    const deA = await ouvir(A.c, `empresa_id=eq.${A.empresa}`)
    const deB = await ouvir(B.c)
    const visitante = await ouvir(a.cliente())

    const { data: p } = await A.c.from('produtos').insert({ empresa_id: A.empresa, nome: 'Adubo', unidade: 'sc' }).select('id').single()
    await vi.waitFor(() => expect(deA.map(e => `${e.table}:${e.eventType}`)).toEqual(['produtos:INSERT']))
    expect(deA[0].new).toMatchObject({ nome: 'Adubo', empresa_id: A.empresa })

    await A.c.rpc('registrar_entrada', { p_loja_id: A.loja, p_produto_id: p!.id, p_lote: '', p_validade: null, p_quantidade: 5 })
    await A.c.rpc('registrar_entrada', { p_loja_id: A.loja, p_produto_id: p!.id, p_lote: '', p_validade: null, p_quantidade: 2 })
    await vi.waitFor(() => expect(deA.filter(e => e.table === 'estoque_saldos').map(e => e.eventType)).toEqual(['INSERT', 'UPDATE']))
    const atualizacao = deA.find(e => e.table === 'estoque_saldos' && e.eventType === 'UPDATE')!
    expect(atualizacao.new).toMatchObject({ saldo: 7 })
    expect(Object.keys(atualizacao.old).sort()).toEqual(['loja_id', 'lote_id']) // só a chave, como no Supabase

    await entregue()
    expect(deB).toEqual([]) // outra empresa: a RLS barra
    expect(visitante).toEqual([])

    await B.c.from('produtos').insert({ empresa_id: B.empresa, nome: 'Só da B', unidade: 'un' })
    await vi.waitFor(() => expect(deB.map(e => e.new.nome)).toEqual(['Só da B']))
    await entregue()
    expect(deA.some(e => e.new.nome === 'Só da B')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
describe('Banco em pasta (servidor local)', LENTO, () => {
  const pasta = mkdtempSync(join(tmpdir(), 'supabase-local-'))
  afterAll(() => rmSync(pasta, { recursive: true, force: true }))

  test('os dados e as sessões sobrevivem a um reinício; migrações não são reaplicadas', async () => {
    const primeiro = await subir({ pasta })
    const todas = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter(f => f.endsWith('.sql')).sort().map(f => f.slice(0, -4))
    expect(primeiro.supabase.migracoesNovas).toEqual(todas)
    const { c, empresa } = await primeiro.novaEmpresa('Persistente')
    const tokens = (await c.auth.getSession()).data.session!
    await primeiro.fechar()

    const segundo = await subir({ pasta })
    try {
      expect(segundo.supabase.migracoesNovas).toEqual([])
      const reaberto = segundo.cliente()
      await reaberto.auth.setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token })
      const { data } = await reaberto.from('empresas').select('id, nome')
      expect(data).toEqual([{ id: empresa, nome: 'Persistente' }])
    } finally {
      await segundo.fechar()
    }
  })
})
