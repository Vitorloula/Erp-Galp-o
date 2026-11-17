# Plano T-039 — Painel Super Admin da plataforma

> **Status:** plano do Arquiteto (não implementado). Fonte da verdade: `memoria/espec-super-admin.md` (texto verbatim do dono, 15/11/2026).
> **Condição de partida:** o T-038 (Módulo Serviços) está EM EXECUÇÃO pelo Programador. Nada aqui usa o WIP de `src/` como referência — a análise abaixo vem de commits/migrations/docs existentes. `App.tsx` e `Layout.tsx` serão tocados pelo T-038; a implementação do T-039 só começa depois do T-038 fechar (§5).
> **Estilo:** passos pequenos, reuso máximo do existente, nada duplicado, inferências marcadas como **(inferência — validar na implementação)**.

---

## 0. O que foi analisado (fontes verificadas em 15/11/2026)

- `memoria/espec-super-admin.md` (spec completa) e `memoria/estado.json` (backlog T-038/T-039, concluídos).
- `memoria/decisao-notaas.md` (T-034: NotaaS, chaves server-side) e `memoria/devops-estado.md` (deploy/CI).
- `supabase/migrations/20261008120000_base_multiempresa.sql` (912 linhas, lida integralmente), `20261027091000_monitoramento_piloto.sql`, `20261010120000_pdv.sql` (trechos de vendas/divergências/imutabilidade), `20261111090000_nfce_fila_gestao.sql` (padrão revoke/grant de funções públicas).
- `src/lib/monitoramento.ts`, `src/components/ErroApp.tsx`, `src/lib/permissoes.ts`, `src/lib/dados/sessao.ts`, `src/lib/dados/cliente.ts`, `src/lib/dados/lgpd.ts`, `src/App.tsx`, `src/components/Layout.tsx` (linhas 1–120), `src/contexto/Empresa.tsx`.
- `scripts/piloto.mjs` (109 linhas), `scripts/testar-sql.mjs` (metarregras + seção de monitoramento), `servidor-local/ambiente-supabase.sql`, `servidor-local/postgrest.ts` (trechos).
- `README.md`, `DOCUMENTACAO_ERP.md`, `PILOTO.md`.

---

## 1. Mapa da arquitetura atual (o que é real hoje, com caminhos/linhas)

### 1.1 Frontend: SPA React única, estática, sem backend próprio

- App única React 19 + Vite, publicada como **site estático** no Cloudflare Pages (`dist`); **não há Workers nem Pages Functions hoje** (`memoria/devops-estado.md` §1 e §3.6: "a conta não tem nenhum Worker hoje"). Push na branch `saas` vai **direto para produção**, com CI informativo que **não faz deploy** (`memoria/devops-estado.md` §2).
- Todo acesso a dados é **Supabase direto do navegador** (PostgREST + Auth + Realtime): cliente criado em `src/lib/dados/cliente.ts:19-21` com `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (cliente.ts:3-8). A chave anon é pública por design; a proteção é RLS (README.md:116).
- **O único schema exposto pela API é `public`** — tabelas e funções (`servidor-local/postgrest.ts:279,301`; é também o padrão do Supabase real). Funções internas ficam no schema `app` e **não são chamáveis pela SPA** (comentário de projeto em `20261008120000_base_multiempresa.sql:8-9`). **Consequência de arquitetura:** toda RPC admin que a SPA vai chamar tem de nascer em `public.*` com verificação interna.

### 1.2 Rotas e contexto (onde uma área /admin entraria)

- `src/App.tsx` tem dois gates que **bloqueiam** um usuário sem empresa: `Sistema` (App.tsx:31-50 — `if (!empresa) return <BoasVindas />` em :36; `if (!loja)` em :38) e `Rotas` (App.tsx:79-98, login em :91). A área admin precisa renderizar **antes** desses gates, porque o super admin pode não ser membro de nenhuma empresa.
- Rotas da retaguarda ficam sob `<Layout />` (App.tsx:53-77); `/pdv` é tela cheia fora do Layout (App.tsx:47). O monitoramento recebe o contexto (empresa/loja/usuário) em `Layout.tsx:110-116` via `configurarMonitoramento` (`src/lib/monitoramento.ts:31-34`).
- Empresa/loja ativa e permissões vêm de `EmpresaProvider` (`src/contexto/Empresa.tsx:28-36,107-120`), que consome `empresas.minhasEmpresas` (empresas nas quais o usuário é membro).

### 1.3 Autenticação (Supabase Auth, e-mail/senha)

- Sessão persistida no aparelho (`storageKey: 'galpao-sessao'`, cliente.ts:19-21); fluxos em `src/lib/dados/sessao.ts`: `getSession` (sessao.ts:25), `signInWithPassword` (:40), `signUp` (:48), `signOut` local (:87), `onAuthStateChange` (:92). Não há outra fonte de identidade (sem OAuth/social hoje).
- Perfil espelho em `public.perfis` (base_multiempresa.sql:26-31, gatilho :33-43 no `auth.users`).
- Erros de auth falham no cliente e são traduzidos em `traduzirErro` (cliente.ts:30-61) — **o único ponto em que falha de auth/HTTP fica observável**, e hoje nada disso é registrado em log.

### 1.4 Multi-tenancy, papéis, RLS

- Princípios (base_multiempresa.sql:4-13): toda tabela de negócio tem `empresa_id` + FK composta `(empresa_id, id)`; RLS aplicada pelo banco; funções auxiliares no schema `app` com `search_path = ''` e `security definer` (:159-202): `app.minhas_empresas()` (:159), `app.empresas_com_papel(papeis)` (:165), `app.minhas_lojas()` (:171), `app.estado_empresa(p_empresa)` (:181-193 — deriva ativa/atrasada/somente_leitura/suspensa **sem rotina agendada**), `app.empresas_gravaveis()` (:196), `app.proximo_numero()` (:204-209), `app.verificar_limite()` (:212-225).
- Papéis: `membros.papel in ('dono','gerente','caixa','estoquista')` (base_multiempresa.sql:120); espelho no cliente em `src/lib/permissoes.ts:40-59` (comentário :4: "a tela só esconde botões que dariam 'sem permissão'").
- Imutabilidade: `app.bloquear_alteracao()`/`app.bloquear_truncate()` (:237-252) travam UPDATE/DELETE/TRUNCATE do histórico; única exceção é o expurgo feito com service role, `app.expurgar_empresa(uuid)` (:742-750), **revogado para authenticated** (:786).
- Assinatura: `assinaturas` (status `trial/ativa/cancelada/cortesia`, `trial_ate`, `pago_ate` — :92-101) e catálogo `planos` (:55-73, seed :68-73). Empresa criada por `public.criar_empresa` (:614-645) com trial de 14 dias.
- Dados úteis para "saúde" que **já existem**: `movimentacoes` (:339-379, `registrado_em`, `origem`, PDV offline aceito e virando divergência — comentário :537-539), `estoque_saldos` (:381-393), `vendas`/`vendas_pagamentos` (20261010120000_pdv.sql:151-216, com `subtotal` :163 e status concluída/cancelada :277-283), `divergencias` com `resolvida_em` (pdv.sql:242-262 + índice de abertas :261).

### 1.5 O stub de Super Admin que JÁ existe

- `public.plataforma_admins` (base_multiempresa.sql:45-49): tabela com `usuario_id` (FK para `auth.users`) e comentário "Administradores da plataforma (operam por Edge Functions com service role, nunca por RLS)". **RLS ligada (:757) sem nenhuma policy e sem grants** — hoje é um stub inerte e seguro: ninguém lê nem escreve por ela via API.
- `scripts/testar-sql.mjs:75` já a lista na tabela de exceções `sistema = ['perfis', 'planos', 'plataforma_admins', 'empresas']` (tabelas de plataforma sem `empresa_id`).
- **Leitura de arquitetura:** o dono já previa "perfil exclusivo de Super Admin"; a proposta deste plano (D1) **reativa esse stub** em vez de criar outra tabela. O comentário sugere "Edge Functions com service role"; este plano propõe algo melhor e mais simples para F1–F4 (funções SECURITY DEFINER checando a tabela server-side), reservando service role/Edge Functions para onde elas são indispensáveis (F5 e integrações do T-034).

### 1.6 Monitoramento atual (T-030)

- Tabela `public.erros_cliente` (20261027091000_monitoramento_piloto.sql:9-21): `id, empresa_id, loja_id, usuario_id, mensagem, stack, url, user_agent, criado_em` + índices por data/empresa. RLS: insert apenas do próprio usuário e empresa própria (:29-34); **select restrito a dono/gerente da própria empresa** (:36-39); anon zerado (:25-27).
- Cliente: `src/lib/monitoramento.ts` — captura silenciosa de `error`/`unhandledrejection` (:114-130), dedupe 5 s (:84-85), lista `IGNORAR` (:19-25, inclui `Failed to fetch` — hoje falha de rede **não** é logada), `urlSegura()` remove query/hash para **não logar o token do convite** (:66-74), guarda últimas 20 no aparelho (:36-43), insere em `erros_cliente` só quando há `contexto.usuarioId` (:96-108), e `diagnosticoParaSuporte()` gera o texto copiável (:132-147).
- UI: `ErroApp` (src/components/ErroApp.tsx:16-25) registra no boundary e oferece "Copiar diagnóstico" (:71-74), com nota "nenhuma senha ou dado de cartão é enviado" (:77-79).
- Operação: PILOTO.md §6 (consulta SQL por service role e limpeza manual >90 dias, PILOTO.md:126-140).

### 1.7 Operação de suporte hoje (o que o painel vai absorver)

- `scripts/piloto.mjs`: CLI com **service role** para `listar`/`status`/`cortesia`/`trial`/`ativa` (piloto.mjs:1-12, 61-81, 89-109) — ajuste de assinatura direto na tabela `assinaturas` (:102-109). Roda só no computador do suporte (PILOTO.md:26-36). Não é tela, não tem auditoria além do que o Supabase registra.
- Backup: local (`npm run backup`) + painel do Supabase; **restauração de produção não ensaiada** (PILOTO.md:171-173, T-028).

### 1.8 Deploy/CI

- Build `npm run build` → Cloudflare Pages; CI `testes.yml` separa `qualidade` (build + Vitest + `test:sql`) e `e2e` (Windows + Edge, retries) (devops-estado.md §2). **Novas tabelas/funções precisam passar pelas metarregras do `test:sql`** (§1.9).
- Migrações aplicadas em produção: 14 confirmadas por leitura MCP em 13/11 (devops-estado.md §5); o T-038 acrescenta `20261115080000_garantia_produto.sql` e `20261115090000_modulo_servicos.sql` (estado.json) — contagem atual **não verificada** (inferência: 16 após o T-038 aplicar).

### 1.9 Metarregras mecânicas que o T-039 TEM que respeitar

`scripts/testar-sql.mjs` (seção "Estrutura") falha o CI se:
1. alguma tabela nova nascer **sem RLS** (:72-73);
2. tabela de negócio nova nascer **sem `empresa_id`** — a lista de exceções `sistema` (:75) é fechada: novas tabelas de plataforma (`admin_auditoria`, incidentes, inspeções) **devem ser acrescentadas a essa lista** (edição deliberada do `scripts/testar-sql.mjs` na implementação);
3. alguma policy chamar `app.*`/`auth.*` fora do formato `(select …)` (:78-82);
4. `anon` ganhar acesso a qualquer tabela/visão (:84-87) ou executar função pública além de `ver_convite` (:89-95) — **toda função `public.*` nova precisa de `revoke execute ... from public, anon` + `grant ... to authenticated`**, como faz `20261111090000_nfce_fila_gestao.sql:95-98`.
5. Harness de teste: `comoUsuario(uid, fn)` simula `auth.uid()` via claims (testar-sql.mjs:24-43); ambiente em `servidor-local/ambiente-supabase.sql` (roles `anon`/`authenticated` simulados, default privileges liberados — :63-67, por isso cada migration restringe).

### 1.10 O que é observável HOJE × o que só existirá em fases futuras (honesto)

| Fonte | Observável hoje, com dados reais | O que falta / limitação |
|---|---|---|
| `erros_cliente` | Erros de JS/React do app da loja, por empresa/loja/usuário/hora | Só erros de tela; só quando o usuário está logado (monitoramento.ts:96); gravidade/módulo/status/fingerprint não existem ainda (F2) |
| Estado do Postgres | Empresas, assinatura/trial, lojas, equipe, vendas 7d, última movimentação, **divergências abertas** (pdv.sql:242-262), saldos negativos de PDV offline (base :537-539), convites pendentes | Ninguém vê hoje além dos próprios membros (RLS); F1 expõe via funções admin |
| Falhas de RPC/API no cliente | Códigos/erros chegam no cliente (`traduzirErro`, cliente.ts:30-61; `exigir`, :84-87) | Hoje não são logados; endpoint/método/status HTTP não são capturados (F2) |
| Erros de auth (GoTrue) | Só a visão do cliente (mensagem traduzida) | **Logs server-side do GoTrue não estão no Postgres** — não dá para capturar hoje sem Log Drain (plano pago) ou Edge Function interposta; deixar honestamente de fora |
| Integrações (NFC-e/Asaas/NotaaS) | Nada — não existem em produção | Nascerão com o T-034 (Edge Functions server-side); os logs delas só existirão quando elas existirem |
| Desempenho/latência | Coarse: timestamps de eventos (`registrado_em` × `ocorrido_em`, base :357-358) | Sem APM; métricas de latência reais exigiriam instrumentação própria (fora de escopo v1) |
| Disponibilidade da plataforma | — | SPA estática: "o site abriu?" não é medível de dentro; precisaria de probe externo (ex.: Cloudflare monitor) — fora de escopo v1 |
| Processos em segundo plano | Não há processos server-side hoje; o que existe é o PDV sincronizando do aparelho (visível como vendas atrasadas/divergências) | Tarefas agendadas server-side (backup automático, cobrança) virão com T-034/fases futuras |

**Tradução para a promessa do dono (espec §3):** numa plataforma SPA + Supabase sem backend próprio, a observabilidade honesta em F1–F2 cobre: erros de frontend (estruturados), falhas de API vistas pelo cliente (endpoint/método/status), estado real do banco por loja (atividade, divergências, saldos negativos, assinaturas) e erros de permissão (tentativas negadas). **Não cobre em F1–F2, e é inalcançável sem os Edge Functions do T-034 ou infra adicional:** logs server-side de Auth, logs de integrações fiscais/financeiras (nascem com elas), latência de rede real, disponibilidade externa e processos agendados. O plano declara isso no painel (labels "aguardando T-034") em vez de fingir.

---

## 2. Decisões de arquitetura (justificadas)

### D1 — Identidade e autorização do Super Admin

**Recomendação: reativar `public.plataforma_admins` + função `app.sou_super_admin()` checada SERVER-SIDE dentro de funções SECURITY DEFINER em `public.*`, com auditoria. Nada de bypass no cliente; nenhum segredo `VITE_*`. Claim no JWT só como otimização futura.**

Opções avaliadas:

| Opção | Prós | Contras | Veredicto |
|---|---|---|---|
| (a) Claim/flag `is_super_admin` no JWT (via Access Token Hook do Supabase) | Policies e RPCs leem a claim sem consulta extra; padrão comum em SaaS | Exige Access Token Hook = **Edge Function** (infra que só chega com o T-034); claim fica **desatualizada** entre a revogação e o próximo refresh do token; mais difícil de testar no PGlite (`comoUsuario` teria de forjar claims); expõe no token quem é admin | Deferida — otimização depois que T-034 existir |
| (b) Tabela dedicada + funções SECURITY DEFINER com `search_path = ''` (escolhida) | A tabela **já existe** (base:45-49); revogação é **imediata** (a cada chamada); mesma gramática das funções `app.*` atuais (testável com `comoUsuario`); zero infra nova; guard centralizado numa função | Cada RPC admin repete o check (mitigado: um único guard `app.sou_super_admin()` chamado por todas); índice PK trivial | **Escolhida** |
| (c) Bypass no cliente (flag no localStorage / rota protegida só na UI) | Nenhum real | Falsificável pelo usuário; contradiz a regra do repo ("a tela só esconde botões", permissoes.ts:4) | Proibida |
| (d) Segredos `VITE_*` ou service role no bundle | — | Contraria regra explícita do T-034/DOCUMENTACAO (service role só em scripts locais, DOCUMENTACAO_ERP.md:26-28); segredo visível no bundle estático | Proibida |

**Como o lojista NUNCA vê logs admin (defesa em três camadas):**
1. Tabelas de plataforma (`admin_auditoria`, incidentes, inspeções, análises) ficam com **RLS ligada e nenhuma policy para `authenticated`** — leitura direta via PostgREST é negada por padrão (base:773-775 revoga tudo; RLS sem policy = zero linhas).
2. A única porta de leitura são funções SECURITY DEFINER em `public.*` que **verificam `app.sou_super_admin()`** e levantam `42501` caso contrário (mesmo padrão de `criar_convite`, base:653-654).
3. `erros_cliente` **não muda** para os lojistas: dono/gerente continuam vendo apenas os erros da própria empresa (monitoramento_piloto.sql:36-39) — e nem isso inclui auditoria/incidentes/inspeções, que são tabelas separadas sem `empresa_id` visível.

**Bootstrap do primeiro super admin (execução, não arquitetura):** sem UI de autopromoção. Duas vias equivalentes, documentadas no PILOTO.md: SQL direto no Supabase (`insert into public.plataforma_admins (usuario_id) select id from auth.users where email = '…'`) ou novo comando do `scripts/piloto.mjs` (`super <email>` / `dessuper <email>`, service role, seguindo o padrão do próprio script). Recuperar acesso perdido = repetir o comando com service role (raro; documentar).

### D2 — Onde a área admin vive

**Recomendação: rota `/admin` na MESMA SPA, lazy-loaded, montada fora do gate de empresa (App.tsx:31-50), mesma sessão de login.**

| Mesma app (rota `/admin`) | App/página separada |
|---|---|
| ✅ Um deploy, um CI, um domínio (custo zero; Pages publica `saas` direto) | ❌ Segundo pipeline/projeto/domínio (Pages extra) para gerir |
| ✅ Reusa design system, formatos, exportação Excel/PDF, `traduzirErro`, `buscarTudo` | ❌ Cópias dessas dependências ou duplicação de auth |
| ✅ Uma autenticação (mesma sessão Supabase; admin entra como qualquer usuário) | ✅ Superfície um pouco menor no bundle do lojista — **irrelevante**: o bundle é público e qualquer chunk pode ser baixado; a proteção real é server-side (D1) |
| ❌ Risco de regressão nas rotas existentes (mitigado: rotas admin em prefixo próprio + lazy chunk separado; e2e existente cobre regressão) | ✅ Isolamento de regressão |
| ✅ Auditoria e UX coesas (banner "modo inspeção" em qualquer tela) | ❌ "Entrar no contexto da loja" (D3) precisaria de SSO/transferência de sessão entre apps — complexidade real |

Detalhes de segurança honestos: a rota `/admin` não aparece no menu de quem não é admin; se um lojista abrir `/admin` por URL, a tela renderiza e **o servidor nega os dados (42501)** — a UI mostra "sem acesso" e um e2e prova isso. Code-splitting (`React.lazy`) separa o chunk admin do bundle principal, mas isso é higiene, **não** segurança.

### D3 — "Entrar no contexto da loja" sem furar o isolamento multi-tenant

**Recomendação: inspeção = LEITURA por funções admin auditaráveis, amarrada a uma SESSÃO DE INSPEÇÃO registrada com prazo; escrita administrativa = etapa separada, explícita, com motivo, registrada e reversível quando tecnicamente viável.**

Alternativas avaliadas e rejeitadas:

| Alternativa | Por que não |
|---|---|
| Inserir o admin temporariamente em `membros` (papel dono) da loja | Polui os dados do cliente (a equipe da loja veria um membro estranho — `membros_leitura` mostra a todos os membros, base:824-825); concederia acesso largo sem registro por consulta; quebra a invariante "membros é realidade do cliente" |
| Exceção na RLS via GUC (`set_config('app.inspecao', …)`) | PostgREST não expõe ao cliente um caminho para setar GUC por request **(não verificado no PostgREST real — a simulação local também não oferece isso; inferência)**; GUC por transação é frágil e invisível em auditoria |
| Copiar os dados da loja para o painel | Duplicação proibida pelo dono; risco de desatualização |

**Mecanismo escolhido (F4):**
1. `public.admin_inspecoes`: sessão com `admin_id`, `empresa_id`, `loja_id?`, `motivo` (obrigatório), `aberto_em`, `expira_em` (padrão 60 min), `encerrada_em`. Sem scheduler — a função confere `now() < expira_em` a cada uso, no mesmo espírito de `app.estado_empresa` (base:179-193, "não depende de rotina agendada").
2. Toda leitura (estoque, vendas, produtos, movimentações, equipe, divergências) é uma função `admin_ver_*(p_inspecao, …)` que: confere guard + sessão válida + alvo da sessão; **grava uma linha em `admin_auditoria` por consulta**; devolve dados somente-leitura.
3. UI com banner persistente "Modo inspeção — loja X — encerra em hh:mm" + botão "Encerrar agora"; nenhum botão de gravação nas telas de inspeção.
4. **Fidelidade das telas:** reutilizar as telas reais do lojista (Painel/Estoque/Vendas) exigiria sobrepor `EmpresaProvider`/`DadosProvider` com dados de admin — factível, mas médio-risco (componentes que gravam). A F4 v1 usa telas de leitura dedicadas reutilizando componentes de UI; a reprodução fiel "como o lojista vê" fica como opção de fase dependendo da resposta do dono (§7, D2).
5. **Escrita:** primeiro caso real é a gestão de assinatura — o que hoje `scripts/piloto.mjs` faz por service role direto na tabela (piloto.mjs:102-109) vira RPC `admin_ajustar_assinatura` com motivo, antes/depois em auditoria e reversibilidade (reajustar). Regra geral herdada do repo: o histórico é imutável (base:237-252) — correções de dados operacionais continuam sendo **lançamentos novos** (CORRECAO/AJUSTE), nunca UPDATE/DELETE.

### D4 — Modelo de auditoria

**Recomendação: uma única tabela `public.admin_auditoria` para tudo (consultas, ações, ações do agente), escrita SOMENTE pelas funções SECURITY DEFINER, leitura SOMENTE por função admin.**

Esquema (F1; evolução por fase):

```sql
create table public.admin_auditoria (
  id           bigint generated always as identity primary key,
  admin_id     uuid not null,                    -- auth.uid() da função chamadora
  acao         text not null,                    -- 'consulta' | 'acao' | 'agente_*'
  alvo         text,                             -- ex.: 'empresa', 'loja', 'inspecao', 'incidente', 'log'
  empresa_id   uuid,                             -- opcional (logs de plataforma podem ser null)
  loja_id      uuid,
  detalhes     jsonb not null default '{}'::jsonb,  -- filtros usados, antes/depois de ação
  correlacao   uuid,                             -- gerado no cliente por sessão de investigação
  criado_em    timestamptz not null default now()
);
```

- **Correlação honesta:** o request id do PostgREST/Supabase **não chega ao cliente**; usa-se um UUID gerado no cliente (um por "sessão de investigação") para agrupar os acessos de uma mesma navegação admin. Não é o request id do servidor — documentado como tal.
- RLS: `enable row level security` **sem policy para `authenticated`**; `revoke all` de anon/authenticated (:773-775 já faz); leitura pela função `admin_auditoria_listar(...)` (guard + filtro por admin/período); INSERT direto não é concedido a ninguém (só as SECURITY DEFINER escrevem — elas rodam como donas).
- Por que uma tabela única: uma fonte de verdade para retenção/LGPD/expurgo, e um só lugar para o dono responder "quem viu o quê e quando". Sem espelhos por tabela (evita duplicação).
- Retenção: 365 dias, limpeza manual documentada no runbook (mesmo padrão dos 90 dias de `erros_cliente`, PILOTO.md:136-140); `pg_cron` opcional depois (o repo evita rotinas agendadas até agora).
- Metarregas: acrescentar `admin_auditoria` (e as demais tabelas de plataforma) à lista `sistema` de `testar-sql.mjs:75`; manter RLS on (o metateste :72-73 exige).

---

## 3. Fases (pequenas, entregáveis, testáveis)

> **Nomes de migration:** padrão do repo `AAAAMMDDHHMMSS_nome.sql`. Os timestamps abaixo são **propostas**; na implementação devem ser os próximos livres maiores que a última migration aplicada (o T-038 ainda vai aplicar `20261115080000`/`20261115090000`). Gates de cada fase: `npm run lint`, `npm test`, `npm run test:sql`, `npm run build`, `npm run test:e2e:ci` — verdes antes de subir.

### F1 — Base: super admin server-side + auditoria + visão geral com dados reais

**Objetivo:** quem está em `plataforma_admins` se autentica pelo login normal e vê TODAS as empresas com status real, atividade e erros; cada acesso sai em `admin_auditoria`. Lojista não vê nada disso. (Não há tela sem dados reais — exigência do dono, estado.json criterios.)

**Migration `20261116120000_super_admin_base.sql` (timestamp a confirmar):**
1. `app.sou_super_admin()` — `stable security definer set search_path = ''`, `exists (select 1 from public.plataforma_admins where usuario_id = (select auth.uid()))`.
2. `public.admin_auditoria` (D4) + índice `(admin_id, criado_em desc)` e `(criado_em desc)`.
3. `public.admin_sou_admin()` — boolean barato para o menu (guard + auditoria opcional off).
4. `public.admin_visao_geral()` — SECURITY DEFINER; guard; auditoria (`acao='consulta', alvo='visao_geral'`); retorna por empresa: `nome, segmento, criado_em, estado (app.estado_empresa), plano_id, status, trial_ate, pago_ate, lojas_ativas, usuarios_ativos (membros ativos), vendas_7d (count), faturamento_7d (sum de vendas.concluida — conferir coluna total/subtotal na implementação), ultima_venda_em, erros_7d (erros_cliente), divergencias_abertas, ultima_movimentacao_em`. Uma única RPC (evita N consultas).
5. `public.admin_ver_empresa(p_empresa uuid)` — detalhe da empresa: lojas, equipe (membros × perfis), convites pendentes, últimos 20 erros, últimas 20 movimentações, vendas dos últimos 7 dias por loja; auditoria por chamada.
6. `public.admin_auditoria_listar(p_admin_id default null, p_de date default …, p_ate date default …, p_limite int default 200)` — guard.
7. Grants: `revoke execute on function … from public, anon; grant execute … to authenticated` (padrão nfce_fila:95-98). Nenhum grant em `admin_auditoria` (RLS sem policy já bloqueia).
8. `admin_auditoria` entra na lista `sistema` de `testar-sql.mjs:75`.

**Arquivos:**
- Novos: `src/lib/admin/cliente.ts` (wrapper com `correlacao` UUID + tradução de 42501), `src/lib/admin/tipos.ts`, `src/pages/admin/AdminLayout.tsx` (identidade admin, sair, aviso "área da plataforma"), `src/pages/admin/AdminPainel.tsx` (visão geral), `src/pages/admin/AdminEmpresa.tsx` (detalhe), `src/pages/admin/AdminAuditoria.tsx`.
- Mexidos: `src/App.tsx` (rotas lazy `/admin`, `/admin/empresas/:id`, `/admin/auditoria` ANTES do gate de empresa — ver §1.2), `src/components/Layout.tsx` (apenas link discreto "Painel da plataforma" se `admin_sou_admin()`), `scripts/piloto.mjs` (comandos `super <email>`/`dessuper <email>`), `scripts/testar-sql.mjs` (lista `sistema`), `PILOTO.md` (seção "Painel da plataforma": como promover admin, o que cada tela mostra), `DOCUMENTACAO_ERP.md`, `README.md` (uma linha na tabela de recursos).
- **Não mexer em:** `src/lib/dados/lgpd.ts`, tabelas de negócio, RLS existente.

**Testes:**
- Unit (Vitest): wrapper do cliente (correlação estável por sessão, 42501 → "sem acesso"); formatação da visão geral a partir de payload de exemplo.
- SQL (PGlite, prova positiva E negativa): super admin promovido por SQL vê todas as empresas em `admin_visao_geral` e lê erros de empresa alheia; **lojista chamando `admin_visao_geral` → 42501**; **lojista com `select` direto em `admin_auditoria` → 0 linhas/negado**; cada consulta do admin grava linha em `admin_auditoria`; `anon` não executa nenhuma função nova (metateste :89-95); RLS on (metateste :72-73).
- E2E (`e2e/app/admin-base.spec.ts`): negativo — lojista abre `/admin` e vê "sem acesso" com zero dados; positivo — **depende de fixture**: promover admin no banco local antes do spec (script de apoio em `scripts/` sobre o PGlite do servidor local — *inferência sobre viabilidade do hook de e2e; se não for viável, o positivo fica coberto por test:sql + smoke manual documentado, e o e2e cobre o negativo*). Fluxo: login admin → visão geral mostra a empresa de exemplo com contagens reais → auditoria lista a própria consulta.
- **Smoke manual (documentado no PILOTO.md):** promover o e-mail do dono em produção e conferir a visão geral contra `piloto.mjs listar` (mesmos dados, agora com tela).

**Critérios de aceite (verificáveis pelo QA):**
1. Com o e-mail do dono promovido, o login normal abre `/admin` e a visão geral mostra TODAS as empresas com estado da assinatura idêntico ao que `npm run piloto -- listar` imprime (dado real, não mock).
2. Cada tela admin gera exatamente uma linha em `admin_auditoria` por consulta (visível na própria tela de auditoria).
3. Um usuário comum (dono de empresa de teste) em `/admin` vê "sem acesso"; o SQL prova `42501` nas funções e zero linhas em `admin_auditoria`.
4. `npm run test:sql`, `npm test`, `npm run lint`, `build` e `test:e2e:ci` verdes.
5. Os comandos do `piloto.mjs` antigos continuam funcionando (sem regressão de operação).

**Fora do escopo de F1:** filtros avançados de log, incidentes, inspeção de loja, IA, alertas, gestão de assinatura pela tela (continua via CLI).

### F2 — Observabilidade: logs estruturados, agrupamento e filtros

**Objetivo:** evoluir `erros_cliente` (SEM criar tabela paralela — reuso) para log estruturado JSON com tenant, usuário, módulo/funcionalidade, gravidade, correlação, causa provável, sugestão, status e fingerprint; tela com filtros, agrupamento de semelhantes e histórico; captura no cliente ampliada. Senhas/tokens/dados pessoais continuam fora (§4).

**Migration `20261117120000_observabilidade_estruturada.sql`:**
1. `ALTER TABLE erros_cliente` adiciona: `modulo text`, `gravidade text not null default 'erro' check (gravidade in ('info','aviso','erro','critico'))`, `contexto jsonb not null default '{}'::jsonb` (endpoint/método/status http, tela, online), `fingerprint text`, `causa_provavel text`, `sugestao text`, `status text not null default 'novo' check (status in ('novo','em_analise','resolvido','recorrente'))`, `status_em timestamptz`, `status_por uuid`.
2. `app.erro_fingerprint(p_mensagem text)` — normalização server-side (lower, remove números/UUIDs/hex e espaços múltiplos, `sha256` truncado a 16 hex); trigger `before insert` preenche o fingerprint; índice `(fingerprint, criado_em desc)`; backfill único `update … set fingerprint = app.erro_fingerprint(mensagem)`.
3. `public.admin_log_listar(p_empresa, p_usuario, p_modulo, p_fingerprint, p_gravidade, p_status, p_de, p_ate, p_limite)` — SECURITY DEFINER + guard + auditoria.
4. `public.admin_log_grupos(...)` — agrupa por fingerprint: contagem, primeira/última ocorrência, mensagem exemplar, nº de lojas e usuários distintos.
5. `public.admin_log_status(p_erro bigint, p_status text, p_causa text default null, p_sugestao text default null)` — guard + auditoria (antes/depois). **Lojista continua somente-leitura** (policy de select atual intocada).

**Cliente (`src/lib/monitoramento.ts` + `src/lib/dados/cliente.ts`):**
- `registrarErro` ganha parâmetros `contexto?: { modulo?, gravidade?, endpoint?, metodo?, statusHttp?, extra? }`; grava em `contexto` jsonb. `modulo` = rota/página atual (inferido de `window.location.pathname` — não exige mexer em todas as telas; **inferência: aceitável v1**, refinar por tela depois).
- Ponto central de falhas de API: `exigir()`/`traduzirErro()` (cliente.ts:84-87, 30-61) passam a reportar `endpoint`/`code`/`message` como evento `gravidade='aviso'` quando a chamada falha — **inferência a validar na implementação** (confere se `exigir` cobre os fluxos principais; os que chamam `.then(, () => undefined)` diretamente escapam — monitoramento.ts:108).
- Falhas de rede (`Failed to fetch` etc., hoje na lista `IGNORAR`, monitoramento.ts:19-25): saem da lista e passam a ser logados como `gravidade='aviso'` com dedupe maior (janela de minutos) — evita tempestade sem cegar a observabilidade.
- Invariantes mantidos: silencioso, nunca lança (:76-112); `urlSegura` mantida (token do convite nunca no log, :66-74); nada de payload de formulário; stack truncada 8000.

**Telas:** `src/pages/admin/AdminObservabilidade.tsx` (`/admin/logs`): filtros (loja, usuário, funcionalidade/módulo, tipo/fingerprint, gravidade, status, período), lista agrupada por fingerprint com "N ocorrências entre … e …, afetando X lojas e Y usuários", drill-down para ocorrências, ações de status (novo → em análise → resolvido/recorrente) com causa/sugestão. Route em App.tsx; reuso de `Paginacao`/`ui.tsx`.

**Testes:**
- Unit: montagem do payload de contexto (truncamentos, campos proibidos ausentes); mapa de gravidade; filtro de grupos no cliente é derivado do SQL (só wrapper — sem lógica duplicada).
- SQL (positiva E negativa): mesma mensagem duplicada → mesmo fingerprint; mensagens com números diferentes → mesmo fingerprint (normalização); mensagens distintas → fingerprints distintos; backfill cobre linhas antigas; **dono/gerente tentando alterar `status` direto → negado** (só via `admin_log_status`, que audita); lojista continua vendo os erros da PRÓPRIA empresa com as colunas novas; erros de empresa alheia continuam invisíveis ao lojista; `anon` não executa as novas funções.
- E2E (`admin-observabilidade.spec.ts`): provocar erro no app da loja (ex.: interceptar/forçar rejection), abrir `/admin/logs` como admin, filtrar por loja e por módulo, ver o grupo com 2 ocorrências, marcar "em análise" e conferir que a mudança aparece no histórico; lojista não vê a tela (negativo).
- Não quebrar e2e "sem erros no console" existente (monitoramento é silencioso — é o caso).

**Critérios de aceite (QA):**
1. Erro real provocado numa loja de teste aparece em `/admin/logs` com loja, usuário, módulo (rota), gravidade, horário, fingerprint e stack — todos preenchidos com dados reais.
2. Dois erros iguais em lojas diferentes agrupam no mesmo grupo com contagem 2 e 2 lojas; status muda para "em análise" e depois "resolvido" com causa/sugestão registrados e auditados.
3. Filtros (período/loja/gravidade/módulo/status) reduzem a lista de forma verificável.
4. Lojista: continua vendo só os erros da própria empresa; não consegue mudar status (SQL prova negativa).
5. Nenhum log contém senha, token ou CPF (teste SQL varre colunas de log por padrões proibidos — ver §4).

**Fora do escopo de F2:** logs server-side (Edge Functions — chegam com T-034), alertas (F3/F5), APM/latência real, disponibilidade externa.

### F3 — Incidentes ligados aos grupos de erro + alerta de críticos

**Migration `20261118120000_incidentes.sql`:**
1. `public.admin_incidentes`: `id uuid pk`, `empresa_id uuid null` (null = problema de plataforma), `loja_id uuid null`, `titulo`, `descricao`, `fingerprint text` (grupo principal), `grupos_relacionados text[] default '{}'`, `prioridade check ('baixa','media','alta','critica')`, `situacao check ('aberto','em_analise','resolvido','cancelado')`, `responsavel uuid`, `usuarios_impactados int`, `primeira_em timestamptz`, `ultima_em timestamptz`, `diagnostico text`, `solucao_recomendada text`, `criado_em/atualizado_em/criado_por`.
2. `public.admin_incidente_acoes`: `id`, `incidente_id fk`, `acao text`, `detalhe text`, `autor uuid`, `criado_em` — histórico imutável na prática (sem grants diretos; escrita só via função).
3. RPCs (todas guard + auditoria): `admin_incidente_criar_de_grupo(p_fingerprint, p_titulo, p_prioridade, ...)` — preenche primeira/última ocorrência, usuários impactados (distinct `usuario_id` no grupo) e lojas a partir de `erros_cliente` **(dado real)**; `admin_incidente_atualizar(...)`, `admin_incidente_recontar(p_id)` (recalcula estatísticas do grupo), `admin_incidente_acao(p_id, p_acao, p_detalhe)`, `admin_incidente_listar(...)`, `admin_incidente_ver(p_id)`.
4. Ambas as tabelas entram na lista `sistema` do `testar-sql.mjs:75`.

**Telas:** `src/pages/admin/AdminIncidentes.tsx` (`/admin/incidentes`): lista com prioridade/situação, card "críticos abertos" no painel (contagem real), detalhe do incidente com estatísticas do grupo, histórico de ações e campos de diagnóstico/solução/responsável. Botão "criar incidente" dentro de cada grupo de `/admin/logs`.

**Alerta de críticos (honesto):** em F3 o "alerta" é o card de críticos no painel + destaque na lista — **não há e-mail/WhatsApp**, porque não existe infraestrutura server-side de envio hoje (nenhum Worker/Edge Function; devops-estado.md §3.6). O alerta externo real fica para F5 (Edge Function + SMTP já previsto no T-034) — declarar isso no painel.

**Testes:** SQL — criar incidente de um grupo popula estatísticas corretas (positiva); lojista sem acesso a qualquer tabela de incidente (negativa); ações imutáveis (sem grant de update/delete); e2e — criar incidente de um grupo, mudar situação, ver histórico, card de críticos refletindo a contagem.

**Critérios de aceite (QA):** incidente criado a partir de grupo real mostra primeira/última ocorrência e nº de usuários batendo com a contagem do log; situação/prioridade/responsável editáveis com histórico registrado; críticos abertos aparecem no painel; SQL prova negativa de acesso do lojista; gates verdes.

**Fora do escopo de F3:** alerta por e-mail/WhatsApp; vínculo com inspeção (chega em F4); IA (F5).

### F4 — Contexto da loja: inspeção de leitura auditável (+ primeira escrita registrada)

**Migration `20261119120000_inspecao_loja.sql`:**
1. `public.admin_inspecoes`: `id uuid pk`, `admin_id`, `empresa_id`, `loja_id null` (null = toda a empresa), `motivo text check (length >= 10)`, `aberto_em`, `expira_em not null default now() + interval '60 minutes'`, `encerrada_em`, `encerrado_por`. Lista `sistema` do metateste.
2. RPCs (todas SECURITY DEFINER, guard + auditoria): `admin_inspecao_abrir(p_empresa, p_loja, p_motivo)`; `admin_inspecao_encerrar(p_id)`; e as leituras `admin_ver_estoque(p_inspecao)`, `admin_ver_vendas(p_inspecao, p_de, p_ate)`, `admin_ver_produtos(p_inspecao)`, `admin_ver_movimentacoes(p_inspecao, p_de, p_ate)`, `admin_ver_equipe(p_inspecao)`, `admin_ver_divergencias(p_inspecao)`, `admin_ver_assinatura(p_inspecao)` — cada uma confere sessão válida (guard + `auth.uid() = admin_id` + `now() < expira_em` + `encerrada_em is null` + alvo correspondente) e grava `admin_auditoria (acao='consulta', detalhes={inspecao_id, recurso, filtros})`.
3. **Primeira escrita administrativa** (sobe do CLI para o painel, sem substituir o CLI): `admin_ajustar_assinatura(p_empresa, p_status, p_dias, p_motivo)` — espelha `cortesia/trial/ativa` do `piloto.mjs:89-109`, com motivo obrigatório, antes/depois em `admin_auditoria (acao='acao')` e reversibilidade (o próprio comando reverte). `scripts/piloto.mjs` continua como fallback de emergência (documentado no PILOTO.md).

**Telas:** `/admin/empresas/:id` ganha "Inspecionar" (abre sessão com motivo); telas somente-leitura reutilizando componentes de UI (`ui.tsx`, `formato.ts`, tabelas simples); banner fixo com loja + prazo + "Encerrar"; bloqueio total de gravação na UI de inspeção.

**Testes:** SQL — sessão expirada → todas as leituras falham (negativa); leitura de recurso fora do alvo da sessão → falha; cada leitura grava auditoria; encerrar bloqueia novas leituras; `admin_ajustar_assinatura` audita antes/depois e é reversível; lojista não consegue abrir inspeção (42501); e2e — admin inspeciona a loja de exemplo, vê estoque/vendas reais, banner visível, encerra e perde acesso às leituras.

**Critérios de aceite (QA):** cada tela de inspeção reflete dados reais da loja (conferir contra o app da loja em outro navegador); cada navegação de leitura gera linha em `admin_auditoria` com a sessão; sessão vencida corta o acesso no meio (simular adiando o relógio no teste SQL); ajuste de assinatura pela tela tem o mesmo efeito do comando CLI e fica auditado.

**Fora do escopo de F4:** reprodução fiel das telas do lojista (depende da resposta do dono, §7-D2); escrita em dados operacionais da loja (produtos/movimentações) — se o dono pedir, vira fase própria com regras de reversibilidade caso a caso (a regra do repo já proíbe reescrever histórico).

### F5 — Agente de IA: primeiro diagnóstico assistido, depois agente sob demanda

**Dependência dura:** a chave da LLM é segredo server-side. **Nada de `VITE_*`.** Caminho natural: Edge Function (Supabase) — que ainda não existe no repo (devops-estado.md §3.6). Ordem preferida: implementar F5 **depois de o T-034 destravar o padrão de Edge Functions**; se o dono quiser F5 antes, cria-se UMA Edge Function mínima dedicada (`admin-ia`) com o segredo — custo de configuração pequeno, precede o padrão do T-034 (decisão do dono, §7-D6).

**V1 — Diagnóstico assistido (recomendado para começar):**
1. Migration `20261120120000_agente_ia.sql`: `public.admin_incidente_analises` (`id`, `incidente_id fk`, `pacote jsonb`, `resultado text`, `modelo text`, `tokens_entrada/saida int null`, `criado_em`) — histórico de análises (espec §5: "manter um histórico das análises"); lista `sistema` do metateste.
2. RPC server-side `admin_incidente_gerar_pacote(p_incidente)` (guard + auditoria): monta o **pacote sanitizado** — resumo do grupo (contagem, lojas, usuários, primeira/última, amostra de mensagens e stacks truncadas, contexto sem dados pessoais) — e chama a Edge Function com o pacote; o resultado volta e é salvo em `admin_incidente_analises` + copiado para `diagnostico`/`solucao_recomendada` do incidente (com `acao='agente_analise'` em auditoria).
3. Botão "Analisar com IA" no incidente/grupo. A saída em linguagem clara (espec §5: "explicar em linguagem clara") é o texto do modelo, ancorado nos dados do pacote.
4. **Sanitizer server-side com teste SQL de prova negativa:** o pacote nunca inclui payload de formulário, e-mail em texto livre, CPF, senha, token; stacks truncadas. (Teste: gerar pacote com erro contendo padrões proibidos → campos ausentes no `pacote`.)
5. **Custo controlado:** limite diário de análises por admin (contador na própria tabela; a função recusa com mensagem clara acima de N — N proposto: 50/dia, ajustável pelo dono).
6. **Modo de dev sem chave:** a Edge Function devolve resposta fixa "IA não configurada (modo desenvolvimento)" quando o segredo não existe — permite e2e/gates verdes sem chave real; em produção configura-se o segredo.

**V2 — Agente com ferramentas de leitura (sob demanda, não contínuo):**
- Botão "Investigar" num incidente: o agente pode chamar **somente as funções de leitura admin já auditadas** (`admin_log_grupos`, `admin_log_listar`, `admin_incidente_*`, `admin_visao_geral`) em loop curto (limite de passos, ex. 10), com `acao='agente_<ferramenta>'` em cada chamada de auditoria (rastreabilidade completa da espec §7: "registro das ações executadas pelo agente de IA").
- **Camadas de autonomia — exatamente como a espec manda:**
  1. **Leitura e diagnóstico:** autônomo (funções de leitura).
  2. **Consultas/testes seguros:** dentro do ambiente controlado (leitura + contagens; nada de estado mutável).
  3. **Correções de baixo risco:** só com regra explícita pré-aprovada + validações + reversão — em F5 **não existe ainda nenhum caso**; quando houver, cada um entra como entrada numa whitelist assinada pelo dono (primeiro candidato natural: reabrir/extender trial, que já é reversível via `admin_ajustar_assinatura`).
  4. **Dados, configurações críticas, financeiro:** o agente só **propõe**; execução exige aprovação humana explícita na UI (botão "Aprovar" grava `acao='aprovacao'` e libera a execução por função registrada).
  5. **Código-fonte:** o agente descreve o problema e PROPÕE a alteração (texto de patch/issue); **nunca comita nem mexe em produção**.
- Guarda geral: o agente roda server-side com a mesma identidade do admin que o invocou (guard `sou_super_admin` em toda ferramenta) — ele não tem credenciais próprias nem service role própria.

**Por que o "monitoramento contínuo autônomo" fica para fase posterior (francamente):**
1. **Não há processo residente:** Edge Functions são sob-demanda; monitorar continuamente exigiria cron/worker dedicado (pg_cron/worker — nenhum dos dois existe no repo hoje; o projeto até evita rotinas agendadas por design, base:179-180).
2. **Baseline insuficiente:** com o piloto, o volume de erros é pequeno; agente contínuo sem histórico suficiente vira gerador de falso positivo — pior que a ausência dele (minaria a confiança do dono).
3. **Custo LLM contínuo** sem valor comprovado ainda; análise sob demanda (botão) entrega o mesmo valor com custo sob controle.
4. **Infra do T-034** (webhooks, retries, segredos) precisa estar madura para sustentar processos periódicos e alertas.
5. Caminho futuro documentado: `pg_cron` no Supabase + fila de eventos + taxa de novas ocorrências por fingerprint como gatilho barato (sem LLM) para "algo estranho", e o agente só então aprofunda sob demanda.

**Testes:** SQL — pacote sanitizado (positiva e negativa), limite diário recusa além de N, cada chamada de agente audita, guard de todas as ferramentas; unit — montagem/parse do pacote; e2e — botão "Analisar" com modo sem-chave devolve resposta fixa registrada no incidente e no histórico de análises.

**Critérios de aceite (QA):** análise do incidente salva com resultado em linguagem clara + campo de modelo; histórico de análises completo; nenhuma execução de escrita sem aprovação registrada; modo sem-chave mantém e2e verde; auditoria mostra `agente_*` para cada passo.

**Fora do escopo de F5:** monitoramento contínuo agendado; correções autônomas de baixo risco (aguardam whitelist aprovada pelo dono); alterações de código automatizadas.

---

## 4. Segurança e LGPD

**Nunca vai para log (regra dura, com teste SQL que varre os logs):**
- Senhas e qualquer payload de formulário (o campo "senha do aparelho" da OS do T-038 também é proibido em log).
- Tokens e hashes: token de convite nunca sai (já garantido por `urlSegura`, monitoramento.ts:66-74 — manter o teste); sem segredos de integração.
- Dados pessoais em texto livre: CPF (existe `vendas.cliente_cpf`, 20261023000000_nfce_cpf.sql:6 — **não logar**), e-mail do usuário (logs guardam `usuario_id`; as telas admin podem mostrar nome porque o super admin é o operador do controlador — decisão a confirmar no jurídico, §7-D5), IMEI/série do aparelho (T-035/T-038) tratado como dado pessoal.
- Stack: truncada (8000) e sem query-string.

**Retenção (documentada no runbook; limpeza manual, como hoje):**
- `erros_cliente`: 90 dias (mantém PILOTO.md:136-140).
- `admin_auditoria`: 365 dias.
- `admin_inspecoes`: 180 dias.
- Incidentes/análises de IA: mantidos enquanto úteis; expurgo de conteúdo pessoal segue avaliação legal (LGPD §7 da espec).

**Isolamento e visibilidade:**
- Tabelas de plataforma: RLS on, zero policy para `authenticated`, zero grants — só funções admin (D1).
- Lojista: ganhos ZERO e perdas ZERO — `erros_cliente` segue exatamente a policy atual (monitoramento_piloto.sql:29-39); nenhuma tela nova aparece para ele.
- Super admin: revogação imediata (checagem por chamada); `dessuper` remove na hora.
- Service role: continua exclusiva de scripts locais (DOCUMENTACAO_ERP.md:26-28); as Edge Functions do F5/T-034 usam segredo server-side, nunca `VITE_*`.

**LGPD da loja intacta:**
- `src/lib/dados/lgpd.ts` (exportação do dono, lgpd.ts:63) **não é tocada**; a inspeção admin é leitura e não entra na exportação nem altera dados.
- O expurgo de empresa cancelada continua service-role only (`app.expurgar_empresa` revogada, base:786).
- `public/privacidade.html` e `public/termos.html`: revisar com jurídico uma menção a "acesso de suporte à plataforma, registrado em auditoria" quando a F1 for a produção (§7-D5).

---

## 5. Riscos e dependências

| # | Risco/dependência | Tratamento |
|---|---|---|
| 1 | **T-038 em execução**: `App.tsx`, `Layout.tsx`, `Painel.tsx`, `Relatorios.tsx`, `tipos.ts` em edição (estado.json plano_atual) — conflito de merge é certo se T-039 começar antes | Implementação do T-039 **só depois do T-038 fechar** (gates reexecutados); F1 toca `App.tsx`/`Layout.tsx` minimamente e em região distinta das rotas do T-038 |
| 2 | **T-034 (NFC-e/Asaas/NotaaS)**: traz o padrão de Edge Functions + segredos server-side; F5 e alertas dependem disso; também é a primeira fonte de logs server-side reais (fila NFC-e já existe em `vendas.nfce_*`, 20261022000000_nfce.sql:15-24) | Sequenciar F5 após T-034; F1–F4 independem |
| 3 | **T-035 (série/IMEI)**: novos dados pessoais | Regras de log do §4 se aplicam desde o primeiro dia |
| 4 | **T-028 (piloto/restauração)**: observabilidade depende de produção saudável; logs ficam no mesmo Supabase | Log pequeno; backup do Supabase cobre; restauração a ensaiar segue no T-028 |
| 5 | **Metarregras do CI** (RLS on, lista `sistema`, `anon` sem acesso, policies via `(select …)`) | Cada fase atualiza `testar-sql.mjs` deliberadamente; o CI falha se algo escapar — proteção desejada |
| 6 | **e2e flake no runner Windows** (devops-estado.md §3.7) | Specs admin leves; retries já configurados; não empilhar asserts frágeis de horário |
| 7 | **Sobre-engenharia / tela sem função**: dono exige dados reais e nada isolado | Fases pequenas, cada uma sobre tabelas reais; sem tabela paralela de log (reuso de `erros_cliente`) |
| 8 | **Perda de acesso do único super admin** | Recuperação documentada via `piloto.mjs super <email>` (service role) |
| 9 | **Chunks admin no bundle público** | Proteção é server-side (D1); documentar honestamente; sem segredo no bundle |
| 10 | **Orçamento de IA (F5)** | Limite diário de análises + modo sem-chave; custo por análise pequeno (pacote compacto) |

---

## 6. O que fica FORA de escopo (resumo por fase)

- **F1:** filtros avançados de log; incidentes; inspeção; IA; alertas; gestão de assinatura pela tela; criar/remover empresas pelo painel (o expurgo segue service-role); migração de usuários entre empresas.
- **F2:** logs server-side (Edge Functions — T-034); alertas; APM/latência real; probe de disponibilidade; expurgo automático.
- **F3:** alerta por e-mail/WhatsApp; SLA/escalada automática; vínculo incidente ↔ inspeção.
- **F4:** reprodução fiel das telas do lojista; escrita em dados operacionais da loja; desativar usuário/loja pelo painel.
- **F5:** monitoramento contínuo agendado; ações autônomas de baixo risco (aguardam whitelist aprovada); alterações de código automatizadas; multi-provedor de IA.

---

## 7. Dúvidas que só o dono pode responder

1. **Prioridade na fila:** depois do T-038, T-039 vem antes de T-034 (fiscal), T-035 (série/IMEI) e T-028 (piloto em loja real)? O plano sugere F1–F2 cedo (dado real barato), F3–F4 em seguida e F5 após o T-034.
2. **F4 — leitura ou fidelidade total?** Inspeção somente-leitura com telas dedicadas basta, ou o dono precisa ver as TELAS como o lojista vê (reprodução fiel — custo médio, risco maior)? E precisa de ESCRITA além da assinatura na F4 (quais intervenções)?
3. **Identidade do super admin:** a conta pessoal do dono (mesmo e-mail dele) vira super admin via `piloto.mjs super`, ou prefere uma conta dedicada separada? Quantos admins existirão (só ele? mais alguém)?
4. **Onde o super admin autentica:** confirma o modelo recomendado (mesmo login da app, área `/admin` liberada), ou quer login separado/URL própria?
5. **LGPD/jurídico:** o texto de `privacidade.html` pode citar "acesso de suporte registrado em auditoria"? Retenção proposta (erros 90 d, auditoria 365 d, inspeções 180 d) aprovada? O admin pode ver nome/e-mail dos usuários nas telas de suporte?
6. **F5 — IA:** provedor/orçamento da LLM aprovado (chave como segredo server-side)? E o dono aceita que a F5 crie a primeira Edge Function, ou prefere esperar o padrão do T-034?
7. **Alertas:** canal preferido (e-mail? WhatsApp?) e destinatários (só o dono?) — para quando F3/F5 liberarem envio server-side.
8. **CLI × painel:** a gestão de assinatura migra para o painel (F4) com o `piloto.mjs` ficando como fallback de emergência — aprovado?

---

## 8. Convenções de implementação (para o Programador)

- Migrations: nomes `AAAAMMDDHHMMSS_*.sql`, maiores que a última aplicada; aplicar em produção após o push (padrão do repo).
- Toda função `public.*` nova: `revoke execute from public, anon; grant to authenticated`; corpo com `if not app.sou_super_admin() then raise 'Sem permissão.' using errcode = '42501'; end if;` + linha em `admin_auditoria`.
- Toda função SECURITY DEFINER: `set search_path = ''` (padrão do repo).
- Tabelas de plataforma novas: acrescentar à lista `sistema` de `scripts/testar-sql.mjs:75` e manter RLS on.
- Nada em `erros_cliente` muda o comportamento do lojista (policies de monitoramento_piloto.sql:29-39 intocadas).
- Gates por fase: `npm run lint && npm test && npm run test:sql && npm run build && npm run test:e2e:ci`, reexecutados pelo QA; registrar execução no laudo (o histórico fica a cargo do coordenador).

---

## 9. Decisões do dono (15/11/2026)

Respostas do dono ao §7 ("ok com tudo" nos padrões sugeridos + especificações). Registadas também no `estado.json` (T-039).

1. **Fila confirmada:** T-038 → QA → T-039 (implementação) → T-028 (piloto); demais pela prioridade do backlog; T-040 (Resend/SMTP) por último. Implementação do T-039 só começa após o T-038 fechar com QA aprovado.
2. **F4:** inspeção **somente leitura** com telas dedicadas; escrita administrativa na F4 = **só gestão de assinatura** (trial/cortesia/ativa), com motivo e reversibilidade. Reprodução fiel das telas do lojista fica FORA da F4 (fase futura só se o dono pedir).
3. **Super admin = conta pessoal do dono** (e-mail registrado pelo coordenador FORA do repo público — pedir ao Teste na implementação da F1). Promover via `piloto.mjs super <email>` (ou SQL equivalente) no momento da F1. Somente o dono por enquanto.
4. **Autenticação:** mesmo login da app; área `/admin` liberada para quem está em `public.plataforma_admins`.
5. **LGPD aprovado:** `privacidade.html` ganha a menção "acesso de suporte registrado em auditoria" quando a F1 for à produção; retenção — erros 90 d, auditoria 365 d, inspeções 180 d; o admin vê nome/e-mail dos usuários nas telas de suporte.
6. **F5 (IA):** Edge Function mínima própria (`admin-ia`), independente do padrão do T-034; limite diário ~50 análises por admin; modo sem-chave mantém os gates verdes.
7. **Alertas:** e-mail para o dono (canal só faz sentido quando existir envio server-side — F3/F5).
8. **Assinatura:** migra para o painel na F4; `scripts/piloto.mjs` permanece como fallback de emergência.
