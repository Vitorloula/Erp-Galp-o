// Testa supabase/schema.sql em um PostgreSQL embutido (PGlite),
// simulando o ambiente do Supabase (roles anon/authenticated, auth.uid()).
// Uso: npm run test:sql
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')

const STUB_SUPABASE = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  grant usage on schema public, auth to anon, authenticated;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated;
  create publication supabase_realtime;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`

const db = new PGlite()
let falhas = 0
let ok = 0

function passou(nome) { ok++; console.log('  ✓ ' + nome) }
function falhou(nome, det) { falhas++; console.log('  ✗ ' + nome + (det ? ' -> ' + det : '')) }

async function comoUsuario(uid, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`)
  await db.exec(uid ? 'set role authenticated' : 'set role anon')
  try { return await fn() } finally { await db.exec('reset role') }
}

async function esperaErro(nome, fn, trecho) {
  try {
    await fn()
    falhou(nome, 'deveria ter falhado')
  } catch (e) {
    if (trecho && !String(e.message).includes(trecho)) falhou(nome, 'erro inesperado: ' + e.message)
    else passou(nome + '  [' + e.message.split('\n')[0] + ']')
  }
}

async function saldo(loteId) {
  const r = await db.query('select saldo from public.vw_estoque_lotes where lote_id = $1', [loteId])
  return Number(r.rows[0]?.saldo)
}

console.log('Criando ambiente Supabase simulado...')
await db.exec(STUB_SUPABASE)
console.log('Executando supabase/schema.sql...')
await db.exec(schema)
passou('schema.sql executado sem erros')

// Usuários: o primeiro vira admin; os seguintes nascem pendentes.
const adm = (await db.query(`insert into auth.users (email) values ('admin@galpao.com') returning id`)).rows[0].id
const op = (await db.query(`insert into auth.users (email, raw_user_meta_data) values ('op@galpao.com', '{"nome":"Operador João"}') returning id`)).rows[0].id
const papelDe = async id => (await db.query('select papel from public.perfis where id = $1', [id])).rows[0]?.papel
;(await papelDe(adm)) === 'admin' ? passou('primeiro usuário vira administrador automaticamente') : falhou('primeiro admin', await papelDe(adm))
;(await papelDe(op)) === 'pendente' ? passou('usuários seguintes nascem "pendente"') : falhou('novo usuário pendente', await papelDe(op))

console.log('\nConta pendente (cadastrou-se mas ainda não foi liberada):')
await db.exec(`insert into public.produtos (nome, unidade) values ('Produto pré-existente', 'kg')`)
await comoUsuario(op, async () => {
  const r = await db.query('select count(*)::int as n from public.produtos')
  r.rows[0].n === 0 ? passou('não enxerga nenhum produto') : falhou('pendente vê produtos', r.rows[0].n)
  await esperaErro('não cadastra produto', () => db.query(`insert into public.produtos (nome, unidade) values ('X', 'L')`), 'row-level security')
  await esperaErro('não se libera sozinho', () => db.query(`update public.perfis set papel = 'operador' where id = $1`, [op]).then(x => { if (!x.affectedRows) throw new Error('0 linhas (bloqueado pela RLS)') }))
})

await comoUsuario(adm, async () => {
  const u = await db.query(`update public.perfis set papel = 'operador' where id = $1`, [op])
  u.affectedRows === 1 ? passou('administrador libera a conta como operador') : falhou('admin liberar')
  const proprio = await db.query(`update public.perfis set papel = 'operador' where id = $1`, [adm])
  proprio.affectedRows === 0 ? passou('administrador não altera o próprio papel (evita ficar sem admin)') : falhou('admin alterou o próprio papel')
  await esperaErro('administrador não altera outros campos do perfil', () => db.query(`update public.perfis set email = 'x@x.com' where id = $1`, [op]), 'permission denied')
})
await db.exec(`delete from public.produtos`)

console.log('\nOperador (usuário comum):')
let produtoId, loteA, loteB, entradaId, saidaId
await comoUsuario(op, async () => {
  const p = await db.query(`insert into public.produtos (nome, unidade, codigo_barras, categoria, conteudo_embalagem)
    values ('  Glifosato   480 SL ', 'L', '7891234567895', 'defensivo', 20) returning id, nome, codigo_interno, criado_por`)
  produtoId = p.rows[0].id
  ;/^P\d{4}$/.test(p.rows[0].codigo_interno) && p.rows[0].nome === 'Glifosato 480 SL' && p.rows[0].criado_por === op
    ? passou('cadastra produto (código automático ' + p.rows[0].codigo_interno + ', nome padronizado)')
    : falhou('cadastro de produto', JSON.stringify(p.rows[0]))

  const e1 = await db.query(`select public.registrar_entrada($1, ' lt-01 ', '2026-06-30', 100, 'NF 123', null) as id`, [produtoId])
  entradaId = e1.rows[0].id
  const e2 = await db.query(`select public.registrar_entrada($1, 'LT-01', '2026-06-30', 20, null, null) as id`, [produtoId])
  const lotes = await db.query('select id, lote from public.lotes where produto_id = $1', [produtoId])
  loteA = lotes.rows[0].id
  lotes.rows.length === 1 && lotes.rows[0].lote === 'LT-01'
    ? passou('entradas no mesmo lote reaproveitam o lote (normalizado "LT-01")')
    : falhou('reaproveitar lote', JSON.stringify(lotes.rows))
  ;(await saldo(loteA)) === 120 ? passou('saldo consolidado após entradas = 120') : falhou('saldo após entradas', await saldo(loteA))

  const e3 = await db.query(`select public.registrar_entrada($1, '', null, 5, null, null) as id`, [produtoId])
  loteB = (await db.query(`select lote_id from public.movimentacoes where id = $1`, [e3.rows[0].id])).rows[0].lote_id
  const e4 = await db.query(`select public.registrar_entrada($1, null, null, 5, null, null) as id`, [produtoId])
  const loteB2 = (await db.query(`select lote_id from public.movimentacoes where id = $1`, [e4.rows[0].id])).rows[0].lote_id
  loteB === loteB2 ? passou('lote sem número/validade também é reaproveitado (NULLS NOT DISTINCT)') : falhou('lote nulo reaproveitado')

  const s = await db.query(`insert into public.movimentacoes (tipo, lote_id, quantidade, criado_em, usuario_id)
    values ('SAIDA', $1, 30, '2020-01-01', $2) returning id, criado_em, usuario_id, usuario_nome, produto_id`, [loteA, adm])
  saidaId = s.rows[0].id
  const row = s.rows[0]
  new Date(row.criado_em).getFullYear() >= 2025 ? passou('data/hora é carimbada pelo servidor (tentativa de retroagir ignorada)') : falhou('carimbo de data', row.criado_em)
  row.usuario_id === op && row.usuario_nome === 'Operador João' ? passou('usuário é carimbado pelo servidor (não dá para se passar por outro)') : falhou('carimbo de usuário', JSON.stringify(row))
  row.produto_id === produtoId ? passou('produto da movimentação vem do lote') : falhou('produto da movimentação')
  ;(await saldo(loteA)) === 90 ? passou('saldo após saída = 90') : falhou('saldo após saída', await saldo(loteA))

  await esperaErro('bloqueia saída maior que o saldo', () =>
    db.query(`insert into public.movimentacoes (tipo, lote_id, quantidade) values ('SAIDA', $1, 91)`, [loteA]), 'Saldo insuficiente')
  await esperaErro('bloqueia quantidade zero/negativa em saída', () =>
    db.query(`insert into public.movimentacoes (tipo, lote_id, quantidade) values ('SAIDA', $1, -5)`, [loteA]), 'quantidade_valida')
  await esperaErro('correção exige motivo', () =>
    db.query(`insert into public.movimentacoes (tipo, lote_id, quantidade) values ('CORRECAO', $1, 2)`, [loteA]), 'correcao_com_motivo')
  await esperaErro('correção não pode apontar para outro lote', () =>
    db.query(`insert into public.movimentacoes (tipo, lote_id, quantidade, observacao, referencia_id) values ('CORRECAO', $1, 2, 'erro de digitação', $2)`, [loteB, saidaId]), 'mesmo produto/lote')

  await db.query(`insert into public.movimentacoes (tipo, lote_id, quantidade, observacao, referencia_id) values ('CORRECAO', $1, 5, 'Saída digitada errada: eram 25', $2)`, [loteA, saidaId])
  ;(await saldo(loteA)) === 95 ? passou('movimentação de correção ajusta o saldo (90 + 5 = 95)') : falhou('correção', await saldo(loteA))

  await esperaErro('NÃO altera movimentação (UPDATE)', () =>
    db.query(`update public.movimentacoes set quantidade = 1 where id = $1`, [saidaId]))
  await esperaErro('NÃO exclui movimentação (DELETE)', () =>
    db.query(`delete from public.movimentacoes where id = $1`, [saidaId]))
  await esperaErro('NÃO trunca movimentações', () => db.query(`truncate public.movimentacoes`))

  const up = await db.query(`update public.produtos set nome = 'Hackeado' where id = $1`, [produtoId])
  up.affectedRows === 0 ? passou('operador não edita cadastro de produto (RLS: 0 linhas)') : falhou('operador editou produto')
  await esperaErro('operador não exclui produto', () => db.query(`delete from public.produtos where id = $1`, [produtoId]))
  await esperaErro('operador não exclui lote', () => db.query(`delete from public.lotes where id = $1`, [loteA]))
  const promo = await db.query(`update public.perfis set papel = 'admin' where id = $1`, [op])
  promo.affectedRows === 0 ? passou('operador não se promove a admin (RLS: 0 linhas)') : falhou('operador se promoveu')
  const vis = await db.query('select count(*)::int as n from public.perfis')
  vis.rows[0].n === 1 ? passou('operador só enxerga o próprio perfil') : falhou('visibilidade de perfis', vis.rows[0].n)
})

console.log('\nAdministrador:')
await comoUsuario(adm, async () => {
  const up = await db.query(`update public.produtos set nome = 'Glifosato 480 SL (galão 20 L)' where id = $1`, [produtoId])
  up.affectedRows === 1 ? passou('admin edita cadastro de produto') : falhou('admin editar produto')
  const ul = await db.query(`update public.lotes set validade = '2026-07-31' where id = $1`, [loteA])
  ul.affectedRows === 1 ? passou('admin corrige validade do lote') : falhou('admin editar lote')
  await esperaErro('admin também NÃO altera movimentação', () =>
    db.query(`update public.movimentacoes set quantidade = 1 where id = $1`, [entradaId]))
  await esperaErro('admin também NÃO exclui movimentação', () =>
    db.query(`delete from public.movimentacoes where id = $1`, [entradaId]))
  const vis = await db.query('select count(*)::int as n from public.perfis')
  vis.rows[0].n === 2 ? passou('admin enxerga todos os perfis') : falhou('admin perfis', vis.rows[0].n)
})

console.log('\nVisitante sem login (anon):')
await comoUsuario(null, async () => {
  await esperaErro('não lê produtos', () => db.query('select * from public.produtos'), 'permission denied')
  await esperaErro('não lê estoque', () => db.query('select * from public.vw_estoque_lotes'), 'permission denied')
  await esperaErro('não lança movimentação', () =>
    db.query(`insert into public.movimentacoes (tipo, lote_id, quantidade) values ('ENTRADA', $1, 1)`, [loteA]), 'permission denied')
  await esperaErro('não chama registrar_entrada', () =>
    db.query(`select public.registrar_entrada($1, 'X', null, 1)`, [produtoId]), 'permission denied')
})

console.log('\nDono do banco (postgres):')
await esperaErro('mesmo o dono do banco não apaga o histórico', () => db.query(`delete from public.movimentacoes`), 'não pode ser alterado')

console.log(`\n${ok} verificações OK, ${falhas} falha(s).`)
process.exit(falhas ? 1 : 0)
