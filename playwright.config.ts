import { defineConfig } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// O Playwright usa "taskkill" para encerrar os servidores no Windows; alguns terminais
// (ex.: Git Bash) não têm o System32 no PATH, e o encerramento ficaria travado.
if (process.platform === 'win32') {
  const system32 = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')
  const caminhos = (process.env.PATH ?? '').split(';')
  if (!caminhos.some(c => c.toLowerCase() === system32.toLowerCase())) process.env.PATH = [...caminhos, system32].join(';')
}

// Datas dos testes (Node), do navegador e das empresas (America/Sao_Paulo) no mesmo fuso,
// para "hoje" ser o mesmo dia em todos — inclusive no CI, que roda em UTC.
const FUSO = 'America/Sao_Paulo'
process.env.TZ = FUSO

/** Vídeo da câmera falsa (um código EAN-13 na frente da "câmera"), gerado em e2e/preparar.ts. */
export const VIDEO_CAMERA = join(tmpdir(), 'galpao-e2e-camera.y4m')
export const VIDEO_SEM_CODIGO = join(tmpdir(), 'galpao-e2e-camera-sem-codigo.y4m')

const cameraFalsa = (video: string) => ({
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`] },
})

const APP = 'http://localhost:5180'
const SERVIDOR_LOCAL = 'http://localhost:5182'
// Banco novo a cada execução, para não tocar no banco local de verdade.
const BANCO_SERVIDOR_LOCAL = join(tmpdir(), `galpao-e2e-banco-${process.pid}`)

// --- A CORREÇÃO ESTÁ AQUI ---
// Usa o Microsoft Edge (já instalado no Windows) se estiver no Windows.
// Se estiver no Linux (ex: GitHub Actions ubuntu), usa o Chromium padrão.
const navegador = { channel: process.platform === 'win32' ? ('msedge' as const) : undefined }

const computador = { viewport: { width: 1366, height: 900 } }
const celular = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/preparar.ts',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 2 : 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  // O aplicativo instalável (service worker) fica desligado, exceto no projeto "pwa".
  use: { locale: 'pt-BR', timezoneId: FUSO, trace: 'retain-on-failure', screenshot: 'only-on-failure', acceptDownloads: true, serviceWorkers: 'block' },
  projects: [
    // Telas do sistema, cada teste com a própria empresa de exemplo no banco real (PGlite).
    { name: 'app-computador', testMatch: 'app/**/*.spec.ts', use: { ...navegador, ...computador, baseURL: APP } },
    { name: 'app-celular', testMatch: 'app/**/*.spec.ts', use: { ...navegador, ...celular, baseURL: APP } },
    { name: 'camera', testMatch: 'camera/leitor.spec.ts', use: { ...navegador, ...celular, baseURL: APP, ...cameraFalsa(VIDEO_CAMERA) } },
    { name: 'camera-sem-codigo', testMatch: 'camera/sem-codigo.spec.ts', use: { ...navegador, ...celular, baseURL: APP, ...cameraFalsa(VIDEO_SEM_CODIGO) } },
    // Caixa (PDV): venda sem internet, dois caixas, relógio errado, balança.
    { name: 'pdv', testMatch: 'pdv/**/*.spec.ts', use: { ...navegador, ...computador, baseURL: APP } },
    // Aplicativo instalado: o caixa recarrega e vende sem internet.
    { name: 'pwa', testMatch: 'pwa/**/*.spec.ts', use: { ...navegador, ...computador, baseURL: APP, serviceWorkers: 'allow' } },
    // Login, cadastro, convites, papéis, assinatura e o que o app envia ao Supabase.
    { name: 'acesso', testMatch: 'acesso/**/*.spec.ts', use: { ...navegador, ...computador, baseURL: APP } },
    // Servidor de desenvolvimento de verdade (npm run dev), com WebSocket real.
    { name: 'servidor-local', testMatch: 'servidor-local/**/*.spec.ts', use: { ...navegador, baseURL: SERVIDOR_LOCAL } },
  ],
  webServer: [
    // Build de produção (o mesmo que vai para o ar), apontando para o Supabase dos testes.
    { command: 'node e2e/servidor.mjs 5180', url: APP, timeout: 180_000, reuseExistingServer: false },
    {
      command: 'node node_modules/vite/bin/vite.js --mode servidor --port 5182 --strictPort',
      url: SERVIDOR_LOCAL,
      env: { GALPAO_BANCO_LOCAL: BANCO_SERVIDOR_LOCAL, VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true' },
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
})