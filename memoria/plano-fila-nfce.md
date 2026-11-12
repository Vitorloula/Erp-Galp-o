# Plano — Fila operacional para resolver vendas NFC-e pendentes/erro

Item: **BF-N4** (`memoria/backlog-features.md`, Features novas, item 4).
Status: pronto para o Programador. Este plano não escreve código nem toca `src/`.

## Objetivo

Dar ao operador, em `Vendas`, uma tela de gestão da fila de NFC-e: ver vendas com nota **pendente** ou **erro**, reemitir, ver o detalhe do erro e marcar como resolvida — sobre a fila que já existe no código.

## Contexto (evidências no código hoje)

- A fila já existe: `listarVendasPendentes` (`src/lib/dados/vendas.ts:166-189`) lista só `nfce_status='pendente'`; `emitirVendasPendentes` (`src/lib/emissao.ts:44-53`) percorre e grava via `salvarNFCe`.
- `src/pages/Vendas.tsx` só tem o botão global "Emitir notas pendentes" (escondido, pois `criarEmissorNFCe().configurado` é `false` com o stub) e badges por venda; **venda pendente fica sem badge** (`v.nfce_status !== 'pendente'`, linha 186) e não há gestão individual.
- Venda em `erro` **fica fora da fila automática** (só `pendente` é reemitido) e a mensagem de erro do emissor (`ResultadoEmissao.mensagem`) **não é persistida** — não existe coluna.
- Constraint no banco: `vendas.nfce_status check (nfce_status in ('pendente','emitida','cancelada','erro'))` (`supabase/migrations/20261022000000_nfce.sql:14-15`). Não existe status "resolvida".
- E2E: nenhum spec cobre a fila. `e2e/app/pdv.spec.ts` e `e2e/app/navegacao.spec.ts` tocam `/vendas`.

## Estados e transições da fila

| de | para | como |
|---|---|---|
| pendente | emitida | emissor OK (já existe; grava chave/QR) |
| pendente | erro | emissor falha; **passa a gravar a mensagem em `vendas.nfce_erro`** |
| erro | emitida | "Reemitir" dá certo; limpa `nfce_erro` |
| erro | erro | "Reemitir" falha de novo; atualiza `nfce_erro` |
| pendente/erro | resolvida | manual, com motivo (≥3 chars, padrão do cancelamento); grava `nfce_resolucao`, limpa `nfce_erro`, sai da fila |
| resolvida | — | terminal: sem ações na fila |

`nao_configurado` (emissor desligado) não muda status — a tela mostra aviso. Venda **cancelada** não entra na fila.

## Escopo da tela

Nova aba **"Fila NFC-e"** no `Segmentado` de Vendas (`vendas | fila | sessoes`):

- Lista as vendas **concluídas** com `nfce_status in ('pendente','erro')` da loja, por `ocorrido_em` — **sem filtro de período** (fila é estado atual, não histórico) e sem paginação inicial (reavaliar se precisar).
- Linha: rotulo (caixa+número), data/hora, operador, total, badge de status (reusar `NFCE_STATUS` + entrada `resolvida`), motivo da resolução quando resolvida (acessível no detalhe).
- Resumo no topo: "N pendentes · M com erro".
- Ações por venda: **Reemitir** (sempre visível; com emissor desligado mostra o aviso "Integração NFC-e não configurada"), **Ver detalhe do erro** (abre o texto de `nfce_erro`), **Marcar resolvida** (modal com motivo, padrão do cancelamento em `DetalheVenda`).
- Permissão: mesmo gate do cancelamento (`pode.cancelarVenda && pode.gravavel`, padrão de `useAtiva`).
- Após cada ação, atualizar via `recarregar()` de `useDados` (padrão existente).

## Arquivos que mudam

| arquivo | mudança |
|---|---|
| `supabase/migrations/20261111090000_nfce_fila_gestao.sql` (**novo**) | `add column vendas.nfce_erro text`; `add column vendas.nfce_resolucao text`; trocar o CHECK para incluir `'resolvida'` |
| `src/lib/nfce.ts` | `NFCeStatus` ganha `'resolvida'` |
| `src/lib/dados/vendas.ts` | `Venda`/`paraVenda` leem `nfce_erro`/`nfce_resolucao`; `salvarNFCe` aceita `mensagem` (grava no erro, limpa ao emitir); nova `VendaFilaNFCe` (= `VendaPendenteNFCe` + `status` + `nfce_erro`) e `listarVendasFilaNFCe(empresaId, lojaId)` (concluídas, pendente+erro, por `ocorrido_em`); `marcarNFCeResolvida(vendaId, motivo)` (update direto — mesmo caminho/RLS de `salvarNFCe`) |
| `src/lib/emissao.ts` | `emitirUmaVenda` passa `resultado.mensagem` ao `salvarNFCe` no erro (e grava limpo no sucesso). Reemitir = chamar `emitirUmaVenda` com a venda da fila; `emitirVendasPendentes` segue só com pendentes |
| `src/pages/Vendas.tsx` | terceira aba no `Segmentado`, `NFCE_STATUS['resolvida']`, lista/resumo/ações descritos acima |
| `scripts/testar-sql.mjs` | casos da nova migration: CHECK aceita `'resolvida'`; RLS — empresa não vê/altera fila alheia |
| `e2e/app/vendas-fila.spec.ts` (**novo**) | critério de aceite (abaixo) |

## Testes .spec.ts afetados

- **Novo**: `e2e/app/vendas-fila.spec.ts` (critério de aceite).
- `e2e/app/pdv.spec.ts` e `e2e/app/navegacao.spec.ts`: sem quebra esperada (seletores por nome/rota continuam válidos); rodar como regressão. REGRAS_E2E regra 3: a nova aba precisa estar coberta — o spec novo cobre.
- REGRAS_E2E no spec novo: sem `count()` em asserções; regex flexível em toasts; `toBeVisible` no resultado.
- Regra 6 do projeto: se surgir helper puro novo, teste unitário no mesmo commit.

## Ordem de implementação (passos pequenos)

1. **Banco + tipos**: nova migration (`nfce_erro`, `nfce_resolucao`, CHECK com `'resolvida'`); `NFCeStatus` e `NFCE_STATUS` ganham `'resolvida'` (senão o `Record<Venda['nfce_status'],…>` não compila); `Venda`/`paraVenda` leem os campos novos. Verificar: `npm run lint` e `npm run test:sql`.
2. **Camada de dados**: `salvarNFCe` com mensagem; `listarVendasFilaNFCe`; `marcarNFCeResolvida`; casos SQL no `testar-sql.mjs`.
3. **Emissão**: `emitirUmaVenda` persiste a mensagem de erro (`emissao.ts`) — única mudança na emissão.
4. **Tela**: aba "Fila NFC-e" completa em `Vendas.tsx` (lista, badges, resumo, ações, aviso quando emissor desligado, recarregar).
5. **E2E + verificação final**: novo `vendas-fila.spec.ts`; rodar direcionado (workers=1): `npm run lint`, `npm test`, `npm run test:sql`, Playwright `vendas-fila` + `pdv` + `navegacao`.

## Critério de aceite (QA)

`e2e/app/vendas-fila.spec.ts` (novo, semeia via `servidor.comoUsuario` — ver `e2e/apoio/supabase.ts`) cobre:

1. Venda feita no PDV (emissor stub) aparece na aba "Fila NFC-e" como pendente.
2. Venda semeada com `nfce_status='erro'` + `nfce_erro='…'` aparece com badge "Nota com erro" e o detalhe do erro visível.
3. "Reemitir" com emissor desligado mostra o aviso "Integração NFC-e não configurada" e o status não muda.
4. "Marcar resolvida" com motivo muda o badge para "Nota resolvida" e a venda sai da fila.

Regressão: `pdv.spec.ts` e `navegacao.spec.ts` verdes; `npm run lint`, `npm test` e `npm run test:sql` verdes.

## Fora do escopo

- Emissão real/homologação da NFC-e (T-034), reimpressão/consulta da nota emitida (backlog item 5), e a UX de reconciliação da fila (Melhorias #2) — evoluirá sobre esta tela.
