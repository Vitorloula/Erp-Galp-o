/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { supabaseLocal } from './servidor-local/plugin'

// Modos:
//  - "celular" (npm run dev:celular): HTTPS na rede local, necessário para o celular liberar a câmera.
//  - "servidor" (npm run dev:servidor): servidor local de teste que imita o Supabase,
//    para celular e computador compartilharem os dados pelo Wi-Fi.
//  - "servidor-celular" (npm run dev:servidor:celular): os dois juntos.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), mode.endsWith('celular') && basicSsl(), mode.startsWith('servidor') && supabaseLocal()],
  server: {
    host: true,
    // Banco do servidor local e saídas de teste não devem recarregar a página.
    watch: { ignored: ['**/servidor-local/dados.json*', '**/.e2e/**', '**/test-results/**', '**/playwright-report/**'] },
  },
  // Excel/PDF/câmera são carregados sob demanda; o aviso de tamanho não se aplica a eles.
  build: { chunkSizeWarningLimit: 1000 },
  test: { include: ['src/**/*.test.ts'] },
}))
