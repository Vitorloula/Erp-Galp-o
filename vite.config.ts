/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'
import { supabaseLocal } from './servidor-local/plugin.ts'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const servidorLocal = command === 'serve' && mode !== 'test' && (mode.startsWith('servidor') || !env.VITE_SUPABASE_URL)
  
  return {
    plugins: [
      react(),
      tailwindcss(),
      mode.endsWith('celular') && basicSsl(),
      servidorLocal && supabaseLocal(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        manifest: false,
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
          globIgnores: ['**/exceljs*', '**/jspdf*', '**/html2canvas*', '**/purify*', '**/index.es-*'],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/assets/'),
              handler: 'CacheFirst',
              options: { cacheName: 'modulos', expiration: { maxEntries: 30 } },
            },
          ],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/sb\//],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        },
      }),
    ],
    server: {
      host: true,
      watch: { ignored: ['**/servidor-local/banco/**', '**/.e2e/**', '**/test-results/**', '**/playwright-report/**'] },
    },
    build: { chunkSizeWarningLimit: 1000, emptyOutDir: true },
    
    // CONFIGURAÇÃO DE TESTES E COBERTURA
    test: {
      include: ['src/**/*.test.ts', 'servidor-local/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: [
          'node_modules/**',
          'dist/**',
          '**/*.config.ts',
          'src/main.tsx',
          'src/vite-env.d.ts',
          'servidor-local/**'
        ],
        thresholds: {
          lines: 80,
          functions: 80,
          branches: 75,
          statements: 80
        }
      }
    },
  }
})