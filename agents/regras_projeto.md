# Regras de Desenvolvimento do ERP GALPÃO

1. **Tech Stack**: React + TypeScript + Vite + Tailwind CSS + Supabase.
2. **Padrões de Import**: Sempre use o alias `@/` para imports internos (ex: `import Button from '@/components/ui/button'`).
3. **Estilização**: Utilize Tailwind CSS e ícones da biblioteca `lucide-react`.
4. **Gerenciamento de Estado**: Prefira Zustand para estados globais e locais persistentes.
5. **Segurança**: Nunca exponha chaves secretas do Supabase (`SUPABASE_SERVICE_ROLE_KEY`) no frontend.