# Laudo de Segurança — Auditoria baseline (ERP Galpão)

> **Ciclo:** 11–12/11/2026, por Segurança ERP (OpenBot). **Natureza: SOMENTE LEITURA** — nada em
> `src/`, `supabase/`, `e2e/` ou Cloudflare foi modificado; nenhum commit. Únicos arquivos escritos:
> este laudo e o append em `memoria/historico.md`.
> **Código auditado:** commit `5c7bcbd` (checkout local = produção atual — o Pages implantou exatamente
> este commit em 12/11/2026 01:34 UTC). Migrações: 13 arquivos em `supabase/migrations/`.
> **Método:** leitura integral das migrações e das libs de front/integração, grep de sinks (XSS/segredos),
> `npm audit`, consulta **somente leitura** ao MCP Cloudflare (accounts/pages) e `curl` de produção
> (só requisições GET/HEAD). `npm audit` e `npm ls` rodados, mas **nenhum pacote atualizado**.

---

## 0. Resumo executivo

Estado geral: **bom para a fase atual**. O desenho multiempresa no banco é raro de ver tão consistente:
RLS habilitada em todas as tabelas (verificado pelo metatest do `test:sql`), chaves estrangeiras compostas,
histórico imutável por gatilho, `SECURITY DEFINER` sempre com `search_path = ''`, token de convite só como
hash, concessões por coluna. No front, zero sink de XSS (`dangerouslySetInnerHTML`/`innerHTML`/`eval`
inexistem em `src/`), e nenhum segredo além das `VITE_*` públicas chega ao bundle; `.env` nunca foi
commitado (histórico git vazio para o arquivo).

Os riscos maiores estão **fora** do desenho de produto: o pipeline publica produção sem nenhum gate, a
conta Cloudflare roda sem 2FA obrigatória, a produção serve **sem CSP/X-Frame-Options/HSTS**, e um grupo
de funções `app.*` (SECURITY DEFINER) ficou executável por qualquer usuário autenticado — vazando dados
de outras empresas — por causa de um `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app` "pega tudo". Nenhum
achado exige ação de emergência hoje, mas os itens **ALTO** abaixo deveriam sair antes do piloto em loja
real (T-028).

| ID | Sev. | Frente | Achado |
| --- | --- | --- | --- |
| PR-1 | ALTO | Processo | Push em `saas` vai a produção mesmo com CI vermelho (e2e vermelho desde 06/11) |
| BD-1 | ALTO | Banco | `app.verificar_saldos()` executável por qualquer `authenticated` → lê saldos de **todas** as empresas (bypassa RLS via SECURITY DEFINER) |
| BD-2 | ALTO | Banco | `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO authenticated` (blanket): funções novas nascem expostas; sem metatest de allowlist no `test:sql` |
| FT-1 | ALTO | Infra/Front | Produção sem CSP, X-Frame-Options, HSTS nem Permissions-Policy (`public/_headers` não existe); 2FA da conta Cloudflare desligada |
| CF-1 | ALTO | Infra | 2FA não obrigatória na conta (`enforce_twofactor: false`) — tomada da conta = controle do deploy |
| CF-2 | MÉDIO | Infra | Previews **de todas** as branches, públicos e sem senha, rodando contra o mesmo Supabase de produção |
| BD-3 | MÉDIO | Banco | `app.seed_segmento`, `app.proximo_numero`, `app.estado_empresa` chamáveis cross-tenant (poluição/contador/estado de assinatura de outra empresa) |
| BD-4 | MÉDIO | Banco/LGPD | CPF do consumidor em texto claro em `vendas.cliente_cpf` **e** em `pdv_eventos.payload`/`divergencias.detalhes`; sem política de retenção/expurgo parcial |
| FT-2 | MÉDIO | Front | `npm audit`: 12 vulnerabilidades — 1 crítica (`dompurify` via jspdf, no bundle runtime), 1 alta (`vite`, só dev) e moderadas (`exceljs/uuid` runtime, demais de build) |
| FT-3 | MÉDIO | Front | Google Fonts externo no `index.html` (dependência de terceiro; CSP precisa cobrir ou self-host) |
| PR-2 | ALTO | Processo | Backup/restauração do Supabase de produção nunca ensaiados (T-028); backup local cobre só o PGlite |
| BD-5 | BAIXO | Banco | Convites expirados/cancelados e `erros_cliente` nunca expurgados; `ver_convite` anônimo sem limite de tentativas (entropia alta compensa) |
| FT-4 | BAIXO | Front | Sessão Supabase persistida em `localStorage` (padrão da lib; mitigação depende de CSP) |
| BD-6 | BAIXO | Banco | `nfce_chave`/`nfce_qrcode` aceitos do cliente em `salvar_nfce` — coerente com emissor stub; T-034 deve mover a fonte para o servidor |

---

## 1. Infra Cloudflare (leitura via MCP + curl)

**O que é:** 1 projeto Pages (`erp-galp-o`), GitHub → Pages, produção = branch `saas`, `npm run build`
→ `dist`, sem Workers e sem Pages Functions (`uses_functions: false`), domínio próprio nenhum (só
`erp-galp-o.pages.dev`). Plano da conta: standard. Último deploy de produção: 12/11/2026 01:34 UTC,
commit `5c7bcbd` (docs) — a produção está em dia com o repositório.

- **CF-1 (ALTO) — 2FA não obrigatória.** `accounts_list` traz `enforce_twofactor: false`. Quem roubar a
  senha da conta (única, sem 2FA exigida) mexe em env vars, domínios e deploys. *Mitigação (painel, só
  o usuário):* ativar "Two-Factor Authentication Enforcement" e revisar sessões/tokens de API.
- **CF-2 (MÉDIO) — previews de todas as branches, públicos.** `preview_deployment_setting: "all"`,
  `preview_branch_includes: ["*"]`. Cada preview herda as **mesmas env vars de produção** → feature em
  WIP roda contra o Supabase real, e a URL do preview é acessível a quem tiver o link. *Mitigação:*
  (a) ativar **Access Policy nos preview deployments** (Pages → Settings → sensível: precisa do painel),
  (b) restringir `preview_branch_includes`, (c) no T-034, apontar previews para um projeto Supabase de
  homologação.
- **WAF/rate limiting/DDoS:** em `*.pages.dev` **não há zone** (nenhum domínio próprio registrado),
  logo não existem regras WAF, rate limiting ou page rules configuráveis — o que existe é a proteção
  padrão de borda da Cloudflare (TLS, DDoS L3/L4/L7 básico, `x-content-type-options: nosniff` e
  `referrer-policy` já embutidos). Rate limiting custom só faria sentido com domínio próprio (zone) ou
  com um Worker na frente. Como o app inteiro fala **direto** com `*.supabase.co`, o limite mais
  importante é o do Supabase (Auth/REST), que é configurado no painel deles — ver §"Não verificado".
- **Cabeçalhos HTTP (produção, medidos 12/11/2026 01:41 UTC, `curl -I`):** `200`, `content-type`
  correto, `x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`,
  `access-control-allow-origin: *` (irrelevante para SPA pública, mas permite hotlink do bundle) e
  **ausência total** de `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, HSTS e
  `Permissions-Policy`. `public/` só tem `_redirects`; **não existe `_headers`** (nem no `dist`).
  *Mitigação recomendada (não aplicada):* criar `public/_headers` com
  - `Content-Security-Policy`: `default-src 'self'`; `script-src 'self'`; `style-src 'self' 'unsafe-inline'`
    (Tailwind inline) + `https://fonts.googleapis.com`; `font-src 'self' https://fonts.gstatic.com`;
    `connect-src 'self' https://vaihnxmwuouztvdojnyv.supabase.co https://*.supabase.co wss://*.supabase.co`;
    `img-src 'self' data: blob:` (QRCode/câmera); `frame-ancestors 'none'`; `base-uri 'none'`;
    `form-action 'none'`; `upgrade-insecure-requests`;
  - `X-Frame-Options: DENY` (cobertura antiga além do frame-ancestors);
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains` (com `preload` só se houver domínio próprio);
  - `Permissions-Policy: camera=(self), geolocation=(), microphone=()`;
  - `Cross-Origin-Opener-Policy: same-origin` e `Referrer-Policy: strict-origin-when-cross-origin`.
  **Pré-condição:** validar a CSP num preview primeiro (o SW do PWA e as fontes são os pontos de
  quebra prováveis). Headers via `_headers` valem para páginas e assets do Pages.
- **CF-3 (BAIXO):** sem notificação/monitoramento de deploy (herdado do laudo DevOps); `pr_comments_enabled`
  ligado é ok. `usage_model: standard` — sem faturamento sob risco de abuso visto hoje.

---

## 2. Banco (`supabase/migrations/`, 13 arquivos)

**O que está bom** (para não repetir depois): RLS em todas as tabelas; `revoke` geral e concessões por
coluna; políticas sempre por `empresa_id`/`app.minhas_*`; SECURITY DEFINER com `search_path = ''` em
**todas** as funções (conferido um a um); convites com token de 64 hex (≈244 bits) guardado **só como
hash** e leitura por coluna revogada; PDV offline com idempotência (`pdv_eventos.id` + `hash`), quarentena
de evento conflitante e validação de totais; imutabilidade de vendas/movimentações com exceção só para o
expurgo da plataforma; `expurgar_empresa` revogada para `authenticated`; funções de RPC do usuário sempre
com gate de papel no banco (dono/gerente/caixa/estoquista) e assinatura gravável.

**Achados:**

- **BD-1 (ALTO) — função de conferência vaza dados de outras empresas.**
  `app.verificar_saldos(p_empresa uuid default null)` (base, §6) é SECURITY DEFINER e o grant blanket
  (linha 778 da base) a deixa executável por qualquer `authenticated`. Com `p_empresa = null` ela devolve
  `loja_id, lote_id, saldo_tabela, saldo_historico` de **todas as empresas** — dentro de uma SECURITY
  DEFINER o RLS do owner se aplica (postgres bypassa RLS), então a política de isolamento cai.
  O `test:sql` chama essa função sempre como postgres, por isso não pegou. *Correção:* `revoke execute on
  function app.verificar_saldos(uuid) from authenticated;` (+ permitir só service role/plataforma) e
  metatest novo (ver BD-2).
- **BD-2 (ALTO, padrão/processo) — grant blanket em `app`.**
  `grant execute on all functions in schema app to authenticated;` (base, linha 778) faz toda função
  nova no schema `app` nascer chamável pelo app. Foi exatamente como `pdv_*` acabou exposta e teve de ser
  revogada à mão no PDV (linhas 851–854). *Correção:* trocar por allowlist explícita + **metatest** no
  `scripts/testar-sql.mjs`: falhar se `authenticated` tiver execute em função `app.*` fora de uma lista
  declarada (hoje o metatest de funções existe só para `anon`, onde `ver_convite` é a única exceção).
- **BD-3 (MÉDIO) — três funções `app.*` chamáveis cross-tenant.**
  `app.seed_segmento(uuid, text)` insere categorias/produto "Diversos" em **qualquer** `empresa_id` sem
  checar vínculo do chamador; `app.proximo_numero(uuid, text)` incrementa contadores alheios (números de
  venda/código interno pulam — doS leve, sem integridade); `app.estado_empresa(uuid)` consulta a situação
  de assinatura de qualquer empresa por UUID. Dano limitado (UUIDs não são enumeráveis), mas são bypass
  de RLS à toa. *Correção:* mesma receita do BD-1 (revoke; chamadas só internas/plataforma).
- **BD-4 (MÉDIO, LGPD) — CPF replicado em três lugares, sem retenção.**
  `vendas.cliente_cpf` (migração 20261023) é inserido também no evento PDV (`src/pdv/venda.ts:156`) →
  fica em `pdv_eventos.payload` para sempre e pode ir para `divergencias.detalhes` no caso
  `evento_conflitante` (payload inteiro anexado). Não há máscara, expurgo parcial nem TTL. O expurgo por
  empresa (plataforma) apaga em cascata — ok — mas enquanto a empresa existe, CPF fica em log de eventos.
  *Correção sugerida:* (a) `pgcrypto`-free: gravar o CPF apenas na `vendas` (e no evento substituir por
  um placeholder/hash de dedupe), (b) rotina/Edge para truncar `pdv_eventos.payload` e `erros_cliente`
  (p. ex. > 180 dias), (c) decisão documentada com o contador sobre retenção fiscal de `cliente_cpf`
  (NFC-e guarda CPF por 5 anos quando emitida — o expurgo deve seguir a regra fiscal, não a de log).
- **BD-5 (BAIXO) — sem retenção em tabelas de apoio.** Convites expirados/cancelados, `erros_cliente`
  e `divergencias` resolvidas nunca são apagadas (crescimento e retenção de dados pessoais: e-mail em
  `convites`, stack/UA em `erros_cliente`). Sugerir rotina de limpeza (≥ 90 dias) e, para `ver_convite`
  (única RPC anônima), não há limite de tentativas — tolerável pela entropia do token, mas vale nota
  no painel (rate limit do Auth/PostgREST).
- **BD-6 (BAIXO) — chave fiscal nasce no cliente.** `salvar_nfce` aceita `p_chave`/`p_qrcode` que o
  próprio cliente envia (o QA já registrou como D-5). Com o emissor stub não há dano real; no T-034 a
  emissão deve passar pelo servidor (ver §4) e `salvar_nfce` deve ficar restrito à função server-side.
- **Realtime:** publication inclui `produtos, lotes, estoque_saldos, produtos_codigos, categorias, vendas,
  divergencias, caixas` — com RLS ligada, o WALRUS do Supabase filtra por usuário. Não verificado no
  ambiente real (ver §"Não verificado").
- **Dados sensíveis em log:** `erros_cliente` guarda mensagem/stack/URL/UA — o cliente já remove
  query/hash da URL (`src/lib/monitoramento.ts:66`), o que preserva o token de convite do log. Bom.
  O `pdv_eventos.payload` (BD-4) é o principal ponto de atenção.

---

## 3. Front-end (XSS, segredos, dependências)

- **FT-OK — zero sink de XSS.** Grep em `src/`: nenhum `dangerouslySetInnerHTML`, `innerHTML`,
  `outerHTML`, `document.write`, `eval(`, `new Function`. React escapa por padrão; a única concatenação
  de HTML do sistema é texto estático (`App.tsx:85`). PDF/Excel via `jspdf`/`exceljs` com dados próprios
  (não entrada de terceiros não tratada).
- **FT-1 (ALTO) — headers ausentes** (detalhe em CF-2 do §1). Com o bundle embutindo `dompurify`
  (FT-2) e o app autenticado por JWT em `localStorage`, a **CSP é a mitigação estrutural** certa para o
  cenário de XSS futuro: sem ela, um payload que escapar do React roda sem barreira.
- **FT-2 (MÉDIO) — `npm audit`: 12 vulnerabilidades** (3 low, 7 moderate, 1 high, 1 critical). Nada
  atualizado (missão). Classificação prática:
  - **runtime (vai no bundle):** `dompurify` **crítica** (GHSA SAFE_FOR_TEMPLATES/IN_PLACE, CVSS não
    atribuído) via `jspdf@4.2.1` — exploração improvável no nosso uso (jspdf sanitiza conteúdo próprio,
    os modos atacados — SAFE_FOR_TEMPLATES/DOM output — não são usados), mas `npm audit fix` resolve
    sem quebrar → **atualizar por higiene, urgência baixa**; `uuid` moderate via `exceljs` (bounds em
    v3/v5/v6; exceljs usa v4) → junto; `deepmerge` low (build chain do PWA).
  - **só dev/build:** `vite` **high** (4 CVEs: launch-editor no Windows, middlewares, leitura de arquivos
    fora do `server.fs` — risco ao **dev server da máquina do desenvolvedor**, não à produção) →
    `npm audit fix` direto; `serialize-javascript` low (workbox build), `fast-uri`/`glob`/`minimatch`
    moderadas (build).
  - Fixes de **quebra** (`fix-quebra`): `exceljs` 3.4.0 (downgrade, provavelmente falso sinal do
    ecossistema), `vite-plugin-pwa` 1.1.0 — avaliar separadamente, não são urgentes.
- **FT-3 (MÉDIO) — Google Fonts externo.** `index.html:12-14` carrega CSS/fontes de
  `fonts.googleapis.com`/`fonts.gstatic.com`: terceiro em toda abertura (privacidade + SPOF quando o
  offline do PWA dá conflito + quebra de CSP se esquecida na whitelist). *Sugestão:* self-host das
  4 famílias Inter (cabe no `_headers`/assets do Pages).
- **FT-OK — segredos.** `src/` usa só `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable,
  pública por design) e `VITE_NOME_SISTEMA`. `.env.example` orienta certo (service role só no PC do
  suporte, via env). `.env` é gitignored e **nunca foi commitado** (`git log --all -- .env` vazio).
  `scripts/piloto.mjs` lê a service role do ambiente, nunca do código. Nenhuma key de emissor/Asaas
  existe ainda.
- **FT-4 (BAIXO) — sessão em `localStorage`** (`galpao-sessao`, `persistSession`): padrão supabase-js;
  roubo de token exige XSS (caminho fechado pela CSP) — registrar a dependência entre FT-1 e FT-4.
- **PWA/service worker:** workbox pré-cache de assets próprios, `navigateFallbackDenylist` para `/sb/`;
  sem cache de respostas de API (sem risco de dados offline inesperados além do Dexie do PDV, que é
  intencional). Nota LGPD menor: a fila offline do PDV (IndexedDB/Dexie) também guarda `cliente_cpf`
  até sincronizar — apagar o item após sync reduziria o resíduo.

---

## 4. Back/integrações futuras — requisitos de segurança para o T-034 (NFC-e e Asaas)

Hoje os dois são stub desligados (`criarEmissorNFCe`, `criarServicoCobranca` retornam
`nao_configurado`) — **nada a auditar em execução; abaixo, os requisitos que o T-034 deve atender:**

1. **Segredos fora do bundle, sempre.** Certificado digital A1 (+ senha do certificado), token/key do
   emissor fiscal, API key do Asaas e token de webhook: em **Supabase Edge Function secrets** (ou Worker
   secrets, se a integração for Cloudflare). Nada em `VITE_*`, nada em tabelas, nada em chat. A conta
   hoje **não tem nenhum Worker** e o Supabase não tem Edge Functions — é infraestrutura nova (DevOps
   já registrou).
2. **Emissão NFC-e: a chave de acesso nasce no servidor.** Fluxo proposto: app autenticado (JWT) →
   Edge Function → emissor; a função valida papel via banco (reusar `app.pdv_verificar_acesso`) e grava
   o resultado por `public.salvar_nfce` (SECURITY DEFINER já pronta) — aí o `caixa` deixa de enviar
   chave/QR (fecha o BD-6/D-5 do QA). Validar o retorno do emissor (chave + protocolo/digest do QR)
   **antes** de gravar `emitida`. Idempotência: dedupe por `venda_id` + tentativa; retry com backoff na
   fila já existente (`emitirVendasPendentes`). O XML/retorno do emissor não deve ser logado inteiro
   (tem CPF/valores): log só chave, status e código de rejeição (a `nfce_erro` atual já segue isso).
3. **Webhooks Asaas: confiança mínima.** (a) token de assinatura configurado no webhook (header) e
   conferido na função; (b) **revalidar o evento chamando a API** (`GET payment/:id`) antes de alterar
   `assinaturas` — o payload do webhook nunca é fonte de verdade; (c) idempotência por
   `payment_id/evento` (tabela de eventos processados); (d) NUNCA gravar dados de cartão (Asaas
   tokeniza); (e) a atualização de `assinaturas` deve ser função SECURITY DEFINER dedicada
   (`service role`), não UPDATE aberto; (f) responder rápido e processar async (retries do Asaas
   duplicam eventos).
4. **Rate limit/DDoS nos endpoints novos.** Edge Functions ficam em `*.supabase.co`, fora do Pages —
   definir limites próprios (contagem por usuário/IP na função) e monitorar; o painel do Supabase
   também tem rate limit de Auth/API (ver "Não verificado").
5. **Rotação e escopo de segredos:** chave do emissor/Asaas com owner documentado, rotação semestral ou
   sob suspeita, e um segredo por ambiente (produção ≠ homologação). Inventário em
   `memoria/` (sem os valores).

---

## 5. Testes de carga — PLANO (não executado)

Ferramenta: **k6** (Grafana), scripts em `scripts/carga/*.js`, dados 100% sintéticos. O gargalo não é o
Pages (CDN estática) e sim o **Supabase** (Postgres + RLS + PgBouncer) — todo cenário exercita RPC/REST
dele. Para **não derrubar produção**:

- **Alvo de segurança:** criar empresa dedicada `CARGA-<data>` (script com service role via
  `npm run piloto` padrão) e **depois `app.expurgar_empresa`**; ou, preferível, homologação: Supabase
  novo projeto + mesmo `dist` com env vars de preview. Produção só recebe o cenário 0 (smoke, ≤ 5 VUs).
- **Janela e abort:** horário fora de loja (ex. 06:00–08:00), máximo 15 min por cenário; abortar se
  erro > 1% ou p95 > 1.5 s em dois intervalos seguidos; verificar `divergencias`/`erros_cliente`
  zerados ao fim.
- **Cenários:**
  1. **Sync do PDV offline (o mais importante):** N caixas × lote de 20 eventos `venda` por ciclo via
     `pdv_sincronizar`. Ramp 5→50 VUs por 5 min. Métricas: p95 < 300 ms, erro 0, divergências só as
     esperadas (saldo_negativo simulado).
  2. **Fila NFC-e:** pré-criar 1.000 vendas `pendente` e medir `salvar_nfce`/listagem da fila
     (`listarVendasFilaNFCe`) sob 10 VUs — pagination não existe lá; validar que a fila não degrada
     linear (índice `vendas_empresa_data_idx`).
  3. **Listagens grandes:** `buscarTudo` de produtos (20k), vendas/movimentações (100k) e
     `Relatorios`/exportar — medir p95 e memória do cliente; verifica o comportamento do limite de 1000
     por página (`cliente.ts:63`).
  4. **Catálogo do caixa:** `pdv_catalogo` completo vs incremental (10k produtos) — p95 < 200 ms no
     incremental.
  5. **Smoke produção (≤ 5 VUs):** só página + `ver_convite` inválido + login, para medir borda do
     Pages.
- **Métricas/relatório:** `k6 run --summary-export memoria/carga-<data>.json`;resholds por cenário no
  script; comparar antes/depois de migrações estruturais (ex.: mudança em `movimentacoes_saldo`).
- **O que não pode ser feito:** carga direta no Postgres fora da API (o RLS é parte do custo a medir),
  e testes com dados reais de clientes.

---

## 6. Processo — o que falta para "seguro por padrão"

- **PR-1 (ALTO) — gate de deploy.** Produção = `saas` publica sem exigir checks do Actions (e o e2e
  está vermelho desde 06/11, sob o DevOps). *Opções (decisão do usuário):* (a) branch protection na
  `saas` exigindo os checks do `testes.yml` (GitHub → precisa painel), (b) publicar produção só por
  deploy manual (`wrangler pages deploy`) desligando o auto-deploy de produção, (c) no mínimo, um
  checklist "CI verde" antes de push em `saas` escrito no `agents/regras_projeto.md`.
- **PR-2 (ALTO) — backup/restauração de produção (T-028).** `scripts/backup.mjs` cobre só o PGlite
  local. Para o Supabase real: confirmar plano/backup automático e **PITR no painel**, agendar
  `pg_dump` externo (ex.: para um bucket R2 próprio) e **ensaiar restauração** numa empresa/projeto de
  teste, com runbook (restaurar → conferir `app.verificar_saldos` → abrir app). Só o usuário tem acesso
  ao painel — falta esse acesso/decisão.
- **PR-3 (MÉDIO) — gate de segurança no CI.** Hoje o `testes.yml` roda build+vitest+test:sql+e2e —
  bom, mas nada de: `npm audit` com nível mínimo (high) e allowlist de exceções data+justificativa,
  secret-scan (`gitleaks` no push/PR), e os **metatests de segurança novos** (BD-1/2/3: allowlist de
  `app.*` para `authenticated`). Sugestão: job `seguranca` no `testes.yml`.
- **PR-4 (MÉDIO) — migrações novas × `test:sql`.** Ponto positivo: o runner varre a pasta e roda
  qualquer migração nova automaticamente — o que falta é **exigir** que a migração nova venha com os
  testes dela (regra em `agents/regras_projeto.md`: "migração que muda RLS/funções/grants precisa de
  caso novo em `test:sql` + metatest ainda verde") e revisão de segurança (este agente) antes do merge
  de migrações.
- **PR-5 (MÉDIO) — rotação de chaves/inventário.** Hoje: anon key (pública, estática, ok) e
  service role (no PC do suporte/`.env` local — inventariar onde mais existe, rotação no painel se
  exposta). T-034: certificado A1 (expira 1–3 anos), keys Asaas/emissor — definir política (quem
  guarda, como rota, o que fazer quando vazou) antes do primeiro segredo real entrar.
- **PR-6 (BAIXO) — higiene de conta:** 2FA Cloudflare (CF-1) e GitHub; revisar membros/tokens OAuth
  da integração GitHub↔Pages; notificação de deploy falho (CF-3).
- **PR-7 (BAIXO) — documentação:** `DOCUMENTACAO_ERP.md` cita workflow `ia-diaria.yml` que não existe
  (devops-estado §3.5); atualizar para não confundir auditorias futuras.

---

## 7. O que NÃO pôde ser verificado (precisa do usuário/painel)

1. **Painel Supabase** (não acessível via MCP): Site URL e Redirect URLs do Auth (allowlist — comum
   deixar aberto); provedores ativos (só e-mail+senha?); regra "leaked password protection" e MFA do
   Auth; rate limits de Auth/PostgREST; SMTP próprio; plano/usage, pause automático e **backups/PITR**
   reais; se a RLS do banco real difere das migrações (o `test:sql` roda em PGlite simulado — um
   `pg_dump --schema-only` de produção para diff encerraria essa dúvida).
2. **Painel Cloudflare:** ativar 2FA (CF-1) e Access nos previews (CF-2) são ações do usuário; limites
   de build e notificações não vistos.
3. **GitHub:** branch protection da `saas`, permissões do App Pages, e o estado atual do Actions
   (`gh` não instalado; runs não consultados — o "vermelho desde 06/11" vem do contexto DevOps).
4. **Runtime real do app:** headers medidos via curl; bundle inspecionado no `dist` local do mesmo
   commit — não baixei os assets do ambiente ao vivo asset por asset.
5. **NFC-e/Asaas:** emissor e gateway são stub — não há tráfego nem config para auditar (§4 é
   prescritivo).
6. **Realtime em produção** (WALRUS respeitando RLS) e comportamento do PgBouncer sob concorrência —
   é o que o plano de carga (§5) medirá.

## 8. Ordem sugerida de correção (próximos ciclos)

1. (Com acesso do usuário) 2FA Cloudflare/GitHub + branch protection `saas` + Access nos previews.
2. Migração única de segurança: `revoke execute` de `app.verificar_saldos/seed_segmento/proximo_numero/
   estado_empresa` para `authenticated` + metatests de allowlist no `test:sql` (fecha BD-1/2/3).
3. `public/_headers` com CSP etc., validado em preview antes do merge (fecha FT-1).
4. `npm audit fix` sem quebra (dompurify, vite, serialize-javascript, fast-uri) — DevOps/dev.
5. Retenção: limpeza de `pdv_eventos.payload`/`erros_cliente`/convites + decisão sobre `cliente_cpf`.
6. Backup/restauração de produção ensaiados (PR-2) antes do piloto em loja real.
7. Job de segurança no CI + gitleaks (PR-3).
