import 'fake-indexeddb/auto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'
import { iniciarServidorHttp } from '../../servidor-local/http.ts'
import { CHAVE_ANON_LOCAL, SupabaseLocal } from '../../servidor-local/supabase-local.ts'
import { BancoPdv } from './local'
import { Sincronizador } from './sincronizador'
import { dadosDaVenda, uuidv7, type ItemCarrinho } from './venda'

// O sincronizador do caixa contra o "Supabase" local (banco real), com a rede controlada pelo teste.

let servidor: SupabaseLocal
let http: { url: string; fechar(): Promise<void> }
let rede: 'normal' | 'offline' | 'perder-resposta' = 'normal'
let sb: SupabaseClient
let empresa: string
let loja: string
let caixa: string
let arroz: string

const fetchControlado: typeof fetch = async (entrada, init) => {
  if (rede === 'offline') throw new TypeError('Failed to fetch')
  const r = await fetch(entrada, init)
  if (rede === 'perder-resposta' && String(entrada).includes('/rpc/pdv_sincronizar')) {
    rede = 'normal'
    throw new TypeError('Failed to fetch') // o servidor gravou, mas a resposta não chegou
  }
  return r
}

beforeAll(async () => {
  servidor = await SupabaseLocal.criar({ confirmarEmail: false })
  http = await iniciarServidorHttp(servidor)
  const dono = await servidor.criarUsuario({ email: 'dono@pdv.test', senha: 'segredo1', nome: 'Dona do Caixa' })
  empresa = await servidor.comoUsuario(dono, async tx => (await tx.query<{ id: string }>(`select public.criar_empresa('Mercado', 'mercadinho') as id`)).rows[0].id)
  ;[{ id: loja }] = await servidor.sql<{ id: string }>('select id from public.lojas where empresa_id = $1', [empresa])
  ;[{ id: caixa }] = await servidor.sql<{ id: string }>('select id from public.caixas where empresa_id = $1', [empresa])
  arroz = await servidor.comoUsuario(dono, async tx => {
    const id = (await tx.query<{ id: string }>(`select public.salvar_produto($1, null, $2, $3) as id`, [empresa, { nome: 'Arroz 5kg', unidade: 'un', preco_venda: 27.5 }, JSON.stringify([{ codigo: '7891000000014' }])])).rows[0].id
    await tx.query(`select public.registrar_entrada($1, $2, '', null, 10)`, [loja, id])
    return id
  })
  sb = createClient(http.url, CHAVE_ANON_LOCAL, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetchControlado } })
  await sb.auth.signInWithPassword({ email: 'dono@pdv.test', password: 'segredo1' })
  await sb.rpc('pdv_assumir_caixa', { p_caixa: caixa, p_dispositivo: 'aparelho-teste' })
}, 60_000)

afterAll(async () => {
  await http.fechar()
  await servidor.fechar()
})

afterEach(() => {
  rede = 'normal'
})

let n = 0
async function novoSincronizador(relogio?: () => number) {
  const s = new Sincronizador(new BancoPdv(`teste-${++n}`), sb, empresa, loja, 'aparelho-teste', relogio)
  await s.iniciar()
  return s
}

const itemArroz = (quantidade: number): ItemCarrinho => ({
  id: uuidv7(), produtoId: arroz, descricao: 'Arroz 5kg', unidade: 'un', codigoLido: null, loteId: null, quantidade, precoTabela: 2750, precoUnitario: 2750, descontoItem: 0,
})
let numero = 0
function venda(s: Sincronizador, sessao: string, quantidade: number) {
  const dados = dadosDaVenda({
    caixaId: caixa, sessaoId: sessao, vendaId: uuidv7(), numero: ++numero, ocorridoEm: s.agora().toISOString(),
    itens: [itemArroz(quantidade)], descontoVenda: 0, pagamentos: [{ id: uuidv7(), forma: '01', valor: quantidade * 2750 }],
  })
  return s.enfileirar('venda', dados)
}
const saldoNoServidor = async () => Number((await servidor.sql<{ s: string }>('select sum(saldo) as s from public.estoque_saldos where produto_id = $1', [arroz]))[0].s)

describe('Sincronizador do caixa', { timeout: 30_000 }, () => {
  test('baixa o catálogo completo e depois só o que mudou', async () => {
    const s = await novoSincronizador()
    await s.baixarCatalogo()
    const p = await s.banco.produtos.get(arroz)
    expect(p).toMatchObject({ nome: 'Arroz 5kg', preco_venda: 27.5, saldo: expect.any(Number) })
    expect(await s.banco.codigos.get('07891000000014')).toMatchObject({ produto_id: arroz, fator: 1 })
    expect(await s.banco.produtos.where('codigo_interno').equals('DIVERSOS').count()).toBe(1)

    await servidor.sql(`update public.produtos set preco_venda = 29.9 where id = $1`, [arroz])
    await s.baixarCatalogo()
    expect((await s.banco.produtos.get(arroz))!.preco_venda).toBe(29.9)
    await servidor.sql(`update public.produtos set preco_venda = 27.5 where id = $1`, [arroz])
  })

  test('vende sem internet; tudo vai quando a conexão volta, uma vez só', async () => {
    const s = await novoSincronizador()
    const antes = await saldoNoServidor()
    rede = 'offline'
    const sessao = uuidv7()
    await s.enfileirar('abrir_sessao', { caixa_id: caixa, sessao_id: sessao, aberta_em: s.agora().toISOString(), valor_abertura: 50 })
    await venda(s, sessao, 2)
    await s.sincronizar()
    expect(s.atual).toMatchObject({ situacao: 'offline', pendentes: 2 })
    expect(await saldoNoServidor()).toBe(antes)

    rede = 'normal'
    await s.sincronizar()
    expect(s.atual).toMatchObject({ situacao: 'ok', pendentes: 0, invalidos: 0 })
    expect(await saldoNoServidor()).toBe(antes - 2)
    await s.sincronizar()
    expect(await saldoNoServidor()).toBe(antes - 2)
  })

  test('resposta perdida depois de gravar: reenvia sem duplicar', async () => {
    const s = await novoSincronizador()
    const sessao = uuidv7()
    await s.enfileirar('abrir_sessao', { caixa_id: caixa, sessao_id: sessao, aberta_em: s.agora().toISOString(), valor_abertura: 0 })
    await s.sincronizar()
    const antes = await saldoNoServidor()
    const vendas = async () => Number((await servidor.sql<{ n: number }>('select count(*)::int as n from public.vendas where sessao_id = $1', [sessao]))[0].n)

    rede = 'offline'
    await venda(s, sessao, 1)
    await s.sincronizar()
    rede = 'perder-resposta'
    await s.sincronizar()
    expect(s.atual.pendentes).toBe(1) // o aparelho não sabe que deu certo
    expect(await vendas()).toBe(1) // mas o servidor gravou

    await s.sincronizar()
    expect(s.atual.pendentes).toBe(0)
    expect(await vendas()).toBe(1)
    expect(await saldoNoServidor()).toBe(antes - 1)
  })

  test('evento recusado fica guardado com o motivo, sem travar os outros', async () => {
    const s = await novoSincronizador()
    const sessao = uuidv7()
    await s.enfileirar('abrir_sessao', { caixa_id: caixa, sessao_id: sessao, aberta_em: s.agora().toISOString(), valor_abertura: 0 })
    const ruim = await venda(s, sessao, 1)
    await s.banco.fila.update(ruim.ordem!, { dados: { ...ruim.dados, total: 1 } })
    await venda(s, sessao, 1)
    await s.sincronizar()
    expect(s.atual).toMatchObject({ pendentes: 0, invalidos: 1 })
    const [guardado] = await s.banco.fila.toArray()
    expect(guardado).toMatchObject({ id: ruim.id, invalido: true, erro: expect.stringContaining('Total da venda não confere') })
  })

  test('relógio do aparelho errado: os eventos saem com a hora do servidor', async () => {
    const s = await novoSincronizador(() => Date.now() + 3 * 3600_000) // aparelho 3 h adiantado
    await s.baixarCatalogo()
    expect(Math.abs(s.atual.desvioRelogio + 3 * 3600_000)).toBeLessThan(60_000)
    expect(Math.abs(s.agora().getTime() - Date.now())).toBeLessThan(60_000)
  })

  test('guarda a licença (estado da assinatura) para abrir o caixa sem internet', async () => {
    const s = await novoSincronizador()
    await s.sincronizar()
    expect(await s.banco.ler('licenca')).toMatchObject({ estado: 'ativa', papel: 'dono' })
  })
})
