// Testa as migrações de supabase/migrations num PostgreSQL embutido (PGlite),
// simulando o ambiente do Supabase (roles anon/authenticated, auth.uid(), auth.jwt()).
// Uso: npm run test:sql
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'

const PASTA = new URL('../supabase/migrations/', import.meta.url)
const migracoes = readdirSync(PASTA).filter(f => /^\d{14}_.+\.sql$/.test(f)).sort()

// Mesmo ambiente simulado usado pelo servidor local (roles, auth.users, auth.uid(), auth.jwt()).
const AMBIENTE_SUPABASE = readFileSync(new URL('../servidor-local/ambiente-supabase.sql', import.meta.url), 'utf8')

const db = new PGlite()
let ok = 0
let falhas = 0
const emails = new Map()

const passou = nome => { ok++; console.log('  ✓ ' + nome) }
const falhou = (nome, det) => { falhas++; console.log('  ✗ ' + nome + (det ? ' -> ' + det : '')) }
const secao = titulo => console.log('\n' + titulo)
const confere = (cond, nome, det) => (cond ? passou(nome) : falhou(nome, det))
const um = async (sql, params) => (await db.query(sql, params)).rows[0]

async function comoUsuario(uid, fn) {
  await db.exec('reset role')
  const claims = uid ? JSON.stringify({ sub: uid, email: emails.get(uid), role: 'authenticated' }) : ''
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`, [uid ?? '', claims])
  await db.exec(uid ? 'set role authenticated' : 'set role anon')
  try { return await fn() } finally { await db.exec('reset role') }
}

async function esperaErro(nome, fn, trecho) {
  try {
    await fn()
    falhou(nome, 'deveria ter falhado')
  } catch (e) {
    if (trecho && !(trecho instanceof RegExp ? trecho.test(e.message) : e.message.includes(trecho))) falhou(nome, 'erro inesperado: ' + e.message)
    else passou(`${nome}  [${e.message.split('\n')[0].slice(0, 90)}]`)
  }
}

/** UPDATE/DELETE que não pode afetar nada: aceita 0 linhas ou permissão negada. */
async function semEfeito(nome, fn) {
  try {
    const r = await fn()
    confere(r.affectedRows === 0, nome, `${r.affectedRows} linha(s) afetada(s)`)
  } catch (e) {
    if (/permission denied|row-level security/.test(e.message)) passou(nome + '  [negado]')
    else falhou(nome, 'erro inesperado: ' + e.message)
  }
}

async function criarUsuario(email, nome) {
  const id = (await um(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, JSON.stringify({ nome })])).id
  emails.set(id, email)
  return id
}

// ======================================================================
console.log('Criando ambiente Supabase simulado...')
await db.exec(AMBIENTE_SUPABASE)
for (const m of migracoes) {
  await db.exec(readFileSync(new URL(m, PASTA), 'utf8'))
  passou(`migração ${m}`)
}

// ----------------------------------------------------------------------
secao('Estrutura (metatestes — falham se alguém criar tabela sem proteção):')
{
  const tabelas = (await db.query(`select c.relname as nome, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' order by 1`)).rows
  const semRls = tabelas.filter(t => !t.rls).map(t => t.nome)
  confere(semRls.length === 0, `todas as ${tabelas.length} tabelas têm RLS ligado`, semRls.join(', '))

  const sistema = ['perfis', 'planos', 'plataforma_admins', 'empresas']
  const comEmpresa = new Set((await db.query(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'empresa_id'`)).rows.map(r => r.table_name))
  const semEmpresa = tabelas.map(t => t.nome).filter(t => !sistema.includes(t) && !comEmpresa.has(t))
  confere(semEmpresa.length === 0, 'toda tabela de negócio tem empresa_id', semEmpresa.join(', '))

  const politicas = (await db.query(`select tablename, policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr from pg_policies where schemaname = 'public'`)).rows
  const diretas = politicas.filter(p => [...p.expr.matchAll(/(\(?\s*SELECT\s+)?\b(auth|app)\.\w+\(/gi)].some(m => !m[1])).map(p => `${p.tablename}.${p.policyname}`)
  confere(diretas.length === 0, `as ${politicas.length} políticas chamam funções via (select …) (avaliadas uma vez por consulta)`, diretas.join(', '))

  const anonLe = (await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v') and has_table_privilege('anon', c.oid, 'select')`)).rows.map(r => r.relname)
  confere(anonLe.length === 0, 'visitante sem login não tem acesso a nenhuma tabela ou visão', anonLe.join(', '))

  // Única exceção: ver o convite antes de criar a conta (só com o token em mãos).
  const anonExec = (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app') and has_function_privilege('anon', p.oid, 'execute')`)).rows.map(r => r.proname)
  confere(anonExec.join() === 'ver_convite', 'visitante sem login só executa ver_convite', anonExec.join(', '))
}

// ----------------------------------------------------------------------
secao('Cadastro e criação de empresas:')
const donoA = await criarUsuario('ana@galpao.test', 'Ana Dona')
const donoB = await criarUsuario('bruno@mercado.test', 'Bruno Dono')
const estoquista = await criarUsuario('edu@galpao.test', 'Edu Estoque')
const caixa = await criarUsuario('carla@galpao.test', 'Carla Caixa')
const gerente = await criarUsuario('gil@galpao.test', 'Gil Gerente')
const lojista1 = await criarUsuario('lia@galpao.test', 'Lia Loja 1')
const intruso = await criarUsuario('ivo@outro.test', 'Ivo Intruso')

await comoUsuario(donoA, async () => {
  confere((await um('select count(*)::int as n from public.empresas')).n === 0, 'conta nova não enxerga nenhuma empresa')
})
const empA = await comoUsuario(donoA, async () => (await um(`select public.criar_empresa('Galpão Agro', 'galpao') as id`)).id)
const empB = await comoUsuario(donoB, async () => (await um(`select public.criar_empresa('Mercadinho Bom Preço', 'mercadinho', 'Matriz') as id`)).id)
let lojaA1, lojaB1
await comoUsuario(donoA, async () => {
  const e = await um('select e.segmento, a.plano_id, a.status, a.trial_ate > now() + interval \'13 days\' as trial_ok from public.empresas e join public.assinaturas a on a.empresa_id = e.id')
  confere(e.segmento === 'galpao' && e.plano_id === 'teste' && e.status === 'trial' && e.trial_ok, 'criar_empresa: empresa + teste grátis de 14 dias', JSON.stringify(e))
  lojaA1 = (await um('select id from public.lojas')).id
  confere(!!lojaA1, 'criar_empresa: loja principal criada')
  const m = await um('select papel from public.membros where usuario_id = $1', [donoA])
  confere(m?.papel === 'dono', 'criar_empresa: quem cria vira dono')
  const cats = (await db.query('select nome from public.categorias order by nome')).rows.map(r => r.nome)
  confere(cats.includes('Defensivo agrícola') && cats.length === 5, 'categorias padrão do segmento galpão', cats.join(', '))
})
await comoUsuario(donoB, async () => {
  lojaB1 = (await um('select id from public.lojas')).id
  const cfg = (await um('select config from public.empresas')).config
  confere(cfg.venda_sem_estoque === 'permitir' && cfg.balanca?.prefixo === '2', 'mercadinho já vem com venda sem estoque e etiqueta de balança', JSON.stringify(cfg))
  confere((await um('select count(*)::int as n from public.empresas')).n === 1, 'cada dono só enxerga a própria empresa')
})

// ----------------------------------------------------------------------
secao('Convites e papéis:')
const convidar = (quem, papel, email, lojas = null) =>
  comoUsuario(quem, async () => (await um('select public.criar_convite($1, $2, $3, $4) as t', [empA, papel, email, lojas])).t)

const tEst = await convidar(donoA, 'estoquista', 'edu@galpao.test')
confere(/^[0-9a-f]{64}$/.test(tEst), 'dono gera convite com token de 64 caracteres')
await comoUsuario(intruso, () => esperaErro('convite para outro e-mail não pode ser usado', () => db.query('select public.aceitar_convite($1)', [tEst]), 'outro e-mail'))
await comoUsuario(estoquista, async () => {
  confere((await um('select public.aceitar_convite($1) as e', [tEst])).e === empA, 'convidado aceita e entra na empresa')
})
await comoUsuario(estoquista, () => esperaErro('o mesmo convite não serve duas vezes', () => db.query('select public.aceitar_convite($1)', [tEst]), 'já utilizado'))

const tCaixa = await convidar(donoA, 'caixa', null)
await comoUsuario(caixa, async () => { await db.query('select public.aceitar_convite($1)', [tCaixa]) })
passou('convite sem e-mail (link para WhatsApp) funciona uma vez')
const tGer = await convidar(donoA, 'gerente', 'gil@galpao.test')
await comoUsuario(gerente, async () => { await db.query('select public.aceitar_convite($1)', [tGer]) })

const tExp = await convidar(donoA, 'caixa', 'ivo@outro.test')
await db.query(`update public.convites set expira_em = now() - interval '1 minute' where email = 'ivo@outro.test'`)
await comoUsuario(intruso, () => esperaErro('convite expirado é recusado', () => db.query('select public.aceitar_convite($1)', [tExp]), 'expirado'))
await comoUsuario(intruso, () => esperaErro('token inventado é recusado', () => db.query('select public.aceitar_convite($1)', ['0'.repeat(64)]), 'inválido'))

await comoUsuario(gerente, () => esperaErro('gerente não convida outro gerente', () => db.query('select public.criar_convite($1, $2)', [empA, 'gerente']), 'Somente o dono'))
await comoUsuario(caixa, () => esperaErro('caixa não convida ninguém', () => db.query('select public.criar_convite($1, $2)', [empA, 'caixa']), 'Somente dono ou gerente'))
await comoUsuario(estoquista, async () => {
  confere((await um('select count(*)::int as n from public.convites')).n === 0, 'estoquista não vê a lista de convites')
})
await comoUsuario(donoA, async () => {
  confere((await um('select count(*)::int as n from public.convites')).n === 4, 'dono vê os convites da empresa')
  await esperaErro('ninguém lê o hash do token', () => db.query('select token_hash from public.convites'), 'permission denied')
})

// ----------------------------------------------------------------------
secao('Catálogo:')
let prodA, prodB
await comoUsuario(donoA, async () => {
  const p = await um(`insert into public.produtos (empresa_id, nome, unidade, preco_venda, rastreio) values ($1, '  Glifosato   480 SL ', 'L', 89.9, 'lote') returning id, nome, codigo_interno, versao`, [empA])
  prodA = p.id
  confere(p.codigo_interno === 'P0001' && p.nome === 'Glifosato 480 SL', 'código interno automático por empresa e nome padronizado', JSON.stringify(p))
  const c = await um(`insert into public.produtos_codigos (empresa_id, produto_id, codigo) values ($1, $2, '7891000000014') returning codigo`, [empA, prodA])
  confere(c.codigo === '07891000000014', 'EAN-13 guardado como GTIN-14 (busca direta)')
  await esperaErro('código de barras repetido na mesma empresa', () =>
    db.query(`insert into public.produtos_codigos (empresa_id, produto_id, codigo) values ($1, $2, '07891000000014')`, [empA, prodA]), 'duplicate key')
})
await comoUsuario(donoB, async () => {
  const p = await um(`insert into public.produtos (empresa_id, nome, unidade, preco_venda, pesavel, codigo_balanca) values ($1, 'Queijo mussarela', 'kg', 49.9, true, '0042') returning id, codigo_interno`, [empB])
  prodB = p.id
  confere(p.codigo_interno === 'P0001', 'outra empresa também começa do P0001 (numeração independente)')
  await db.query(`insert into public.produtos_codigos (empresa_id, produto_id, codigo) values ($1, $2, '7891000000014')`, [empB, prodB])
  passou('o mesmo código de barras pode existir em empresas diferentes')
})
await comoUsuario(caixa, () => esperaErro('caixa não cadastra produto', () =>
  db.query(`insert into public.produtos (empresa_id, nome, unidade) values ($1, 'X', 'un')`, [empA]), 'row-level security'))
await comoUsuario(estoquista, async () => {
  await db.query(`insert into public.produtos (empresa_id, nome, unidade) values ($1, 'Ureia 45%', 'sc')`, [empA])
  const r = await db.query(`update public.produtos set preco_venda = 95 where id = $1`, [prodA])
  confere(r.affectedRows === 1, 'estoquista cadastra e edita produtos')
})
await comoUsuario(caixa, async () => {
  confere((await um('select count(*)::int as n from public.produtos')).n === 2, 'caixa consulta o catálogo da empresa')
})

// ----------------------------------------------------------------------
secao('Estoque por loja e histórico imutável:')
let entrada1, loteA, lojaA2
await comoUsuario(estoquista, async () => {
  const origem = '11111111-1111-4111-8111-111111111111'
  entrada1 = (await um(`select public.registrar_entrada($1, $2, ' lt-01 ', '2027-06-30', 120, 'NF 1', null, $3) as id`, [lojaA1, prodA, origem])).id
  const repetida = (await um(`select public.registrar_entrada($1, $2, 'LT-01', '2027-06-30', 120, 'NF 1', null, $3) as id`, [lojaA1, prodA, origem])).id
  confere(repetida === entrada1, 'reenvio da mesma entrada (mesmo origem_id) não duplica')
  const s = await um('select lote_id, lote, saldo from public.vw_estoque where produto_id = $1', [prodA])
  loteA = s.lote_id
  confere(s.lote === 'LT-01' && Number(s.saldo) === 120, 'saldo materializado = 120 e lote normalizado', JSON.stringify(s))

  const m = await um(`insert into public.movimentacoes (empresa_id, loja_id, lote_id, tipo, quantidade, ocorrido_em, usuario_id, origem)
    values ($1, $2, $3, 'SAIDA', 30, '2020-01-01', $4, 'manual') returning ocorrido_em, usuario_id, usuario_nome`, [empA, lojaA1, loteA, donoA])
  confere(new Date(m.ocorrido_em).getFullYear() >= 2026 && m.usuario_id === estoquista && m.usuario_nome === 'Edu Estoque',
    'data e autor carimbados pelo servidor (não dá para retroagir nem lançar em nome de outro)', JSON.stringify(m))
  await esperaErro('saída maior que o saldo', () =>
    db.query(`insert into public.movimentacoes (empresa_id, loja_id, lote_id, tipo, quantidade) values ($1, $2, $3, 'SAIDA', 91)`, [empA, lojaA1, loteA]), 'Saldo insuficiente. Disponível neste lote: 90 L')
  await esperaErro('ajuste exige motivo', () =>
    db.query(`insert into public.movimentacoes (empresa_id, loja_id, lote_id, tipo, quantidade) values ($1, $2, $3, 'AJUSTE', -2)`, [empA, lojaA1, loteA]), 'ajuste_com_motivo')
  await db.query(`insert into public.movimentacoes (empresa_id, loja_id, lote_id, tipo, quantidade, observacao, referencia_id)
    values ($1, $2, $3, 'CORRECAO', 5, 'Saída eram 25', $4)`, [empA, lojaA1, loteA, entrada1])
  confere(Number((await um('select saldo from public.vw_estoque where lote_id = $1', [loteA])).saldo) === 95, 'correção vinculada ajusta o saldo (90 + 5)')
  await esperaErro('lançamento de PDV não entra por inserção direta', () =>
    db.query(`insert into public.movimentacoes (empresa_id, loja_id, lote_id, tipo, quantidade, origem) values ($1, $2, $3, 'SAIDA', 1, 'pdv')`, [empA, lojaA1, loteA]), 'row-level security')
  await esperaErro('venda não entra por inserção direta', () =>
    db.query(`insert into public.movimentacoes (empresa_id, loja_id, lote_id, tipo, quantidade) values ($1, $2, $3, 'VENDA', 1)`, [empA, lojaA1, loteA]), 'row-level security')
  await esperaErro('não altera movimentação', () => db.query(`update public.movimentacoes set quantidade = 1 where id = $1`, [entrada1]), 'permission denied')
  await esperaErro('não exclui movimentação', () => db.query(`delete from public.movimentacoes where id = $1`, [entrada1]), 'permission denied')
  await esperaErro('não altera o saldo diretamente', () => db.query(`update public.estoque_saldos set saldo = 9999`), 'permission denied')
})
await comoUsuario(caixa, () => esperaErro('caixa não faz lançamento manual de estoque', () =>
  db.query(`insert into public.movimentacoes (empresa_id, loja_id, lote_id, tipo, quantidade) values ($1, $2, $3, 'ENTRADA', 1)`, [empA, lojaA1, loteA]), 'row-level security'))
await esperaErro('nem o dono do banco apaga o histórico', () => db.query('delete from public.movimentacoes'), 'não pode ser alterado')

await comoUsuario(donoA, async () => {
  lojaA2 = (await um(`insert into public.lojas (empresa_id, nome) values ($1, 'Filial Rio Verde') returning id`, [empA])).id
  await db.query(`select public.registrar_entrada($1, $2, 'LT-01', '2027-06-30', 40)`, [lojaA2, prodA])
  const porLoja = (await db.query('select loja_id, saldo from public.vw_estoque where lote_id = $1 order by saldo', [loteA])).rows
  confere(porLoja.length === 2 && Number(porLoja[0].saldo) === 40 && Number(porLoja[1].saldo) === 95, 'mesmo lote com saldo separado por loja (40 e 95)', JSON.stringify(porLoja))
  await esperaErro('correção não pode apontar para lançamento de outra loja', () =>
    db.query(`insert into public.movimentacoes (empresa_id, loja_id, lote_id, tipo, quantidade, observacao, referencia_id) values ($1, $2, $3, 'CORRECAO', 1, 'teste', $4)`, [empA, lojaA2, loteA, entrada1]), 'mesmo produto, lote e loja')
})
const tLoja1 = await convidar(donoA, 'estoquista', 'lia@galpao.test', [lojaA1])
await comoUsuario(lojista1, async () => {
  await db.query('select public.aceitar_convite($1)', [tLoja1])
  const lojas = (await db.query('select distinct loja_id from public.vw_estoque')).rows
  confere(lojas.length === 1 && lojas[0].loja_id === lojaA1, 'funcionário restrito à loja 1 só vê o estoque da loja 1')
  confere((await um('select count(*)::int as n from public.movimentacoes where loja_id = $1', [lojaA2])).n === 0, '…e não vê o histórico da filial')
  await esperaErro('…nem lança na filial', () => db.query(`select public.registrar_entrada($1, $2, 'X', null, 1)`, [lojaA2, prodA]), 'row-level security')
})
{
  // Desempenho: o custo de um lançamento não pode crescer com o tamanho do histórico
  // (num mercadinho, o mesmo produto recebe milhares de vendas por mês).
  await db.exec(`create function pg_temp.medir(p_empresa uuid, p_loja uuid, p_lote uuid, n int) returns numeric language plpgsql as $$
    declare t timestamptz := clock_timestamp();
    begin
      for i in 1..n loop
        insert into public.movimentacoes (empresa_id, loja_id, lote_id, tipo, quantidade, origem) values (p_empresa, p_loja, p_lote, 'ENTRADA', 1, 'sistema');
      end loop;
      return extract(epoch from clock_timestamp() - t) * 1000 / n;
    end $$`)
  const inicio = Number((await um('select pg_temp.medir($1, $2, $3, 300) as ms', [empA, lojaA1, loteA])).ms)
  await db.query(`insert into public.movimentacoes (empresa_id, loja_id, lote_id, tipo, quantidade, origem)
    select $1, $2, $3, 'ENTRADA', 1, 'sistema' from generate_series(1, 10000)`, [empA, lojaA1, loteA])
  const depois = Number((await um('select pg_temp.medir($1, $2, $3, 300) as ms', [empA, lojaA1, loteA])).ms)
  confere(depois < inicio * 2.5 + 0.2, `lançamento custa o mesmo com 10 mil registros no lote (${inicio.toFixed(2)} ms → ${depois.toFixed(2)} ms)`)
}
confere((await db.query('select * from app.verificar_saldos()')).rows.length === 0, 'saldo materializado confere com a soma do histórico')

// ----------------------------------------------------------------------
secao('Isolamento entre empresas (matriz automática — empresa A tentando acessar a B):')
await comoUsuario(donoB, async () => {
  await db.query(`select public.registrar_entrada($1, $2, '', null, 10)`, [lojaB1, prodB])
  await db.query(`select public.criar_convite($1, 'caixa')`, [empB])
  await db.query(`insert into public.categorias (empresa_id, nome) values ($1, 'Frios')`, [empB])
})
{
  const objetos = (await db.query(`select c.table_name as nome, t.table_type as tipo from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'empresa_id' order by 1`)).rows
  const colunasUpdate = new Map()
  for (const o of objetos) {
    const c = await um(`select column_name from information_schema.column_privileges where table_schema = 'public' and table_name = $1 and grantee = 'authenticated' and privilege_type = 'UPDATE' limit 1`, [o.nome])
    colunasUpdate.set(o.nome, c?.column_name ?? 'empresa_id')
  }
  await comoUsuario(donoA, async () => {
    for (const { nome, tipo } of objetos) {
      const n = (await um(`select count(*)::int as n from public.${nome} where empresa_id = $1`, [empB])).n
      confere(n === 0, `${nome}: não lê dados da outra empresa`, `${n} linha(s) visível(is)`)
      if (tipo === 'VIEW') continue
      const col = colunasUpdate.get(nome)
      await semEfeito(`${nome}: não altera dados da outra empresa`, () => db.query(`update public.${nome} set ${col} = ${col} where empresa_id = $1`, [empB]))
      await semEfeito(`${nome}: não apaga dados da outra empresa`, () => db.query(`delete from public.${nome} where empresa_id = $1`, [empB]))
    }
  })
  passou(`matriz cobriu ${objetos.length} tabelas/visões com empresa_id`)
}
await comoUsuario(donoA, async () => {
  const catB = (await um(`select id from public.categorias where empresa_id = $1 limit 1`, [empB]))?.id
  confere(catB === undefined, 'ids da outra empresa não aparecem nem por consulta direta')
  const loteB = (await db.query(`select id from public.lotes where empresa_id = $1`, [empB])).rows
  confere(loteB.length === 0, 'lotes da outra empresa invisíveis')
})
const [loteDeB] = (await db.query(`select id from public.lotes where empresa_id = $1`, [empB])).rows
const [catDeB] = (await db.query(`select id from public.categorias where empresa_id = $1`, [empB])).rows
await comoUsuario(donoA, async () => {
  await esperaErro('não cria produto dentro da outra empresa', () =>
    db.query(`insert into public.produtos (empresa_id, nome, unidade) values ($1, 'Invasor', 'un')`, [empB]), 'row-level security')
  await esperaErro('não vincula lote próprio a produto da outra empresa (FK composta)', () =>
    db.query(`insert into public.lotes (empresa_id, produto_id, lote) values ($1, $2, 'X')`, [empA, prodB]), 'foreign key')
  await esperaErro('não vincula código de barras a produto da outra empresa', () =>
    db.query(`insert into public.produtos_codigos (empresa_id, produto_id, codigo) values ($1, $2, '123')`, [empA, prodB]), 'foreign key')
  await esperaErro('não lança movimentação em lote da outra empresa', () =>
    db.query(`insert into public.movimentacoes (empresa_id, loja_id, lote_id, tipo, quantidade) values ($1, $2, $3, 'ENTRADA', 1)`, [empA, lojaA1, loteDeB.id]), /Lote não encontrado|foreign key/)
  await esperaErro('não usa categoria da outra empresa', () =>
    db.query(`update public.produtos set categoria_id = $1 where id = $2`, [catDeB.id, prodA]), 'foreign key')
  await esperaErro('não registra entrada de produto da outra empresa', () =>
    db.query(`select public.registrar_entrada($1, $2, 'X', null, 1)`, [lojaA1, prodB]), 'Produto não encontrado')
  await esperaErro('não registra entrada na loja da outra empresa', () =>
    db.query(`select public.registrar_entrada($1, $2, 'X', null, 1)`, [lojaB1, prodA]), /foreign key|row-level security/)
  await esperaErro('não convida pessoas para a outra empresa', () =>
    db.query(`select public.criar_convite($1, 'caixa')`, [empB]), 'Somente dono ou gerente')
  await esperaErro('não se adiciona como membro de outra empresa', () =>
    db.query(`insert into public.membros (empresa_id, usuario_id, papel) values ($1, $2, 'dono')`, [empB, donoA]), 'permission denied')
  const perfisVisiveis = (await db.query('select id from public.perfis')).rows.map(r => r.id)
  confere(!perfisVisiveis.includes(donoB), 'não vê os dados pessoais de quem é só da outra empresa')
})
await comoUsuario(intruso, async () => {
  const n = (await um(`select (select count(*) from public.produtos) + (select count(*) from public.movimentacoes) + (select count(*) from public.empresas) as n`)).n
  confere(Number(n) === 0, 'conta sem empresa não vê nada de ninguém')
})

// ----------------------------------------------------------------------
secao('Equipe:')
await comoUsuario(donoA, async () => {
  const r = await db.query(`update public.membros set papel = 'caixa' where usuario_id = $1`, [donoA])
  confere(r.affectedRows === 0, 'dono não altera o próprio papel')
  const r2 = await db.query(`update public.membros set papel = 'caixa' where usuario_id = $1 and empresa_id = $2`, [estoquista, empA])
  confere(r2.affectedRows === 1, 'dono muda o papel de outra pessoa')
})
await comoUsuario(gerente, async () => {
  const r = await db.query(`update public.membros set papel = 'gerente' where usuario_id = $1`, [caixa])
  confere(r.affectedRows === 0, 'gerente não altera papéis (só o dono)')
})
await esperaErro('empresa nunca fica sem dono', () => db.query(`delete from public.membros where usuario_id = $1 and empresa_id = $2`, [donoA, empA]), 'pelo menos um dono')
{
  const antes = (await um('select count(*)::int as n from public.movimentacoes where usuario_id = $1', [estoquista])).n
  await db.query('delete from auth.users where id = $1', [estoquista])
  const depois = await um('select count(*)::int as n, min(usuario_nome) as nome from public.movimentacoes where usuario_id = $1', [estoquista])
  confere(depois.n === antes && depois.nome === 'Edu Estoque', `excluir funcionário preserva o histórico (${antes} lançamentos de "${depois.nome}")`)
}
await esperaErro('excluir a conta do único dono é bloqueado (transferir antes)', () => db.query('delete from auth.users where id = $1', [donoB]), 'pelo menos um dono')

// ----------------------------------------------------------------------
secao('Funções das telas:')
await comoUsuario(donoA, async () => {
  const e = (await db.query('select * from public.minhas_empresas()')).rows
  confere(e.length === 1 && e[0].empresa_id === empA && e[0].papel === 'dono' && e[0].estado === 'ativa' && e[0].plano_id === 'teste',
    'minhas_empresas: empresa, papel e estado da assinatura', JSON.stringify(e))
})
await comoUsuario(caixa, async () => {
  const e = (await db.query('select papel, nome from public.minhas_empresas()')).rows
  confere(e.length === 1 && e[0].papel === 'caixa' && e[0].nome === 'Galpão Agro', 'minhas_empresas: caixa vê a empresa em que trabalha')
})
await comoUsuario(intruso, async () => {
  confere((await db.query('select * from public.minhas_empresas()')).rows.length === 0, 'minhas_empresas: quem não é membro não vê nada')
})
{
  const t = await convidar(donoA, 'caixa', null)
  const ver = async token => comoUsuario(null, async () => (await db.query('select * from public.ver_convite($1)', [token])).rows)
  const v = await ver(t)
  confere(v.length === 1 && v[0].empresa === 'Galpão Agro' && v[0].papel === 'caixa' && v[0].situacao === 'valido',
    'ver_convite: visitante com o link vê empresa e papel', JSON.stringify(v))
  await comoUsuario(intruso, async () => { await db.query('select public.aceitar_convite($1)', [t]) })
  confere((await ver(t))[0]?.situacao === 'usado', 'ver_convite: convite aceito aparece como usado')
  confere((await ver('f'.repeat(64))).length === 0, 'ver_convite: token inventado não revela nada')
  await db.query('delete from public.membros where usuario_id = $1 and empresa_id = $2', [intruso, empA])
}
{
  const salvar = (quem, empresa, id, dados, codigos = []) =>
    comoUsuario(quem, async () => (await um('select public.salvar_produto($1, $2, $3, $4) as id', [empresa, id, dados, JSON.stringify(codigos)])).id)
  const dados = { nome: 'Lambda-cialotrina 50 EC', unidade: 'L', preco_venda: 96, rastreio: 'lote' }
  const novo = await salvar(gerente, empA, null, dados, [{ codigo: '7891000000045' }, { codigo: '17891000000042', fator: 12 }])
  const cods = (await db.query('select codigo, fator::float as fator from public.produtos_codigos where produto_id = $1 order by codigo', [novo])).rows
  confere(cods.length === 2 && cods[0].codigo === '07891000000045' && cods[1].fator === 12, 'salvar_produto: produto e códigos (com fator da caixa) juntos', JSON.stringify(cods))
  await salvar(gerente, empA, novo, { ...dados, preco_venda: 99 }, [{ codigo: '7891000000045' }])
  const depois = await um('select (select count(*)::int from public.produtos_codigos where produto_id = $1) as n, preco_venda::float as preco from public.produtos where id = $1', [novo])
  confere(depois.n === 1 && depois.preco === 99, 'salvar_produto: edição atualiza dados e remove código retirado')
  await esperaErro('salvar_produto: código de outro produto é recusado com o nome dele',
    () => salvar(gerente, empA, novo, dados, [{ codigo: '7891000000014' }]), 'já está cadastrado no produto "Glifosato 480 SL"')
  confere((await um('select count(*)::int as n from public.produtos_codigos where produto_id = $1', [novo])).n === 1, '…e nada muda (tudo ou nada)')
  await esperaErro('salvar_produto: caixa não cadastra', () => salvar(caixa, empA, null, dados), 'row-level security')
  await esperaErro('salvar_produto: outra empresa não cadastra na minha', () => salvar(intruso, empA, null, dados), 'row-level security')
  await esperaErro('salvar_produto: outra empresa não edita produto meu', () => salvar(intruso, empA, prodA, dados), 'não encontrado')
}
{
  const novato = await criarUsuario('nina@exemplo.test', 'Nina Novata')
  const emp = await comoUsuario(novato, async () => (await um('select public.criar_empresa_exemplo() as id')).id)
  await comoUsuario(novato, async () => {
    const c = await um(`select (select count(*)::int from public.produtos) as produtos, (select count(*)::int from public.produtos_codigos) as codigos,
      (select count(*)::int from public.lotes) as lotes, (select nome from public.empresas) as nome`)
    confere(c.produtos === 12 && c.codigos === 9 && c.lotes === 13 && c.nome === 'Agro Exemplo', 'empresa de exemplo: 12 produtos, 9 códigos de barras, 13 lotes', JSON.stringify(c))
    const saldo = async (produto, lote) => Number((await um(`select s.saldo from public.vw_estoque s join public.produtos p on p.id = s.produto_id
      where p.nome = $1 and s.lote = $2`, [produto, lote])).saldo)
    confere(await saldo('Glifosato 480 SL', 'GL2508') === 260, 'exemplo: Glifosato com 260 L (400 − 160 + correção de 20)')
    confere(await saldo('Atrazina 500 SC', 'AT2401') === 40, 'exemplo: lote vencido da Atrazina com 40 L')
    const vencido = await um(`select validade < (now() at time zone 'America/Sao_Paulo')::date as v from public.lotes where lote = 'AT2401'`)
    confere(vencido.v === true, 'exemplo: AT2401 já vencido')
    const ordem = (await db.query('select id, ocorrido_em from public.movimentacoes order by id')).rows
    confere(ordem.every((m, i) => i === 0 || m.ocorrido_em >= ordem[i - 1].ocorrido_em), `exemplo: ${ordem.length} lançamentos numerados em ordem cronológica`)
    const cor = await um(`select c.quantidade::float as q, s.quantidade::float as orig from public.movimentacoes c join public.movimentacoes s on s.id = c.referencia_id where c.tipo = 'CORRECAO'`)
    confere(cor?.q === 20 && cor?.orig === 60, 'exemplo: correção de +20 ligada à saída de 60')
    const estado = (await db.query('select estado, config from public.minhas_empresas()')).rows[0]
    confere(estado.estado === 'ativa' && estado.config.exemplo === true, 'exemplo: em teste grátis e marcada como exemplo')
  })
  confere((await db.query('select * from app.verificar_saldos($1)', [emp])).rows.length === 0, 'exemplo: saldos batem com o histórico')
  await comoUsuario(novato, () => esperaErro('a semente não é chamável diretamente', () => db.query('select app.semear_exemplo_galpao($1, $1)', [emp]), 'permission denied'))
}

// ----------------------------------------------------------------------
secao('Plano e assinatura:')
await db.query(`update public.assinaturas set plano_id = 'essencial' where empresa_id = $1`, [empB])
await comoUsuario(donoB, () => esperaErro('limite de lojas do plano', () =>
  db.query(`insert into public.lojas (empresa_id, nome) values ($1, 'Filial')`, [empB]), 'Limite do plano Essencial atingido: no máximo 1 lojas'))
await db.query(`update public.assinaturas set trial_ate = now() - interval '3 days' where empresa_id = $1`, [empA])
await comoUsuario(donoA, async () => {
  confere((await um('select app.estado_empresa($1) as e', [empA])).e === 'atrasada', '3 dias de atraso: estado "atrasada" (só aviso)')
  await db.query(`insert into public.produtos (empresa_id, nome, unidade) values ($1, 'Em carência', 'un')`, [empA])
  passou('…e continua gravando normalmente')
})
await db.query(`update public.assinaturas set trial_ate = now() - interval '10 days' where empresa_id = $1`, [empA])
await comoUsuario(donoA, async () => {
  confere((await um('select app.estado_empresa($1) as e', [empA])).e === 'somente_leitura', '10 dias de atraso: somente leitura')
  confere((await um('select count(*)::int as n from public.produtos')).n > 0, '…consulta continua liberada')
  await esperaErro('…cadastro bloqueado', () => db.query(`insert into public.produtos (empresa_id, nome, unidade) values ($1, 'Bloqueado', 'un')`, [empA]), 'row-level security')
  await esperaErro('…lançamento bloqueado', () => db.query(`select public.registrar_entrada($1, $2, 'X', null, 1)`, [lojaA1, prodA]), 'row-level security')
})
await db.query(`update public.assinaturas set trial_ate = now() - interval '30 days' where empresa_id = $1`, [empA])
confere((await um('select app.estado_empresa($1) as e', [empA])).e === 'suspensa', '30 dias de atraso: suspensa')
await db.query(`update public.assinaturas set status = 'cortesia' where empresa_id = $1`, [empA])
confere((await um('select app.estado_empresa($1) as e', [empA])).e === 'ativa', 'conta cortesia (ex.: cliente galpão) fica sempre ativa')

// ----------------------------------------------------------------------
secao('Expurgo de empresa cancelada (somente plataforma):')
await comoUsuario(donoB, () => esperaErro('usuário não consegue chamar o expurgo', () => db.query('select app.expurgar_empresa($1)', [empB]), 'permission denied'))
{
  const totalA = (await um('select count(*)::int as n from public.movimentacoes where empresa_id = $1', [empA])).n
  await db.query('select app.expurgar_empresa($1)', [empB])
  const restoB = (await um(`select (select count(*) from public.empresas where id = $1) + (select count(*) from public.produtos where empresa_id = $1)
    + (select count(*) from public.movimentacoes where empresa_id = $1) + (select count(*) from public.membros where empresa_id = $1) as n`, [empB])).n
  confere(Number(restoB) === 0, 'expurgo remove todos os dados da empresa B, inclusive o histórico')
  confere((await um('select count(*)::int as n from public.movimentacoes where empresa_id = $1', [empA])).n === totalA, '…sem tocar na empresa A')
  await esperaErro('fora do expurgo, o histórico continua imutável', () => db.query('delete from public.movimentacoes where empresa_id = $1', [empA]), 'não pode ser alterado')
}

// ----------------------------------------------------------------------
secao('Visitante sem login:')
await comoUsuario(null, async () => {
  await esperaErro('não lê produtos', () => db.query('select * from public.produtos'), 'permission denied')
  await esperaErro('não cria empresa', () => db.query(`select public.criar_empresa('X', 'outro')`), 'permission denied')
  await esperaErro('não aceita convite', () => db.query(`select public.aceitar_convite('x')`), 'permission denied')
})

console.log(`\n${ok} verificações OK, ${falhas} falha(s).`)
process.exit(falhas ? 1 : 0)
