# Estado de Deploy — DevOps

> Atualizado em **11/11/2026** por DevOps (OpenBot), a partir de README.md, DOCUMENTACAO_ERP.md, `.github/workflows/`, `dist/_redirects`, `git` local e consulta **somente de leitura** ao MCP Cloudflare. Nada foi modificado nem publicado.

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

- **Integração GitHub → Cloudflare Pages**: repositório `Vitorloula/Erp-Galp-o`.
  - Branch de produção: **`saas`** (todo push em `saas` vai direto para produção; `origin/HEAD` aponta para `saas`).
  - Previews: todas as branches (sem senha/exceção configurada).
- **Build**: `npm run build` → pasta `dist`. Node fixado em `22.12.0` via variável de ambiente.
- **Variáveis de build** (iguais em produção e preview): `NODE_VERSION`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (chave publishable — pública por design; a proteção é RLS no banco. Valor não registrado aqui de propósito).
- **Roteamento SPA**: `public/_redirects` (`/* /index.html 200`) está presente no `dist` — compatível com Cloudflare Pages.
- **Último deploy de produção**: **06/11/2026 21:01 UTC**, commit `d1d50b1` "fix" (HEAD da `saas`), todas as etapas com sucesso. Ou seja: produção está em dia com a branch publicada.
- **CI (GitHub Actions)**: `.github/workflows/testes.yml` roda em push/PR —
  - `qualidade` (Ubuntu): `npm run build` + Vitest + `test:sql`;
  - `e2e` (Windows + Edge): `npm run test:e2e:ci`, com artefato do relatório em falha.
  - O CI **não faz deploy**: a publicação é automática pela Pages, independente do resultado do CI.

### Git local

- Branches locais: `saas` (checkout atual), `main`, `galpao-1.x`.
- Remotas: `origin/main`, `origin/saas`, mais `ia-autonoma/*` antigas.
- Checkout local em `d1d50b1` — exatamente o commit do último deploy de produção.

## 3. O que falta / pendências

1. **Domínio próprio**: nenhum configurado no Pages. Se o cliente galpão usar marca própria, será preciso registrar/apontar domínio e adicionar o domínio customizado ao projeto.
2. **Produção = `saas` sem gate**: o deploy da `saas` acontece mesmo se o CI falhar (Pages não exige status check do Actions). Para o piloto em loja real (T-028) vale avaliar branch protection ou publicar a partir de outra branch/tag.
3. **Versão do cliente (branch `galpao-1.x`) não tem ambiente publicado**: README diz que a versão entregue ao cliente fica em `galpao-1.x`, mas a produção hoje é a `saas`. Decidir a política: qual branch é a produção oficial e se a outra precisa de um projeto/URL separado.
4. **Backup/restauração do Supabase em produção não ensaiado** (parte do T-028; a documentação alerta para não prometer point-in-time recovery antes de validar com o provedor). Backup local (`npm run backup`) não substitui o backup de nuvem.
5. **Workflow `ia-diaria.yml` citado em DOCUMENTACAO_ERP.md §7 não existe** em `.github/workflows/` (só `testes.yml`). Doc desatualizada ou arquivo removido (commit `8b57d4d` "atualizar workflow da fábrica IA"). A doc cita a branch `saas` para esse workflow — coerente com o pipeline atual.
6. **T-034 (NFC-e/Asaas) vai exigir infraestrutura nova**: a conta hoje não tem nenhum Worker; a integração server-side pedirá Workers/Edge Functions com segredos **fora** de `VITE_*` (hoje só existem as duas variáveis públicas no Pages).
7. **Sem monitoramento de deploy**: nenhuma notificação de falha de build/deploy configurada (verificação do lado Pages; e-mail padrão do Cloudflare não confirmado).

## 4. O que ficou bom / estável

- Build e deploy automáticos funcionando (última execução com sucesso, ~50 s de build).
- Configuração do Pages casada com o README: comando, pasta, variáveis, Node 22.
- `_redirects` cobre o roteamento SPA.
- CI separa qualidade (rápida, Linux) e E2E (Windows/Edge), com retries e artefato em falha.
- Site é estático puro (`uses_functions: false`) — superfície de ataque pequena; segredos de service role nunca vão para o bundle.

## 5. Não verificado (fora do alcance desta consulta)

- **Supabase** (SMTP próprio, Site URL em Authentication, backup automático/pause do plano): o MCP Cloudflare não cobre Supabase; conferir no painel. README §"Colocar no ar" lista esses passos como obrigatórios para produção.
- **Runs recentes do GitHub Actions**: o CLI `gh` não está instalado nesta máquina e não há MCP do GitHub conectado; não sei o estado do CI (último run verde/vermelho) nem as regras de branch protection.
- **Plano/paleta de conta Cloudflare**: plano "standard" confirmado, mas não verifiquei limites de build nem faturamento.

## 6. Fontes

- `README.md` (seção "Colocar no ar", comandos, testes)
- `DOCUMENTACAO_ERP.md` (status 06/11/2026, CI, limitações)
- `.github/workflows/testes.yml` (único workflow presente)
- `dist/_redirects` e `public/_redirects`
- `git` local (branches, remoto, HEAD)
- MCP Cloudflare (leitura): `accounts_list`, `pages_list`, `pages_domains_list`, `workers_legacy_scripts_list` — projeto `erp-galp-o`, zero Workers, zero domínios customizados
- `memoria/estado.json` (backlog T-028, T-034, T-035)
