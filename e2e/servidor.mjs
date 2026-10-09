// Compila o build de produção e o serve, num único processo (fácil de encerrar no Windows).
// O app aponta para http://supabase.test, que os testes interceptam e ligam ao Supabase local
// (e2e/apoio/supabase.ts). A chave é a mesma de CHAVE_ANON_LOCAL (servidor-local/supabase-local.ts).
// Uso: node e2e/servidor.mjs <porta>
import { build, preview } from 'vite'

const [porta] = process.argv.slice(2)
Object.assign(process.env, {
  VITE_SUPABASE_URL: 'http://supabase.test',
  VITE_SUPABASE_ANON_KEY: 'chave-anon-servidor-local',
  VITE_NOME_SISTEMA: '',
})

// No Windows o Playwright encerra o shell intermediário, mas não este processo:
// quando o processo pai desaparece, encerramos sozinhos.
const pai = process.ppid
setInterval(() => {
  try {
    process.kill(pai, 0)
  } catch {
    process.exit(0)
  }
}, 500).unref()

const outDir = '.e2e/app'
await build({ logLevel: 'warn', build: { outDir, emptyOutDir: true } })
const servidor = await preview({ logLevel: 'warn', build: { outDir }, preview: { port: Number(porta), strictPort: true } })
servidor.printUrls()
