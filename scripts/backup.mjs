// Backup do banco local (PGlite) — T-025.
//
// Uso:
//   node scripts/backup.mjs               # cria um backup em servidor-local/backup/
//   node scripts/backup.mjs --restore <arquivo.tar>
//
// O banco fica em GALPAO_BANCO_LOCAL (padrão: servidor-local/banco). O backup usa
// dumpDataDir('auto') para tirar um snapshot consistente mesmo com o banco em uso.
import { PGlite } from '@electric-sql/pglite'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PASTA = process.env.GALPAO_BANCO_LOCAL || 'servidor-local/banco'
const PASTA_BACKUP = 'servidor-local/backup'

function nomeBackup() {
  return `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.tar`
}

async function fazerBackup() {
  if (!existsSync(PASTA)) {
    console.error(`Banco não encontrado em ${PASTA} — rode o sistema uma vez antes de fazer backup.`)
    process.exit(1)
  }
  const db = new PGlite(PASTA)
  await db.waitReady
  const blob = await db.dumpDataDir('auto')
  await db.close()
  mkdirSync(PASTA_BACKUP, { recursive: true })
  const destino = join(PASTA_BACKUP, nomeBackup())
  writeFileSync(destino, Buffer.from(await blob.arrayBuffer()))
  console.log(`Backup salvo em ${destino}`)
}

async function restaurar(arquivo) {
  if (!existsSync(arquivo)) {
    console.error(`Arquivo não encontrado: ${arquivo}`)
    process.exit(1)
  }
  const blob = new Blob([readFileSync(arquivo)])
  const db = new PGlite(PASTA, { loadDataDir: blob })
  await db.waitReady
  await db.close()
  console.log(`Banco restaurado de ${arquivo} em ${PASTA}`)
}

const [cmd, arg] = process.argv.slice(2)
if (cmd === '--restore') restaurar(arg)
else fazerBackup()
