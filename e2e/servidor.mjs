// Compila o build de produção e o serve, num único processo (fácil de encerrar no Windows).
// Uso: node e2e/servidor.mjs <demo|supabase> <porta>
import { build, preview } from 'vite'

const [modo, porta] = process.argv.slice(2)
const ambientes = {
  demo: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_NOME_EMPRESA: '' },
  supabase: { VITE_SUPABASE_URL: 'http://supabase.test', VITE_SUPABASE_ANON_KEY: 'chave-anon-de-teste', VITE_NOME_EMPRESA: 'Agro Teste' },
}
Object.assign(process.env, ambientes[modo])

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

const outDir = `.e2e/${modo}`
await build({ logLevel: 'warn', build: { outDir, emptyOutDir: true } })
const servidor = await preview({ logLevel: 'warn', build: { outDir }, preview: { port: Number(porta), strictPort: true } })
servidor.printUrls()
