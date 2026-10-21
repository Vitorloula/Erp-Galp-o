# Regras de Desenvolvimento do ERP GALPÃO

1. **Tech Stack**: React 19 + TypeScript + Vite + Tailwind CSS + Supabase (PostgreSQL + Auth + Realtime).
2. **Padrões de Import**: use imports **relativos** (`./`, `../`), nunca alias `@/` — o projeto não configura alias de path (ex: `import { Layout } from './components/Layout'`).
3. **Estilização**: Tailwind CSS e ícones da biblioteca `lucide-react`. Não reinvente componente que já existe em `src/components/`.
4. **Gerenciamento de Estado**: prefira Zustand para estados globais e locais persistentes.
5. **Tipagem**: o projeto usa TypeScript em modo `strict` com `noUnusedLocals`/`noUnusedParameters`. Todo código novo deve passar em `npx tsc --noEmit` sem erro.
6. **Qualidade**: o lint do projeto é o próprio type-check (`npm run lint` = `tsc -p . --noEmit`). Helpers puros novos exigem teste no mesmo commit.
7. **Segurança**: nunca exponha chaves secretas do Supabase (`SUPABASE_SERVICE_ROLE_KEY`) no frontend. A chave `anon` pode ficar pública — a proteção são as regras RLS do banco.
