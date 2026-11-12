# Configuração do OpenBot (passo a passo)

Guia prático para configurar o OpenBot para o projeto ERP Galpão + CorteNexo (Doop). Complementa `docs/openbot-setup.md`.

## 1. Instalação
- Baixe em https://openbot.run/pt/download (macOS/Windows/Linux/iOS/Android).
- Requisitos: macOS 13+, Windows 10+ (x64), Linux x64.
- Instale e abra o app.

## 2. Provedor de IA
1. No OpenBot, vá em **Settings → Providers** (ou "Provedores").
2. Conecte um provedor que você já paga:
   - **OpenCode** (recomendado para este repo — já tem MCP/tools).
   - Codex, Claude Code, Gemini, Grok, Cursor, Cline, Ollama/LM Studio (local).
3. Faça login/autentique conforme o provedor.
4. (Opcional) Configure um modelo reserva (fallback) para quando o plano atingir o limite.

> Dica: para desenvolvimento local/offline, use Ollama/LM Studio com um modelo pequeno para testes rápidos.

## 3. Workspace
1. **New workspace** → aponte para `D:\ErpGalpao`.
2. Nome: `erp-galpao`.
3. Verifique se `agents/`, `memoria/`, `src/`, `e2e/`, `supabase/` aparecem.
4. (Opcional) Crie um segundo workspace para o design: `cortenexo-doop` (apenas docs/links do Doop).

## 4. Agentes
Crie um agente por papel (use os prompts em `agents/openbot/`):
- Arquiteto → `agents/openbot/01-arquiteto.md`
- Designer → `agents/openbot/02-designer.md`
- Programador → `agents/openbot/03-programador.md`
- QA → `agents/openbot/04-qa.md`
- Product Owner → `agents/openbot/05-product-owner.md`

Para cada agente:
1. Nome + instruções (cole o conteúdo do arquivo).
2. Selecione o provedor/modelo.
3. (Opcional) Defina ferramentas permitidas (terminal, arquivos, MCPs).

## 5. Ferramentas e MCPs
No OpenBot, ative MCPs conforme `docs/openbot-setup.md` (seção 4):
- Doop cloud (design) — já usado.
- Supabase MCP (read-only local).
- Context7 (docs).
- GitHub MCP (PRs/issues).
- Playwright MCP (opcional).

Configure variáveis de ambiente (API keys) nas **Settings → Environment** do OpenBot, não no repo.

## 6. Variáveis de ambiente do projeto
Crie um `.env` (não commitado) na raiz para dev local:
```
VITE_SUPABASE_URL=...          # apenas se usar nuvem
VITE_SUPABASE_ANON_KEY=...     # chave anon (pública)
VITE_NOME_SISTEMA=ERP Galpão   # opcional
```
Para servidor local, **não** crie `.env` (o `npm run dev` sobe PGlite automaticamente).

Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` no frontend nem em agentes compartilhados.

## 7. Canais e workflows
1. Crie o canal `#erp-galpao`.
2. Adicione os agentes.
3. Crie o workflow "Ciclo de feature":
   - Arquiteto → Designer → Programador → QA.
   - Adicione etapas de aprovação humana se desejar.
4. (Opcional) Canal `#design-cortenexo` para o Designer de marca.

## 8. Testes e gate mecânico
- Agente Programador deve rodar:
  - `npm run lint`
  - `npm test`
  - `npm run test:e2e` (ou `test:e2e:smoke`)
- O gate final (aprovação) é feito por script externo/humano, não pelo agente.

## 9. Segurança
- Não commitar `.env` ou service role.
- MCPs de banco: read-only em dev; desativar em produção.
- Revisar permissões de cada agente antes de canal compartilhado.
- Backups: `npm run backup` (local) ou backup do Supabase (produção).

## 10. Solução de problemas
- Docs oficiais: https://github.com/nightly-labs/openbot#readme
- Troubleshooting: https://github.com/nightly-labs/openbot/blob/main/docs/TROUBLESHOOTING.md
- Status: https://status.openbot.run
- Discord: https://discord.openbot.run

Se o OpenBot não encontrar `npx/npm`, verifique o PATH do sistema (Windows: adicione Node ao PATH e reinicie o app).

## 11. Próximos passos
1. Rode um ciclo de teste em um item pequeno do backlog (`memoria/estado.json`).
2. Valide com `npm run test:tudo`.
3. Ajuste prompts dos agentes conforme o resultado.
4. (Opcional) Crie a skill de front-end do projeto (sugerida anteriormente) para padronizar UI.
