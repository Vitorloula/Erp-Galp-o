# Spec — aba "Fila NFC-e" (Vendas)

**Item:** BF-N4 — `memoria/plano-fila-nfce.md` (backlog-features.md, Features novas, item 4).
**Objetivo:** dar ao operador, em `Vendas`, uma aba de gestão da fila de NFC-e: ver vendas com nota **pendente** ou **erro**, reemitir, ver o detalhe do erro e marcar como resolvida.
**Tipo de entrega:** spec de UI/estados/a11y/.spec.ts. **Não implementa nada em `src/`** e não toca Doop (sem pedido explícito).
**Fonte de verdade:** `memoria/estado.json` (plano_atual), `agents/regras_projeto.md`, `agents/openbot/02-designer.md`.

---

## 1. Layout da aba

### Posicionamento e navegação
- Terceira opção do `Segmentado` já existente em `Vendas.tsx`: `vendas | fila | sessoes`, valor `fila`, rótulo "Fila NFC-e". Reutilizar o componente `Segmentado` sem alterar as duas abas atuais.
- A rota `/vendas` continua a mesma (`navegacao.spec.ts` testa "/vendas" pelo título "Vendas"; não mudar o `h1` nem a rota).
- Sem filtro de período e sem paginação inicial (fila é estado atual, não histórico), conforme o plano. Reavaliar paginação somente se a lista crescer.

### Listagem (mobile-first)
- **Não usar tabela.** Reutilizar o padrão de linha-botão da aba "Vendas": cada venda da fila é um botão full-width (`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50`), com `data-fila-venda={rotulo}` (rotulo = `numeroVenda(caixa.numero, v.numero)`, ex. `01-000123`).
- Ordem: por `ocorrido_em` crescente (mais antiga primeiro), como `listarVendasPendentes` já faz.
- Quebra: sem rolagem horizontal em 390px; adicionar `pb-seguro` (safe-area inferior) no rodapé da tela no celular.
- Toque: alvo mínimo 44px em todos os botões e ícones de ação.

### Campos visíveis por linha
Uma venda pode ter vários produtos, então **produto não é coluna da linha** (aparece no modal de detalhe). Cada linha mostra:
- Rótulo (caixa + número): `01-000123` + nome do caixa.
- Data/hora: `ocorrido_em` (hoje → só hora; outro dia → data + hora).
- Operador (`v.operador_nome`).
- Total: `formatarReais(centavos(v.total))`.
- Badge de status: reutilizar `NFCE_STATUS` com as entradas existentes (`pendente`, `emitida`, `cancelada`, `erro`) mais a nova `resolvida` (rótulo "Nota resolvida", classe `bg-slate-100 text-slate-600 ring-slate-200`).
- Quando `erro`: badge "Nota com erro" e a linha indica que há erro; o texto do erro é exibido no detalhe.

### Resumo no topo
Acima da lista, uma linha de resumo: **"N pendentes · M com erro"** (contagens da fila da loja). Reutilizar `Aviso` (tom neutro/info) ou texto destaque, sem novo componente.

### Detalhe da venda da fila (modal)
Tocar na linha abre um `Modal` (reutilizar, com foco preso e restauração ao fechar) contendo:
- Rótulo, data/hora, operador, total.
- Lista de itens (produto, quantidade, valor unitário e total) — é aqui que "produto" aparece.
- Pagamentos (forma e valor).
- Badge de status da NFC-e.
- Quando `nfce_erro` preenchido: campo "Motivo do erro" com o texto de `nfce_erro`.
- Ações: **Reemitir**, **Ver detalhe do erro** (quando houver erro), **Marcar resolvida**.

---

## 2. Estados da interface

| Estado | Quando ocorre | Mensagem sugerida (pt-BR) | Componente |
|---|---|---|---|
| Carregando | lista ainda não voltou do servidor | "Carregando fila da NFC-e…" | `Carregando` (texto personalizado) |
| Vazia | sem pendentes nem erro | "Sem vendas na fila da NFC-e" + "Todas as notas estão em dia." | `Vazio` (ícone `Receipt` ou `CircleCheck`, sem emoji) |
| Erro de rede | falha ao listar ou ao executar uma ação | "Não foi possível carregar a fila da NFC-e. Tente novamente." | `Aviso tom="erro"` + botão "Tentar novamente" que recarrega via `recarregar()` |
| Reemitindo (progresso) | usuário tocou em Reemitir | "Reemitindo nota…" (botão desabilitado) | botão com `disabled` + indicador de carregamento |
| Resolvida (confirmação) | "Marcar resolvida" concluída com sucesso | "Venda 01-000123 marcada como resolvida." | toast `toast.sucesso(...)` + `recarregar()` da fila |

### Offline
O app já avisa sem internet (`Sem internet. Os lançamentos só serão salvos quando a conexão voltar.` — `navigation.spec.ts:60`). Ao tentar reemitir offline, a ação não prossegue e **não duplica** esse aviso; a tela da fila não exibe aviso de rede próprio para reemissão.

---

## 3. Ações e a11y

### Ações por venda (sempre visíveis na linha, à direita)
1. **Reemitir** — ícone `RotateCcw` + rótulo "Reemitir". Sempre visível. Se o emissor estiver desligado (`nao_configurado`), ao tocar exibe o aviso "Integração NFC-e não configurada" e o status **não muda**.
2. **Ver detalhe do erro** — ícone `Info`/`CircleHelp` + rótulo "Ver detalhe do erro". Visível somente quando `nfce_erro` estiver preenchido; abre o texto no modal de detalhe.
3. **Marcar resolvida** — ícone `CircleCheck` + rótulo "Marcar resolvida". Abre modal com campo de **motivo (≥ 3 caracteres, padrão do cancelamento em `DetalheVenda`)**; grava `nfce_resolucao`, limpa `nfce_erro`, a venda sai da fila.

### Acessibilidade
- Alvo de toque ≥ 44px (botões e ícones de ação).
- Rótulos acessíveis em todo botão de ícone via `aria-label` (ex. `aria-label="Reemitir NFC-e da venda 01-000123"`); `title` sozinho não é confiável em touch/leitores de tela. Ícone decorativo com `aria-hidden`.
- Foco/ordem de tab: Segmentado (aba) → resumo → linhas da lista em ordem de `ocorrido_em` → ações de cada linha na ordem Reemitir, Ver detalhe do erro, Marcar resolvida → modal com foco preso (o `Modal` existente já foca o primeiro elemento ao abrir, restaura ao fechar e faz Tab cíclico).
- Contraste WCAG AA: as classes de `NFCE_STATUS` já usam cores com ring (emerald/slate/amber/red).
- Texto alternativo de ícone: fornecido pelo `aria-label` do botão pai.
- `pb-seguro` no celular.
- Permissão: mesmo gate do cancelamento (`pode.cancelarVenda && pode.gravavel`, padrão de `useAtiva`). Sem permissão, a linha é somente leitura (sem ações).
- Após cada ação, atualizar via `recarregar()` de `useDados` (padrão existente).
- Não alterar `data-testid`, `aria-label` nem textos dos testes E2E existentes (`pdv.spec.ts`, `navegacao.spec.ts`).

---

## 4. Componentes reutilizados (design system, sem criar novo)

`Segmentado`, `Cabecalho`, `Aviso`, `Vazio`, `Carregando`, `Kpi` (resumo opcional), `Modal`, `Badge*` (via `NFCE_STATUS`), `.btn`, `.campo`, `cx`, `Carousel`-like sem uso. Reutilizar `DetalheVenda` ou criar um modal dedicado para o detalhe da fila — decidir na implementação, mantendo o padrão do `Modal`.

---

## 5. .spec.ts afetados

### Novo
- **`e2e/app/vendas-fila.spec.ts`** (4 cenários do plano, semeando via `servidor.comoUsuario` — ver `e2e/apoio/supabase.ts`):
  1. Venda feita no PDV (emissor stub) aparece na aba "Fila NFC-e" como pendente.
  2. Venda semeada com `nfce_status='erro'` + `nfce_erro='…'` aparece com badge "Nota com erro" e o detalhe do erro visível.
  3. "Reemitir" com emissor desligado mostra o aviso "Integração NFC-e não configurada" e o status não muda.
  4. "Marcar resolvida" com motivo muda o badge para "Nota resolvida" e a venda sai da fila.
- Regras E2E do plano: sem `count()` em asserções; regex flexível em toasts; `toBeVisible` no resultado.

### Regressão (cobrir o desenho, sem mudar)
- `e2e/app/pdv.spec.ts`: continua verde (seletores por nome/rota inalterados; a venda concluída ainda aparece em `/vendas`).
- `e2e/app/navegacao.spec.ts`: continua verde (testa `/vendas` pelo título "Vendas" e sem rolagem horizontal; a nova aba não altera a rota nem o `h1`).

### Verificação final
- `npm run lint`, `npm test` e `npm run test:sql` verdes.
- Playwright direcionado (workers=1): `vendas-fila` + `pdv` + `navegacao`.

---

## 6. Fora do escopo desta spec

- Emissão real/homologação da NFC-e (T-034), reimpressão/consulta da nota emitida, UX de reconciliação da fila.
- Implementação em `src/` e alteração no Doop/CorteNexo (canvas `jJXGeQKjbJ`) — sem pedido explícito.
