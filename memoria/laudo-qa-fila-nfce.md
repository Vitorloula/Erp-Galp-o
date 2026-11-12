# Laudo de QA — BF-N4 (Fila operacional da NFC-e em Vendas)

**Data:** 11/11/2026 (1ª rodada) · **Revalidação:** 11/11/2026 (2ª rodada) · **Revalidação final:** 11/11/2026 (3ª rodada)
**Item:** BF-N4 (`memoria/plano-fila-nfce.md`, `memoria/spec-fila-nfce.md`)
**Verificado por:** QA (validação independente — os gates foram rodados por mim, não aceitos como alegação)

**Veredito final: APROVADO — sem defeitos abertos.**
D-1 a D-4 estão corrigidos e confirmados por execução própria. Os gates estão verdes e
confiram com as alegações do Programador. As observações D-5/D-6 (fonte da chave de acesso da
NFC-e) seguem **fora do escopo deste ciclo**, por acordo — devem ser resolvidas junto com o
emissor real (T-034).

**Nenhum código de produção foi alterado.** Sem commit.

---

## 0. Resumo da revalidação final (3ª rodada)

| Defeito | Situação | Como confirmei |
|---|---|---|
| **D-1** erro de ação dentro do modal engolido | **CORRIGIDO** (2ª rodada) | reconfirmado em 3ª rodada: com a rede cortada, o modal de resolução mostra "Sem conexão com o servidor. Verifique a internet e tente novamente." e sobe o toast "Falha ao marcar a venda 01-000001 como resolvida."; o aviso de emissor desligado aparece dentro do modal e está visível de fato (`elementFromPoint` devolve o próprio aviso, não o fundo do modal) |
| **D-2** `caixa` resolvia a fila direto na API | **CORRIGIDO** (2ª rodada) | reconfirmado em 3ª rodada: `UPDATE` direto → "permission denied for table vendas"; `marcar_nfce_resolvida` como `caixa` → "Somente dono ou gerente resolve a fila da NFC-e."; `gerente`/`dono` → permitido; outra empresa → negado; `column_privileges` de `authenticated` em `vendas` → **lista vazia** |
| **D-3** seed do spec batia em outras empresas | **CORRIGIDO** (2ª rodada) | reconfirmado: o seed filtra `where empresa_id = $2 and numero = 1`; os 4 cenários da fila continuam verdes nos dois projetos |
| **D-4** venda cancelada recebia NFC-e e voltava à fila de emissão | **CORRIGIDO** (3ª rodada) | `public.salvar_nfce` agora recusa venda cancelada com **"Esta venda está cancelada."** e a venda fica intacta; `listarVendasPendentes` passou a exigir `status = 'concluida'` (`src/lib/dados/vendas.ts:194`), então a venda cancelada **não** aparece na fila de emissão; o cancelamento da nota (`salvar_nfce` com status `cancelada`) **continua permitido** |

**Defeitos abertos: nenhum.** Observações fora do escopo: D-5 e D-6 (§3.3).

---

## 1. Resumo dos gates — 1ª rodada (execução própria)

| Gate | Comando | Exit | Resultado |
|---|---|---|---|
| Tipos | `npm run lint` (`tsc -p . --noEmit`) | 0 | sem erros |
| Unitário | `npm test` (Vitest) | 0 | **117/117** em 12 arquivos (16,3 s) |
| Banco/RLS | `npm run test:sql` (PGlite) | 0 | **253/253** verificações, 0 falhas |
| Build | `npm run build` | 0 | `tsc` + Vite + PWA (1,32 s) |
| Tipos E2E | `npx tsc -p e2e` | 0 | specs e helpers |
| E2E | `npx playwright test e2e/app/vendas-fila.spec.ts e2e/app/pdv.spec.ts e2e/app/navegacao.spec.ts --workers=1` | 0 | **46/46** (23 por projeto × 2 projetos) |

Detalhe do E2E (2,7 min, 1 worker, portas 5180/5182 confirmadas livres antes):

- `app-computador`: 13 navegação + 6 PDV + 4 Fila NFC-e = **23/23**
- `app-celular`: 13 navegação + 6 PDV + 4 Fila NFC-e = **23/23**

Os 4 cenários do plano (`e2e/app/vendas-fila.spec.ts`) passam nos dois projetos.

### Verificações extras que rodei fora da suíte do repo

Feitas com uma pasta temporária fora do repositório (`.qa-temp/`, já removida) e scripts em
`%TEMP%\opencode\qa-fila\` (removidos no fim):

1. **Layout mobile da aba "Fila NFC-e"** — 1366 px e 390 px: sem rolagem horizontal
   (`semRolagemHorizontal`), alvos de toque medidos em **44×44 px** (Reemitir e Marcar resolvida),
   estado vazio "Sem vendas na fila da NFC-e" visível nos dois tamanhos.
2. **Aviso dentro do modal de detalhe** — inspeção de `elementFromPoint` para saber se o texto está
   realmente visível ou atrás do overlay do modal.
3. **Falha de rede durante "Reemitir"** — leitura do texto do modal, do toast e dos avisos da página.
4. **RLS: antes × depois da migration** — execução das migrations em PGlite, com e sem
   `20261111090000_nfce_fila_gestao.sql`, e tentativas de `UPDATE`/`DELETE` como usuário com
   papel `caixa`.
5. **Alcance do seed do spec novo** — 3 empresas no mesmo banco, `UPDATE ... WHERE numero = 1`.

### Gates da revalidação (2ª rodada, execução própria)

| Gate | Comando | Exit | Resultado |
|---|---|---|---|
| Tipos | `npm run lint` (`tsc -p . --noEmit`) | 0 | sem erros |
| Unitário | `npm test` (Vitest) | 0 | **117/117** em 12 arquivos (11,3 s) |
| Banco/RLS | `npm run test:sql` (PGlite) | 0 | **256/256** verificações, 0 falhas (era 253) |
| Tipos E2E | `npx tsc -p e2e` | 0 | specs e helpers |
| E2E | `npx playwright test e2e/app/vendas-fila.spec.ts e2e/app/pdv.spec.ts e2e/app/navegacao.spec.ts --workers=1` | 0 | **46/46** (2,5 min, 1 worker) |

- `app-computador`: 13 navegação + 6 PDV + 4 Fila NFC-e = **23/23**
- `app-celular`: 13 navegação + 6 PDV + 4 Fila NFC-e = **23/23**

Os 4 cenários da fila passam nos dois projetos. O cenário 3 agora cobre também o aviso **dentro**
do modal de detalhe (`vendas-fila.spec.ts:58–63`).

### Verificações extras da revalidação

Mesma abordagem da 1ª rodada (pasta temporária `.qa-temp/` no repo + scripts em
`%TEMP%\opencode\qa-fila2\`, ambos removidos ao fim):

1. **D-1 na interface** — "Marcar resolvida" com a rede cortada dentro do modal: leitura do texto
   do modal, do toast e dos avisos da página; e `elementFromPoint` no centro do aviso para
   confirmar que ele não está atrás do fundo do modal.
2. **D-2 no banco** — PGlite com as migrations completas: matriz caixa × gerente × dono × outra
   empresa sobre `UPDATE` direto, `marcar_nfce_resolvida` e `salvar_nfce`; conferência de
   `information_schema.column_privileges` (UPDATE em `vendas` para `authenticated`); comparação
   antes × depois da migration.
3. **D-3 no banco** — 3 empresas, seed com `empresa_id`.
4. **Achados novos** — venda cancelada × `salvar_nfce`; nota emitida rebaixada para `erro`;
   `listarVendasPendentes` sobre venda cancelada; estado terminal da nota resolvida.
5. **Layout mobile da aba Fila NFC-e** (reconferido após a correção do componente): sem rolagem
   horizontal em 1366 px e 390 px, alvos de toque **44×44 px**, estado vazio visível.

### Gates da revalidação final (3ª rodada, execução própria)

| Gate | Comando | Exit | Resultado |
|---|---|---|---|
| Tipos | `npm run lint` (`tsc -p . --noEmit`) | 0 | sem erros |
| Unitário | `npm test` (Vitest) | 0 | **117/117** em 12 arquivos (11,0 s) |
| Banco/RLS | `npm run test:sql` (PGlite) | 0 | **261/261** verificações, 0 falhas (era 256) |
| Build | `npm run build` | 0 | `tsc` + Vite + PWA |
| Tipos E2E | `npx tsc -p e2e` | 0 | specs e helpers |
| E2E | `npx playwright test e2e/app/vendas-fila.spec.ts e2e/app/pdv.spec.ts e2e/app/navegacao.spec.ts --workers=1` | 0 | **46/46** (2,3 min, 1 worker) |

- `app-computador`: 13 navegação + 6 PDV + 4 Fila NFC-e = **23/23**
- `app-celular`: 13 navegação + 6 PDV + 4 Fila NFC-e = **23/23**

Os 5 casos SQL novos da seção "Fila NFC-e" cobrem o D-4: "venda cancelada segue cancelada e com
nota pendente", "venda cancelada não recebe emissão", "a tentativa não altera a venda cancelada",
"venda cancelada não volta para a fila de emissão" e "registrar o cancelamento da nota continua
permitido".

> **Nota sobre a 1ª execução do E2E desta rodada:** a primeira vez que rodei o E2E principal, ele
> acusou 1 falha em `app-celular › navegação › tela /relatorios` — mas a falha foi
> `browserContext.close: ENOENT ... test-results/.playwright-artifacts-1/...`, ou seja, um erro de
> **limpeza de artefato do Playwright**, e não uma asserção do produto. A causa foi a minha rodada
> temporária rodando **em paralelo** e disputando a pasta `test-results` com a rodada principal.
> Re-rodado sozinho, sem concorrência: **46/46**. Nenhum arquivo de teste do repositório foi
> alterado por mim.

### Verificações extras da revalidação final

Mesma abordagem das rodadas anteriores (pasta temporária `.qa-temp/` no repo + scripts em
`%TEMP%\opencode\qa-fila3\`, ambos removidos ao fim):

1. **D-4 no banco (PGlite, migrations completas)** — `caixa` gravando `'emitida'` com chave falsa em
   venda cancelada → **"Esta venda está cancelada."**, e a venda continua
   `{status: cancelada, nfce_status: pendente, nfce_chave: null}`; o mesmo para `'erro'`;
   `listarVendasPendentes` (com `status = 'concluida'`) → **nenhuma** cancelada na fila (sem o
   filtro, haveria 2); `salvar_nfce` com status `'cancelada'` numa venda cancelada → **permitido**,
   que é o cancelamento da nota (caminho de `cancelarNFCeDaVenda`).
2. **D-2 reconfirmado** — `UPDATE` direto (caixa) → "permission denied for table vendas";
   `marcar_nfce_resolvida` (caixa) → "Somente dono ou gerente resolve a fila da NFC-e.";
   (gerente) → permitido e grava `nfce_resolucao = 'motivo do gerente'`; `salvar_nfce` (caixa) →
   permitido; `salvar_nfce`/`marcar_nfce_resolvida` de outra empresa → negados.
3. **Nota resolvida é terminal** — `salvar_nfce` em nota resolvida → "Esta nota já foi resolvida.";
   `marcar_nfce_resolvida` de novo → "Esta venda não está mais na fila da NFC-e."
4. **D-1 reconfirmado na interface** — rede cortada dentro do modal de resolução: o modal mostra
   "Sem conexão com o servidor. Verifique a internet e tente novamente." e o toast "Falha ao
   marcar a venda 01-000001 como resolvida."; o aviso de emissor desligado aparece dentro do modal
   e está visível (`elementFromPoint` devolve o próprio aviso, não o fundo do modal).
5. **Layout mobile reconferido** — sem rolagem horizontal em 1366 px e 390 px, alvos **44×44 px**.

---

## 2. Conferência da implementação contra o plano e a spec

### 2.1 Migration `supabase/migrations/20261111090000_nfce_fila_gestao.sql`

| Exigido (plano/spec) | Found (após as correções) | OK |
|---|---|---|
| `add column vendas.nfce_erro text` | linha 15 | sim |
| `add column vendas.nfce_resolucao text` | linha 16 | sim |
| CHECK de `nfce_status` com `'resolvida'` | linhas 18–21 | sim |
| Motivo obrigatório para `resolvida` (padrão do cancelamento) | linhas 24–26 (`length(trim(...)) >= 3`) | sim |
| UPDATE liberado só nas colunas fiscais | **mudou**: saiu o `grant update` para `authenticated`; a escrita é só por `public.salvar_nfce` (linhas 30–62) e `public.marcar_nfce_resolvida` (linhas 65–88), ambas SECURITY DEFINER | sim (melhor que o previsto) |
| Venda continua imutável | gatilho `app.vendas_proteger()` reescrito (linhas 97–115) libera só as colunas fiscais | sim |
| Isolamento entre empresas e por papel | checagem dentro das funções: `app.empresas_com_papel(['dono','gerente','caixa'])` na emissão, `['dono','gerente']` na resolução, `app.minhas_lojas()` nas duas, `app.empresas_gravaveis()` para assinatura | sim |

### 2.2 Camada de dados `src/lib/dados/vendas.ts`

- `salvarNFCe` aceita `mensagem` e grava em `nfce_erro`; limpa o erro ao emitir/cancelar (linhas 153–170). Confere com o plano ("erro → emitida limpa `nfce_erro`").
- `listarVendasFilaNFCe(empresaId, lojaId)` (linhas 218–243): concluídas, `nfce_status in ('pendente','erro')`, por `ocorrido_em` crescente, sem período e sem paginação. Confere com o plano.
- `marcarNFCeResolvida(vendaId, motivo)` (linhas 245–256): grava motivo, limpa `nfce_erro`, só aceita venda que ainda está `pendente`/`erro`, valida ≥ 3 caracteres. Confere.
- `Venda`/`paraVenda` leem `nfce_erro`/`nfce_resolucao`; `listarVendas` também seleciona os campos novos (o modal de venda mostra "Motivo do erro" e "Resolvida: ..."). Confere.

### 2.3 Emissão `src/lib/emissao.ts`

- `emitirUmaVenda` persiste `resultado.mensagem` no erro (linha 33). Confere.

### 2.4 UI

- Aba "Fila NFC-e" como **terceira** opção do `Segmentado` (`vendas | fila | sessoes`); rota e `h1` inalterados.
- Filtros de período e KPIs escondidos na aba da fila (a fila é estado atual, não histórico) — correto.
- Resumo "N pendentes · M com erro" (`Aviso` tom info).
- Badges via `NFCE_STATUS`, incluindo `resolvida` → "Nota resolvida" com a classe exata da spec (`bg-slate-100 text-slate-600 ring-slate-200`).
- Estados da spec: "Carregando fila da NFC-e…", "Sem vendas na fila da NFC-e" + "Todas as notas estão em dia.", erro de rede "Não foi possível carregar a fila da NFC-e. Tente novamente." com botão "Tentar novamente".
- Ações por linha: Reemitir (sempre visível), Ver detalhe do erro (só quando há `nfce_erro`), Marcar resolvida (motivo ≥ 3, padrão do cancelamento).
- Permissão: `pode.cancelarVenda && pode.gravavel` — igual ao gate do cancelamento, como pede a spec.
- a11y: `aria-label` em todo botão de ícone, `aria-hidden` nos ícones decorativos, `title` acompanhando o `aria-label`, foco preso e devolução de foco no `Modal` existente, ordem de tab preservada.
- Alvos de toque: `min-h-11 min-w-11` (44 px) — medido 44×44 nos dois viewports.
- `pb-seguro` fica na navegação inferior do `Layout` (já existente) e o `main` usa `pb-28` no celular — a área da fila não precisa repetir a classe.

### 2.5 Regressão

- `pdv.spec.ts` (6) e `navegacao.spec.ts` (13) verdes nos dois projetos; `navegacao` continua checando `/vendas` sem rolagem lateral e sem mexer no `h1`.
- Nenhum `data-testid`, `aria-label` ou texto dos specs existentes foi alterado.
- Spec novo cumpre as regras de `agents/REGRAS_E2E.md`: sem `count()` em asserção, `toast` com regex flexível, resultado validado em outra asserção.

---

## 3. Defeitos

### 3.1 Defeitos da 1ª rodada — CORRIGIDOS (revalidados por mim)

#### D-1 — Erro de ação dentro do modal de detalhe era engolido — **CORRIGIDO**

**Onde estava:** `src/components/FilaNFCe.tsx:145` (`{erroAcao && !aberta && <Aviso …>}`) e
`FilaNFCe.tsx:69–92` (`reemitir`, `catch` → `setErroAcao`).

**O que era:** o `catch` de `reemitir` gravava a mensagem em `erroAcao`, mas o aviso só renderizava
quando `aberta` (o modal de detalhe) era **falsy**; o `DetalheFila` não recebia `erroAcao`, então
uma ação disparada de dentro do modal não mostrava nada.

**Correção feita:** `DetalheFila` agora recebe `aviso` e `erroAcao` (`FilaNFCe.tsx:223–224`) e os
renderiza dentro do modal (`FilaNFCe.tsx:309–310`); o `catch` de `reemitir` e o de `resolver`
(`:87–93` e `:113–119`) também sobem um `toast.erro`.

**Confirmação (rodada por mim, rede cortada dentro do modal de resolução):**
- texto do modal: `Marcar venda 01-000001 como resolvida … **Sem conexão com o servidor. Verifique
  a internet e tente novamente.** Motivo da resolução * Marcar como resolvida` → o erro aparece
  **dentro** do modal;
- toast: `Falha ao marcar a venda 01-000001 como resolvida.`;
- o aviso "Integração NFC-e não configurada" (emissor desligado) também aparece dentro do modal e
  está de fato visível — conferi com `document.elementFromPoint` no centro do texto: o elemento
  retornado é o próprio texto do aviso, não o fundo do modal (`ehOverlay: false`).

#### D-2 — `caixa` resolvia a fila direto na API, furando o gate de papel — **CORRIGIDO**

**Onde estava:** `supabase/migrations/20261111090000_nfce_fila_gestao.sql:27–33`
(`grant update (…) to authenticated` + `policy vendas_nfce_fila`) e o gatilho em `:36–54`.

**Correção feita:** o `grant update` para `authenticated` saiu; `information_schema.column_privileges`
agora devolve **lista vazia** para `public.vendas`. A escrita passou por duas funções
SECURITY DEFINER com checagem de papel/empresa/loja/assinatura:
`public.salvar_nfce` (dono/gerente/caixa — a emissão) e `public.marcar_nfce_resolvida`
(dono/gerente — a resolução), ambas com `revoke execute` de `public`/`anon` e `grant execute` a
`authenticated`. O gatilho `app.vendas_proteger` continua liberando só as colunas fiscais.

**Confirmação (rodada por mim, PGlite, migrations completas):**

| Operação | `caixa` | `gerente` | `dono` | outra empresa |
|---|---|---|---|---|
| `UPDATE public.vendas SET nfce_status=…` (direto) | **BLOQUEADO** — "permission denied for table vendas" | **BLOQUEADO** | **BLOQUEADO** | — |
| `public.marcar_nfce_resolvida` | **BLOQUEADO** — "Somente dono ou gerente resolve a fila da NFC-e." | permitido | permitido | **BLOQUEADO** |
| `public.salvar_nfce` (erro da emissão) | permitido (é o papel que opera o caixa) | permitido | permitido | **BLOQUEADO** — "Sem permissão para gravar a NFC-e desta venda." |

Também confirmei que o estado terminal segura: depois de `marcar_nfce_resolvida`, um `salvar_nfce`
em cima é **BLOQUEADO** ("Esta nota já foi resolvida.").

#### D-3 — Seed do spec novo batia nas vendas de outras empresas — **CORRIGIDO**

**Onde estava:** `e2e/app/vendas-fila.spec.ts:35` e `:60` (`… where numero = 1`).

**Correção feita:** o seed passou a filtrar `where empresa_id = $2 and numero = 1`, usando
`conta.empresaId` (`:36–37` e `:69–70`).

**Confirmação (rodada por mim, PGlite com 3 empresas):** o seed com `empresa_id` afetou
**1 linha** (só a empresa do teste); as outras duas empresas seguiram sem venda em `erro`.

### 3.2 Defeito da 2ª rodada — corrigido na 3ª rodada

#### D-4 — `public.salvar_nfce` não protegia a venda já cancelada — **CORRIGIDO**

**Onde estava:** `supabase/migrations/20261111090000_nfce_fila_gestao.sql:44–61`
(a função `public.salvar_nfce`; o comentário das linhas 28–29 prometia o que o código não fazia) e
`src/lib/dados/vendas.ts:190–203` (`listarVendasPendentes`, sem filtro de `status`).

**O que era:** a função bloqueava a nota **resolvida** (linha 53), mas não a venda **cancelada** —
não havia checagem de `v.status = 'cancelada'`. Um `caixa` podia gravar o estado fiscal de uma venda
cancelada:

```
venda cancelada, antes:  {"status":"cancelada","nfce_status":"pendente","nfce_chave":null}
caixa → public.salvar_nfce(venda, 'emitida', 'CHAVE-FALSA', 'https://qr.falso', null)  → PERMITIDO
depois:                  {"status":"cancelada","nfce_status":"emitida","nfce_chave":"CHAVE-FALSA"}
```

E, como o cancelamento do PDV grava `vendas.status = 'cancelada'` sem mexer em `nfce_status`, a
venda cancelada **continuava na fila de emissão** (`listarVendasPendentes` filtrava só por
`nfce_status = 'pendente'`).

**Correção feita (3ª rodada):**
- `public.salvar_nfce` agora recusa a venda cancelada com **"Esta venda está cancelada."**
  (`supabase/migrations/20261111090000_nfce_fila_gestao.sql:57–59`), liberando só o registro do
  cancelamento da própria nota (`p_status = 'cancelada'`);
- `listarVendasPendentes` passou a exigir `status = 'concluida'`
  (`src/lib/dados/vendas.ts:194`), tirando a venda cancelada da fila de emissão;
- 5 casos SQL novos em `scripts/testar-sql.mjs`.

**Confirmação (rodada por mim, PGlite, migrations completas):**

| Verificação | Resultado |
|---|---|
| `caixa` → `salvar_nfce(venda cancelada, 'emitida', 'CHAVE-FALSA', …)` | **BLOQUEADO** — "Esta venda está cancelada." |
| `caixa` → `salvar_nfce(venda cancelada, 'erro', …)` | **BLOQUEADO** — "Esta venda está cancelada." |
| Estado da venda depois das tentativas | `{status: cancelada, nfce_status: pendente, nfce_chave: null}` — **inalterado** |
| `listarVendasPendentes` (com `status = 'concluida'`) | **nenhuma** venda cancelada na fila (sem o filtro, haveria 2) |
| `salvar_nfce(venda cancelada, 'cancelada')` — cancelamento da nota | **PERMITIDO** (caminho de `cancelarNFCeDaVenda`), e o estado final é `nfce_status = cancelada`, chave limpa |

Os 5 casos novos do `test:sql` cobrem o mesmo caminho ("venda cancelada segue cancelada e com nota
pendente", "venda cancelada não recebe emissão", "a tentativa não altera a venda cancelada",
"venda cancelada não volta para a fila de emissão", "registrar o cancelamento da nota continua
permitido") — todos verdes na rodada.

### 3.3 Observações fora do escopo (não bloqueiam, combinadas com o Programador)

- **D-5 (informativo):** `public.salvar_nfce` permite a `caixa` gravar `nfce_status = 'emitida'`
  com `chave`/`qrcode` que o próprio cliente envia (confirmei: `caixa` gravou 'emitida' com
  'CHAVE-INVENTADA'). Isso é coerente com a arquitetura atual — o emissor roda no cliente e o
  `salvarNFCe` é quem grava o que ele devolveu (`src/lib/emissao.ts:29–34`) — mas significa que
  **o cliente é a fonte da verdade** sobre a chave de acesso. Quando o emissor real (T-034) for
  server-side, essa gravação tem que passar pelo servidor, não pelo app. Recomendo registrar
  isso como pendência de T-034, não como defeito deste ciclo.
- **D-6 (informativo):** `public.salvar_nfce` deixa o `caixa` rebaixar uma nota **já emitida** para
  `'erro'`, o que apaga `nfce_chave`/`nfce_qrcode` (confirmei: 'CHAVE-REAL' → `null`). O gatilho
  permite porque só as colunas fiscais mudam. No app isso só acontece se o emissor devolver erro
  numa venda já emitida — o `emitirUmaVenda` chama `salvarNFCe` só no caminho de erro, e a fila de
  gestão só lista `pendente`/`erro`, então o caminho real é estreito. Vale a mesma conversa do
  D-5: com emissor server-side, a regra do que pode rebaixar uma nota emitida fica no servidor.

### 3.4 Observações da 1ª rodada (continuam válidas, não bloqueiam)
`status = 'concluida'` corretamente — o problema é só a fila de **emissão**.

---

## 4. Observações da 1ª rodada (continuam válidas, não bloqueiam)

- **D-7 (informativo):** na linha da fila, os três botões de ação são só ícone com `aria-label` +
  `title`; a spec §3 escreve "ícone RotateCcw + rótulo 'Reemitir'". O nome acessível existe e o
  modal traz os rótulos visíveis, então a11y está satisfeita — mas o rótulo visível da linha não.
  Se a Product Owner quiser o texto visível na linha, é ajuste de layout (390 px comporta mal
  três botões com texto).
- **D-8 (informativo):** a spec §1 pede `data-fila-venda={rotulo}` no botão da linha; na
  implementação o atributo está no `div` que envolve o botão e os botões de ação
  (`FilaNFCe.tsx:157`). O spec novo usa o atributo como delimitador da linha e funciona.
- **D-9 (informativo):** a fila está no `Segmentado` junto com "Vendas" e "Caixas"; o botão global
  "Emitir notas pendentes" continua escondido porque `criarEmissorNFCe().configurado` é `false`
  (stub) — comportamento esperado enquanto não houver emissor real (T-034).
- **D-10 (observação de repo, fora do escopo):** a árvore de trabalho tem mudanças de **outra**
  feature misturadas (presets de validade em `Inventario`/`Movimentar`/`ProdutoDetalhe`/`ui.tsx`/
  `formato.ts` e o ajuste de `e2e/app/movimentar.spec.ts`, além da remoção de
  `.github/workflows/ia-diaria.yml`). Nada disso é do BF-N4 — quem commitar tem de separar, para
  não entrar change de outra feature no commit da fila NFC-e. **Continua valendo na revalidação.**

## 5. O que não consegui verificar

- **Emissão real de NFC-e**: o emissor é stub (`configurado: false`), então os caminhos
  `erro → emitida` e `erro → erro` (com mensagem do emissor) **não foram exercitados de ponta a
  ponta**. Só o caminho de persistência da mensagem foi coberto, via `test:sql`.
- **Resolução de fila com `nfce_erro` real vindo do emissor**: sem emissor, o texto de erro só
  existe por seed de banco.
- **Migração aplicada num Supabase real**: os testes rodam em PGlite (emulação), não no Supabase
  hospedado. Comportamento de `GRANT`/`SECURITY DEFINER`/`policy` pode diferir em detalhes do
  ambiente real.
- **A11y com leitor de tela de verdade**: conferi por código (aria-label, aria-hidden, ordem de
  tab, foco preso) e por medição de alvo de toque; não rodei auditoria com NVDA/VoiceOver.
- **`DOCUMENTACAO_ERP.md`**: não foi alterado — o pedido do ciclo restringiu a escrita a
  `GUIA_DE_TESTES.md` e `memoria/`. A feature é relevante para o usuário final (nova aba em
  Vendas) e a doc de produto deveria ganhar uma entrada na próxima passada.
- **O gate de papel em produção**: os papéis (`dono`/`gerente`/`caixa`) e a assinatura foram
  testados em PGlite, que emula o ambiente do Supabase; não validei contra o Supabase hospedado.

## 6. Encerramento do ciclo (revalidação final)

- Gates da 3ª rodada: **todos verdes** — `npm run lint` 0; `npm test` **117/117**;
  `npm run test:sql` **261/261** (era 256; os 5 casos novos cobrem o D-4); `npm run build` 0;
  `npx tsc -p e2e` 0; Playwright (vendas-fila + pdv + navegacao, `--workers=1`) **46/46** — 23 por
  projeto × computador e celular, os 4 cenários da fila verdes nos dois.
- Defeitos: **D-1, D-2, D-3 e D-4 corrigidos** e reconfirmados por execução própria (§3.1 e §3.2).
- **Defeitos abertos: nenhum.**
- Observações fora do escopo: **D-5, D-6** (a chave de acesso vem do cliente — a resolver junto
  com o emissor real, T-034) e **D-7 a D-10** (rótulo visível na linha, atributo
  `data-fila-venda`, botão global de emissão, mudanças de outra feature na árvore).
- Backlog de `memoria/estado.json`: **não alterado** (BF-N4 não está na lista de backlog do
  `estado.json` — é item de `memoria/backlog-features.md`). QA não aprova nem reprova por conta
  própria: o gate mecânico decide.
- **Pronto para ir à produção**, do ponto de vista de QA: os gates passam, os defeitos achados
  foram corrigidos e reconfirmados, e não há pendência aberta nesta feature.

---

## Apêndice — rodadas anteriores (histórico, mantido para auditoria)

Os defeitos D-1, D-2 e D-3 originais estão detalhados em §3.1 acima, com o "onde estava" e a
evidência da reprodução. Números da 1ª rodada: `npm test` 117/117; `npm run test:sql` **253/253**;
Playwright **46/46** (2,7 min, 1 worker, portas 5180/5182 livres). Verificações extras feitas fora
da suíte do repo (pasta temporária `.qa-temp/`, removida ao fim): layout da aba Fila NFC-e em
1366 px e 390 px (sem rolagem horizontal, alvos 44×44, estado vazio visível); visibilidade real do
aviso dentro do modal via `elementFromPoint`; falha de rede durante "Reemitir"; comparação
antes × depois da migration no PGlite; alcance do seed do spec.
