// Operação do piloto: consulta e ajuste de assinatura/cortesia sem abrir o painel.
//
// Uso (PowerShell):
//   $env:SUPABASE_URL="https://xxxx.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."
//   npm run piloto -- listar
//   npm run piloto -- status <empresa_id>
//   npm run piloto -- cortesia <empresa_id>
//   npm run piloto -- trial <empresa_id> 30
//   npm run piloto -- ativa <empresa_id> 30
//
// A service role ignora RLS: rode apenas no computador do suporte e nunca no navegador.
import { createClient } from '@supabase/supabase-js'

try {
  process.loadEnvFile?.()
} catch {
  // .env é opcional; as variáveis podem vir do ambiente.
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
const [comando, empresaId, diasTexto] = process.argv.slice(2)

function ajuda() {
  console.log(`Operação do piloto — ERP Galpão

  npm run piloto -- listar
  npm run piloto -- status <empresa_id>
  npm run piloto -- cortesia <empresa_id>
  npm run piloto -- trial <empresa_id> [dias=30]
  npm run piloto -- ativa <empresa_id> [dias=30]

Variáveis: SUPABASE_URL (ou VITE_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY.`)
}

if (!comando || comando === 'ajuda' || comando === '--help') {
  ajuda()
  process.exit(0)
}
if (!url || !chave) {
  console.error('Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no ambiente/.env.')
  process.exit(1)
}
if (!empresaId && comando !== 'listar') {
  console.error('Informe o id da empresa. Use "listar" para descobrir.')
  process.exit(1)
}

const sb = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } })

function dataMaisDias(dias) {
  return new Date(Date.now() + dias * 86_400_000).toISOString()
}

function falhar(error) {
  console.error(error?.message || String(error))
  process.exit(1)
}

if (comando === 'listar') {
  const { data: empresas, error } = await sb.from('empresas').select('id, nome, segmento, criado_em').order('criado_em')
  if (error) falhar(error)
  const { data: assinaturas, error: erroAssinaturas } = await sb.from('assinaturas').select('empresa_id, status, plano_id, trial_ate, pago_ate')
  if (erroAssinaturas) falhar(erroAssinaturas)
  const porEmpresa = new Map((assinaturas ?? []).map(a => [a.empresa_id, a]))
  for (const e of empresas ?? []) {
    const a = porEmpresa.get(e.id) ?? {}
    console.log(`${e.id}\t${e.nome}\t${a.status ?? 'sem assinatura'}\tplano=${a.plano_id ?? '-'}\ttrial=${a.trial_ate ?? '-'}\tpago=${a.pago_ate ?? '-'}`)
  }
  process.exit(0)
}

if (comando === 'status') {
  const { data: empresa, error } = await sb.from('empresas').select('id, nome, segmento, criado_em').eq('id', empresaId).single()
  if (error) falhar(error)
  const { data: assinatura, error: erroAssinatura } = await sb.from('assinaturas').select('*').eq('empresa_id', empresaId).maybeSingle()
  if (erroAssinatura) falhar(erroAssinatura)
  console.log(JSON.stringify({ empresa, assinatura }, null, 2))
  process.exit(0)
}

const dias = Number(diasTexto ?? 30)
if (!Number.isFinite(dias) || dias <= 0 || dias > 3650) {
  console.error('Informe uma quantidade de dias entre 1 e 3650.')
  process.exit(1)
}

let dados
if (comando === 'cortesia') {
  dados = { status: 'cortesia', trial_ate: null, pago_ate: null, atualizado_em: new Date().toISOString() }
} else if (comando === 'trial') {
  dados = { status: 'trial', trial_ate: dataMaisDias(dias), pago_ate: null, atualizado_em: new Date().toISOString() }
} else if (comando === 'ativa') {
  dados = { status: 'ativa', pago_ate: dataMaisDias(dias), trial_ate: null, atualizado_em: new Date().toISOString() }
} else {
  console.error(`Comando desconhecido: ${comando}`)
  ajuda()
  process.exit(1)
}

const { data, error } = await sb
  .from('assinaturas')
  .update(dados)
  .eq('empresa_id', empresaId)
  .select('empresa_id, status, trial_ate, pago_ate')
  .single()
if (error) falhar(error)
console.log(JSON.stringify(data, null, 2))
