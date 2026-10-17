import { defineConfig } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// O Playwright usa "taskkill" para encerrar os servidores no Windows...
if (process.platform === 'win32') {
  const system32 = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')
  const caminhos = (process.env.PATH ?? '').split(';')
  if (!caminhos.some(c => c.toLowerCase() === system32.toLowerCase())) process.env.PATH = [...caminhos, system32].join(';')
}

const FUSO = 'America/Sao_Paulo'
process.env.TZ = FUSO

export const VIDEO_CAMERA = join(tmpdir(), 'galpao-e2e-camera.y4m')
export const VIDEO_SEM_CODIGO = join(tmpdir(), 'galpao-e2e-camera-sem-codigo.y4m')

const cameraFalsa = (video: string) => ({
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`] },
})

const APP = 'http://localhost:5180'
const SERVIDOR_LOCAL = 'http://localhost:5182'
const BANCO_SERVIDOR_LOCAL = join(tmpdir(), `galpao-e2e-banco-${process.pid}`)

// INTELIGÊNCIA HÍBRIDA: Usa Edge no Windows (seu PC) e Chromium no CI (Linux)
const navegador = { channel: process.env.CI ? undefined : ('msedge' as const) }

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
  use: { locale: 'pt-BR', timezoneId: FUSO, trace: 'retain-on-failure', screenshot: 'only-on-failure', acceptDownloads: true, serviceWorkers: 'block' },
  projects: [
    { name: 'app-computador', testMatch: 'app/**/*.spec.ts', use: { ...navegador, ...computador, baseURL: APP } },
    { name: 'app-celular', testMatch: 'app/**/*.spec.ts', use: { ...navegador, ...celular, baseURL: APP } },
    { name: 'camera', testMatch: 'camera/leitor.spec.ts', use: { ...navegador, ...celular, baseURL: APP, ...cameraFalsa(VIDEO_CAMERA) } },
    { name: 'camera-sem-codigo', testMatch: 'camera/sem-codigo.spec.ts', use: { ...navegador, ...celular, baseURL: APP, ...cameraFalsa(VIDEO_SEM_CODIGO) } },
    { name: 'pdv', testMatch: 'pdv/**/*.spec.ts', use: { ...navegador, ...computador, baseURL: APP } },
    { name: 'pwa', testMatch: 'pwa/**/*.spec.ts', use: { ...navegador, ...computador, baseURL: APP, serviceWorkers: 'allow' } },
    { name: 'acesso', testMatch: 'acesso/**/*.spec.ts', use: { ...navegador, ...computador, baseURL: APP } },
    { name: 'servidor-local', testMatch: 'servidor-local/**/*.spec.ts', use: { ...navegador, baseURL: SERVIDOR_LOCAL } },
  ],
  webServer: [
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