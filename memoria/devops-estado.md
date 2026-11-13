# Estado de Deploy — DevOps

> Atualizado em **13/11/2026 ~03:15 UTC (4ª revisão)** por DevOps (OpenBot), a partir de README.md, DOCUMENTACAO_ERP.md, `.github/workflows/`, `dist/_redirects`, `git` local, API pública do GitHub Actions e consulta **somente de leitura** aos MCPs Cloudflare e Supabase.

## 1. Onde publica

| Item | Valor |
| --- | --- |
| Serviço | **Cloudflare Pages** (site estático; sem Workers, sem Pages Functions) |
| Projeto | `erp-galp-o` |
| URL de produção | https://erp-galp-o.pages.dev |
| Conta Cloudflare | "Vitorloula3@gmail.com's Account" (única conta, id `6d3f09cf…2825d`) |
| Domínio próprio | **Nenhum** — só o subdomínio `erp-galp-o.pages.dev` |
| Banco | Supabase `vaihnxmwuouztvdojnyv.supabase.co` (fora do MCP Cloudflare; ver §5) |

## 2. Como publica (pipeline atual)

- **Integração GitHub → Cloudflare Pages**: repositório `Vitorloula/Erp-Galp-o` (público).
  - Branch de produção: **`saas`** (todo push em `saas` vai direto para produção; `origin/HEAD` aponta para `saas`).
  - Previews: todas as branches (sem senha/exceção configurada).
- **Build**: `npm run build` → pasta `dist`. Node fixado em `22.12.0` via variável de ambiente.
- **Variáveis de build** (iguais em produção e preview): `NODE_VERSION`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (chave publishable — pública por design; a proteção é RLS no banco. Valor não registrado aqui de propósito).
- **Roteamento SPA**: `public/_redirects` (`/* /index.html 200`) está presente no `dist` — compatível com Cloudflare Pages.
- **Último deploy de produção**: **13/11/2026 03:03 UTC**, commit `e17d8b9` (T-036: custo no produto + faturamento/lucro), **todas as etapas com sucesso** (deployment `13984374`, build ~25 s, `commit_dirty: false`); produção **servindo o commit** — alias `erp-galp-o.pages.dev` e o deployment `13984374` retornam o mesmo asset `assets/index-CjJo_5Gn.js`. Deploys anteriores da faixa: `26ed1fc` (docs/auditoria, `7534965f`, 13/11 01:11 UTC) e `f3be01e` (remoção do `ia-diaria.yml`, `ee2e1be1`, 12/11 09:50 UTC).
- **CI (GitHub Actions)**: `.github/workflows/testes.yml` roda em push/PR —
  - `qualidade` (Ubuntu): `npm run build` (= `tsc -p . && vite build`, cobre lint) + Vitest + `test:sql`;
  - `e2e` (Windows + Edge): `npm run test:e2e:ci` = Playwright `--workers=2 --retries=2` sobre **todos** os specs (`testDir: e2e`; 8 projetos). O spec novo `e2e/app/vendas-fila.spec.ts` roda nos projetos `app-computador` e `app-celular`.
  - O CI **não faz deploy**: a publicação é automática pela Pages, independente do resultado do CI.
- **Estado do CI em 13/11**: verde em cadeia — runs #39/#40 (fixes de e2e `f2c46b9`/`33aaac4`), #41 (`26ed1fc`, docs, success 13/11 01:16 UTC) e **#42 (`e17d8b9`, T-036, id `43356238120`, success 03:09 UTC: `qualidade` job `131658839080` em 29 s + `e2e` job `131658839436` em 7m13s, nenhum step falho)**.
  - Contexto: entre 06/11 e 11/11 o `e2e` estava vermelho (#33–#38) por specs desatualizados (RPC `registrar_entrada` sem `p_custo`; Entrada virou seleção de lote por **radio**/FEFO com fluxo "Novo lote" em `cf95289`) — corrigidos em `f2c46b9` e `33aaac4`, só arquivos de e2e.
  - O run #38 (`33aaac4`) falhou no CI com a suíte verde local; os 4 runs seguintes ficaram verdes com a mesma config → **flake pontual do runner** (windows-latest). Logs/artefato do #38 exigem sign-in admin (API anônima: 403/401); diagnóstico encerrado sem mudança de config.

### Git local

- Branches: `saas` (principal de trabalho), `main`, `galpao-1.x`; remotas `origin/main`, `origin/saas` + `ia-autonoma/*` antigas.
- Fixes de DevOps commitados na `saas`: `f2c46b9` (p_custo) e `33aaac4` (radio/novo lote) — somente `e2e/`.

## 3. O que falta / pendências

1. **Domínio próprio**: nenhum configurado no Pages.
2. **Produção = `saas` sem gate**: o deploy acontece mesmo com CI vermelho (foi o caso entre 06/11 e 11/11). Opções de gate no §3.8.
3. **Versão do cliente (branch `galpao-1.x`) não tem ambiente publicado**: decidir qual branch é a produção oficial e se a outra precisa de projeto/URL separados.
4. **Backup/restauração do Supabase em produção não ensaiado** (T-028). Backup local não substitui o de nuvem.
5. **`ia-diaria.yml` ("🤖 Fábrica Autônoma Full-Stack")**: existe commitado no git, apagado **sem commit** na árvore de trabalho local, e **todos os 28 runs falharam** (agendado diário 03:00 UTC + manual). Falha visível nos summaries públicos: etapa de e-mail (`dawidd6/action-send-mail@v3`) — *"At least one of 'to', 'cc' or 'bcc' must be specified"* (destinatário não configurado) — e `exit code 1` do processo; também *"No files were found with the provided path: playwright-report"*. Não mexi no arquivo (deleção pendente de decisão; ver proposta na conversa).
6. **T-034 (NFC-e/Asaas) vai exigir Workers/Edge Functions** com segredos server-side (a conta não tem nenhum Worker hoje; migrations `20261111090000_nfce_fila_gestao` e `20261112120000_custo_lucro` já aplicadas no Supabase de produção — histórico remoto confirmado via MCP de leitura em 13/11 ~03:12 UTC, 14 migrations, última = `20261112120000_custo_lucro`).
7. **Falha do e2e só no CI (run #38)**: **encerrada como flake pontual do runner** — os 4 runs seguintes (#39–#42) ficaram verdes com a mesma config; o log do #38 continua inacessível sem sign-in admin (API anônima: 403/401). Nenhuma alteração de config foi feita.
8. **Gate de deploy (opções, decisão do usuário)**:
   - (a) **Branch protection/ruleset na `saas`** exigindo PR + status checks (`Testes / qualidade`, `Testes / e2e`, `Cloudflare Pages`): gate real, mas todo push direto vira PR. Precisa de acesso admin ao GitHub.
   - (b) **Deploy movido para o CI** (job `deploy` com `needs: [qualidade, e2e]` + `wrangler pages deploy` e API token do Cloudflare em secret do GitHub, desligando a integração Git do Pages): mantém push direto e cria o gate; precisa de token do usuário (Cloudflare) e troca o mecanismo de publicação.
   - (c) **Manter como está** (CI informativo + vigilância manual): risco atual (produção publicou commits com CI vermelho entre 06/11 e 11/11).
   - Recomendação: (b) preserva o fluxo atual e cria gate de verdade; (a) é o padrão mais robusto se a equipe aceitar PRs.

## 4. O que ficou bom / estável

- Deploy automático saudável: últimos deploys de produção com sucesso (36 s de build).
- Configuração do Pages casada com o README: comando, pasta, variáveis, Node 22.
- `_redirects` cobre o roteamento SPA.
- CI separa qualidade (rápida, Linux) e E2E (Windows/Edge), com retries e artefato em falha.
- Site é estático puro (`uses_functions: false`) — segredos de service role nunca vão para o bundle.
- Suíte E2E estável na máquina local na versão atual (207/207, 2× seguidas).

## 5. Não verificado (fora do alcance desta consulta)

- **Supabase** (SMTP próprio, Site URL, backup automático/pause do plano): conferir no painel. Migrations remotas verificadas por leitura via MCP em 13/11 (~03:12 UTC): 14 no histórico, última `20261112120000_custo_lucro`; SMTP/backups seguem sem visibilidade pelo MCP.
- **Log/artefato do run #38 do Actions**: exigem sign-in com direito de admin; API anônima só dá statuses/steps/annotations.
- **Branch protection atual da `saas`**: settings do repositório não são públicos.
- **Plano/limites/faturamento Cloudflare**: plano "standard" confirmado; limites de build não verificados.

## 6. Fontes

- `README.md`, `DOCUMENTACAO_ERP.md`, `.github/workflows/testes.yml`, `dist/_redirects`/`public/_redirects`
- `git` local e API pública do GitHub Actions (runs #32–#42, steps, annotations; 403/401 em logs e artefato)
- MCP Cloudflare (leitura): `accounts_list`, `pages_list`, `pages_deployments_list`, `pages_domains_list`, `workers_legacy_scripts_list`
- MCP Supabase (leitura): `list_migrations` (13/11 ~03:12 UTC)
- `memoria/estado.json` (backlog T-028, T-034, T-035); `memoria/historico.md`
