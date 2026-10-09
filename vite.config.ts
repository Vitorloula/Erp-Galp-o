/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'
import { supabaseLocal } from './servidor-local/plugin.ts'

// Desenvolvimento (npm run dev):
//  - sem .env do Supabase: sobe o servidor local de teste (banco real em PGlite, em
//    servidor-local/banco/), que celular e computador compartilham pelo Wi-Fi;
//  - com .env (VITE_SUPABASE_URL): usa o Supabase na nuvem.
// Modos:
//  - "celular" (npm run dev:celular): HTTPS na rede local, necessário para o celular liberar a câmera.
//  - "servidor" (npm run dev:servidor): força o servidor local mesmo com .env.
//  - "servidor-celular" (npm run dev:servidor:celular): os dois juntos.
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const servidorLocal = command === 'serve' && mode !== 'test' && (mode.startsWith('servidor') || !env.VITE_SUPABASE_URL)
  return {
    plugins: [
      react(),
      tailwindcss(),
      mode.endsWith('celular') && basicSsl(),
      servidorLocal && supabaseLocal(),
      // Aplicativo instalável: o sistema abre e o caixa vende mesmo sem internet. Versão nova
      // fica esperando o operador confirmar (nunca recarrega sozinho no meio de uma venda).
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        manifest: false, // public/manifest.webmanifest
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
          // Excel/PDF dos relatórios não são do caixa: ficam guardados só quando alguém usa.
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
      // Banco do servidor local e saídas de teste não devem recarregar a página.
      watch: { ignored: ['**/servidor-local/banco/**', '**/.e2e/**', '**/test-results/**', '**/playwright-report/**'] },
    },
    // Excel/PDF/câmera são carregados sob demanda; o aviso de tamanho não se aplica a eles.
    build: { chunkSizeWarningLimit: 1000, emptyOutDir: true },
    test: { include: ['src/**/*.test.ts', 'servidor-local/**/*.test.ts'] },
  }
})
