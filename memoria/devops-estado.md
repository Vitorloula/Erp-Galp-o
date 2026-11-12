# Estado de Deploy — DevOps

> Atualizado em **11/11/2026 ~23:20 (2ª revisão)** por DevOps (OpenBot), a partir de README.md, DOCUMENTACAO_ERP.md, `.github/workflows/`, `dist/_redirects`, `git` local, API pública do GitHub Actions e consulta **somente de leitura** ao MCP Cloudflare.

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
- **Último deploy de produção**: **12/11/2026 02:11 UTC**, commit `33aaac4` (fixes de e2e), todas as etapas com sucesso (deployment `7bdd983a`). Produção em dia com a branch publicada.
- **CI (GitHub Actions)**: `.github/workflows/testes.yml` roda em push/PR —
  - `qualidade` (Ubuntu): `npm run build` (= `tsc -p . && vite build`, cobre lint) + Vitest + `test:sql`;
  - `e2e` (Windows + Edge): `npm run test:e2e:ci` = Playwright `--workers=2 --retries=2` sobre **todos** os specs (`testDir: e2e`; 8 projetos). O spec novo `e2e/app/vendas-fila.spec.ts` roda nos projetos `app-computador` e `app-celular`.
  - O CI **não faz deploy**: a publicação é automática pela Pages, independente do resultado do CI.
- **Estado do CI em 11/11 noite**: vermelho no job `e2e`. Histórico: último verde completo #32 (`48b16df`, 27/10). Vermelhos: #33 (`8b57d4d`), #34 (`4b71ba5`), #35 (`d1d50b1`), #36 (`4523621`), docs-only `5c7bcbd` e #38 (`33aaac4`).
  - Causas determinísticas identificadas e **corrigidas** (commits `f2c46b9` e `33aaac4`, só arquivos de e2e): expectativa do RPC `registrar_entrada` sem `p_custo` (contrato mudou no custo de entrada, `d1d50b1`) e specs que usavam `getByLabel('Lote')`/`getByLabel('Validade')` na Entrada, que virou seleção de lote por **radio** (FEFO) com fluxo "Novo lote" em `cf95289`. Com os fixes, a suíte completa local passou **2×** (207 passed, 2 skipped, 0 failed).
  - O run #38 (`33aaac4`) **ainda falhou no CI** (job `e2e`, ~254 s de Playwright, exit 1), com a suíte verde localmente — **falha só de ambiente de CI** até aqui. Logs e artefato do Playwright exigem **sign-in/admin** (API anônima: 403/401), então o teste que falhou no runner não pôde ser identificado sem credencial. Reprodutibilidade local: verde 2× seguidas. Pendência de diagnóstico: ver §3.7.

### Git local

- Branches: `saas` (principal de trabalho), `main`, `galpao-1.x`; remotas `origin/main`, `origin/saas` + `ia-autonoma/*` antigas.
- Fixes de DevOps commitados na `saas`: `f2c46b9` (p_custo) e `33aaac4` (radio/novo lote) — somente `e2e/`.

## 3. O que falta / pendências

1. **Domínio próprio**: nenhum configurado no Pages.
2. **Produção = `saas` sem gate**: o deploy acontece mesmo com CI vermelho (foi o caso entre 06/11 e 11/11). Opções de gate no §3.8.
3. **Versão do cliente (branch `galpao-1.x`) não tem ambiente publicado**: decidir qual branch é a produção oficial e se a outra precisa de projeto/URL separados.
4. **Backup/restauração do Supabase em produção não ensaiado** (T-028). Backup local não substitui o de nuvem.
5. **`ia-diaria.yml` ("🤖 Fábrica Autônoma Full-Stack")**: existe commitado no git, apagado **sem commit** na árvore de trabalho local, e **todos os 28 runs falharam** (agendado diário 03:00 UTC + manual). Falha visível nos summaries públicos: etapa de e-mail (`dawidd6/action-send-mail@v3`) — *"At least one of 'to', 'cc' or 'bcc' must be specified"* (destinatário não configurado) — e `exit code 1` do processo; também *"No files were found with the provided path: playwright-report"*. Não mexi no arquivo (deleção pendente de decisão; ver proposta na conversa).
6. **T-034 (NFC-e/Asaas) vai exigir Workers/Edge Functions** com segredos server-side (a conta não tem nenhum Worker hoje; a migration `20261111090000_nfce_fila_gestao.sql` aguarda aplicação no Supabase de produção pelo usuário).
7. **Falha do e2e só no CI (run #38)**: não identificada por falta de credencial. Ações possíveis, em ordem: (a) sign-in no GitHub para ler o log do job / baixar `playwright-report` (artefato de 2,9 MB com traces); (b) revalidar com novo run; (c) se confirmar flake de runner (tempo/CPU do windows-latest), aumentar `timeout`/`retries` no `playwright.config.ts` ou isolar o spec lento. **Não** alterei config às cegas.
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

- **Supabase** (SMTP próprio, Site URL, backup automático/pause do plano, aplicação da migration da fila): conferir no painel.
- **Log/artefato do run #38 do Actions**: exigem sign-in com direito de admin; API anônima só dá statuses/steps/annotations.
- **Branch protection atual da `saas`**: settings do repositório não são públicos.
- **Plano/limites/faturamento Cloudflare**: plano "standard" confirmado; limites de build não verificados.

## 6. Fontes

- `README.md`, `DOCUMENTACAO_ERP.md`, `.github/workflows/testes.yml`, `dist/_redirects`/`public/_redirects`
- `git` local e API pública do GitHub Actions (runs #32–#38, steps, annotations; 403/401 em logs e artefato)
- MCP Cloudflare (leitura): `accounts_list`, `pages_list`, `pages_deployments_list`, `pages_domains_list`, `workers_legacy_scripts_list`
- `memoria/estado.json` (backlog T-028, T-034, T-035); `memoria/historico.md`
