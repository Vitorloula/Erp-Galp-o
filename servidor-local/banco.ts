import { PGlite } from '@electric-sql/pglite'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'

/**
 * Banco do servidor local: PostgreSQL de verdade (PGlite) com as MESMAS migrações
 * que vão para o Supabase. Assim as regras (RLS, gatilhos, funções) testadas aqui
 * são as que rodam em produção — não existe uma segunda implementação das regras.
 */

const PASTA_MIGRACOES = new URL('../supabase/migrations/', import.meta.url)
const AMBIENTE = new URL('./ambiente-supabase.sql', import.meta.url)
const CANAL_TEMPO_REAL = 'realtime_local'

interface Migracao {
  versao: string
  nome: string
  sql: string
}

function lerMigracoes(): Migracao[] {
  return readdirSync(PASTA_MIGRACOES)
    .filter(f => /^\d{14}_.+\.sql$/.test(f))
    .sort()
    .map(f => ({ versao: f.slice(0, 14), nome: f.slice(15, -4), sql: readFileSync(new URL(f, PASTA_MIGRACOES), 'utf8') }))
}

/** Aviso de tempo real: um gatilho em cada tabela da publicação supabase_realtime. */
const FUNCAO_TEMPO_REAL = `
create schema if not exists realtime_local;
create or replace function realtime_local.avisar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_novo   jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_velho  jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_chaves jsonb := '{}'::jsonb;
  v_coluna text;
  v_msg    jsonb;
begin
  foreach v_coluna in array tg_argv loop
    v_chaves := v_chaves || jsonb_build_object(v_coluna, coalesce(v_novo, v_velho) -> v_coluna);
  end loop;
  v_msg := jsonb_build_object(
    'schema', tg_table_schema, 'table', tg_table_name, 'type', tg_op, 'chaves', v_chaves,
    'commit_timestamp', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'record', v_novo, 'old_record', v_velho);
  -- O NOTIFY aceita até 8000 bytes: registros grandes vão só com as chaves.
  if octet_length(v_msg::text) > 7800 then
    v_msg := v_msg - 'record' - 'old_record' || '{"grande": true}'::jsonb;
  end if;
  perform pg_notify('${CANAL_TEMPO_REAL}', v_msg::text);
  return null;
end $$;
`

async function instalarTempoReal(db: PGlite) {
  await db.exec(FUNCAO_TEMPO_REAL)
  const tabelas = await db.query<{ esquema: string; tabela: string; chaves: string[] }>(`
    select pt.schemaname as esquema, pt.tablename as tabela,
           array(select a.attname::text
                 from pg_index i
                 join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
                 where i.indrelid = format('%I.%I', pt.schemaname, pt.tablename)::regclass and i.indisprimary
                 order by array_position(i.indkey::int2[], a.attnum)) as chaves
    from pg_publication_tables pt where pt.pubname = 'supabase_realtime'`)
  const sql: string[] = []
  for (const t of tabelas.rows) {
    const args = t.chaves.map(c => `'${c.replaceAll("'", "''")}'`).join(', ')
    sql.push(`create or replace trigger zz_realtime_local after insert or update or delete on "${t.esquema}"."${t.tabela}"
              for each row execute function realtime_local.avisar(${args});`)
  }
  // Tabela que saiu da publicação deixa de avisar.
  const sobras = await db.query<{ esquema: string; tabela: string }>(`
    select n.nspname as esquema, c.relname as tabela
    from pg_trigger tg join pg_class c on c.oid = tg.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where tg.tgname = 'zz_realtime_local'
      and not exists (select 1 from pg_publication_tables pt
                      where pt.pubname = 'supabase_realtime' and pt.schemaname = n.nspname and pt.tablename = c.relname)`)
  for (const t of sobras.rows) sql.push(`drop trigger zz_realtime_local on "${t.esquema}"."${t.tabela}";`)
  if (sql.length) await db.exec(sql.join('\n'))
}

/** Prepara o banco: ambiente do Supabase (só na criação), migrações pendentes e tempo real. */
async function prepararBanco(db: PGlite): Promise<string[]> {
  const ambiente = readFileSync(AMBIENTE, 'utf8')
  const versaoAmbiente = createHash('sha256').update(ambiente).digest('hex')
  const { rows } = await db.query<{ existe: boolean }>(`select to_regnamespace('auth') is not null as existe`)
  if (!rows[0].existe) await db.exec(ambiente)
  await db.exec(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (version text primary key, name text, statements text[]);`)
  // O ambiente simulado não tem migrações: se mudou depois que o banco foi criado, só avisa.
  const { rows: registro } = await db.query<{ statements: string[] }>(
    `insert into supabase_migrations.schema_migrations (version, name, statements) values ('00000000000000', 'ambiente-local', $1)
     on conflict (version) do update set version = excluded.version returning statements`,
    [[versaoAmbiente]],
  )
  if (registro[0].statements[0] !== versaoAmbiente)
    console.warn(
      '[servidor local] O ambiente simulado do Supabase (servidor-local/ambiente-supabase.sql) mudou depois que este banco foi criado.\n' +
        '  Se algo falhar, apague a pasta do banco para recriá-lo.',
    )
  const aplicadas = new Set(
    (await db.query<{ version: string }>(`select version from supabase_migrations.schema_migrations where version <> '00000000000000'`)).rows.map(r => r.version),
  )
  const novas: string[] = []
  for (const m of lerMigracoes()) {
    if (aplicadas.has(m.versao)) continue
    // Cada migração inteira ou nada (como no Supabase CLI).
    await db.transaction(async tx => {
      await tx.exec(m.sql)
      await tx.query('insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)', [m.versao, m.nome, [m.sql]])
    })
    novas.push(`${m.versao}_${m.nome}`)
  }
  await instalarTempoReal(db)
  return novas
}

function assinaturaDasMigracoes() {
  const h = createHash('sha256').update(readFileSync(AMBIENTE))
  for (const m of lerMigracoes()) h.update(m.versao).update(m.sql)
  return h.digest('hex')
}

// Banco em memória: as migrações rodam uma vez por processo e cada servidor novo
// parte de uma cópia (bem mais rápido que inicializar o PostgreSQL do zero).
let modelo: { assinatura: string; copia: Promise<Blob> } | null = null

function copiaModelo(): Promise<Blob> {
  const assinatura = assinaturaDasMigracoes()
  if (modelo?.assinatura !== assinatura) {
    const copia = (async () => {
      const db = new PGlite()
      await prepararBanco(db)
      const arquivo = await db.dumpDataDir('none')
      await db.close()
      return arquivo
    })()
    copia.catch(() => (modelo = null))
    modelo = { assinatura, copia }
  }
  return modelo.copia
}

export interface BancoLocal {
  db: PGlite
  /** Migrações aplicadas agora (vazio quando o banco já estava em dia). */
  migracoesNovas: string[]
}

/** Abre o banco: em memória (testes) ou numa pasta (servidor local, sobrevive a reinícios). */
export async function abrirBanco(pasta?: string): Promise<BancoLocal> {
  const db = pasta ? new PGlite(pasta) : new PGlite({ loadDataDir: await copiaModelo() })
  await db.waitReady
  // Supabase e PostgREST trabalham em UTC: datas saem como 2026-10-09T12:00:00+00:00.
  await db.exec(`set timezone to 'UTC'`)
  const migracoesNovas = await prepararBanco(db)
  return { db, migracoesNovas }
}

export { CANAL_TEMPO_REAL }
