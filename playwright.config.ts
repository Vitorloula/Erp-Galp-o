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

/** Vídeo da câmera falsa (um código EAN-13 na frente da "câmera"), gerado em e2e/preparar.ts. */
export const VIDEO_CAMERA = join(tmpdir(), 'galpao-e2e-camera.y4m')
export const VIDEO_SEM_CODIGO = join(tmpdir(), 'galpao-e2e-camera-sem-codigo.y4m')

const cameraFalsa = (video: string) => ({
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`] },
})

const DEMO = 'http://localhost:5180'
const SUPABASE = 'http://localhost:5181'
const SERVIDOR_LOCAL = 'http://localhost:5182'
// Arquivo de dados novo a cada execução, para não tocar no banco local de verdade.
const DADOS_SERVIDOR_LOCAL = join(tmpdir(), `galpao-e2e-servidor-local-${process.pid}.json`)

// Usa o Microsoft Edge já instalado no Windows (não precisa baixar navegador).
const navegador = { channel: 'msedge' as const }
const computador = { viewport: { width: 1366, height: 900 } }
const celular = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/preparar.ts',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: { locale: 'pt-BR', trace: 'retain-on-failure', screenshot: 'only-on-failure', acceptDownloads: true },
  projects: [
    { name: 'demo-computador', testMatch: 'demo/**/*.spec.ts', use: { ...navegador, ...computador, baseURL: DEMO } },
    { name: 'demo-celular', testMatch: 'demo/**/*.spec.ts', use: { ...navegador, ...celular, baseURL: DEMO } },
    { name: 'camera', testMatch: 'camera/leitor.spec.ts', use: { ...navegador, ...celular, baseURL: DEMO, ...cameraFalsa(VIDEO_CAMERA) } },
    { name: 'camera-sem-codigo', testMatch: 'camera/sem-codigo.spec.ts', use: { ...navegador, ...celular, baseURL: DEMO, ...cameraFalsa(VIDEO_SEM_CODIGO) } },
    { name: 'supabase', testMatch: 'supabase/**/*.spec.ts', use: { ...navegador, ...computador, baseURL: SUPABASE } },
    { name: 'servidor-local', testMatch: 'servidor-local/**/*.spec.ts', use: { ...navegador, baseURL: SERVIDOR_LOCAL } },
  ],
  // Testa o build de produção (o mesmo que vai para o ar).
  webServer: [
    { command: 'node e2e/servidor.mjs demo 5180', url: DEMO, timeout: 180_000, reuseExistingServer: false },
    { command: 'node e2e/servidor.mjs supabase 5181', url: SUPABASE, timeout: 180_000, reuseExistingServer: false },
    {
      command: 'node node_modules/vite/bin/vite.js --mode servidor --port 5182 --strictPort',
      url: SERVIDOR_LOCAL,
      env: { GALPAO_DADOS_LOCAL: DADOS_SERVIDOR_LOCAL, VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true' },
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
})
