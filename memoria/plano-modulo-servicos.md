# Plano T-038 — Módulo Serviços (Ordem de Serviço — assistência técnica)

Pedido do usuário (resumido pelo dono do produto): "fazer o módulo de serviços, que serviria para assistência técnica... para funcionar nas lojas de eletrônicos". Prioridade definida pelo dono: **antes** de T-037, T-034 e T-028. Registrado por: Arquiteto (15/11/2026). Branch `saas`, HEAD `f0a09f1`.

**Revisão 15/11/2026 (feedback do dono):** (1) sem cadastro de cliente — campos de texto na OS **confirmados**; (2) garantia atrelada ao **produto** (`produtos.garantia_meses`, coluna já existente) sugerida automaticamente na OS; (3) **calendário da assistência** por `prazo_prometido`, agrupado por status. Detalhes nas Decisões 1, 11 e 14 e nos Passos 2 e 7.

Fluxo alvo: recebimento do aparelho → diagnóstico → orçamento (mão de obra + peças) → aprovação do cliente (registrada manualmente) → execução → pronta → entrega com pagamento. Status (snake_case na coluna, textos pt-BR na UI): `aberta`, `em_diagnostico`, `aguardando_aprovacao`, `aprovada`, `em_execucao`, `pronta`, `entregue`, `cancelada`.

## O que já existe (verificado no código)

- **Não existe módulo de serviços/OS**: nenhum match por "ordem de serviço"/"OS"/módulo de serviços em `src/` (busca 15/11/2026, termo só aparece em contexto alheio). Rotas existentes: `src/App.tsx:56-73` (painel, estoque, movimentar, histórico, produtos, relatórios, inventário, mais, equipe, empresa, vendas, divergências).
- **Não existe tabela de clientes**: só `vendas.cliente_cpf` (texto, `20261023000000_nfce_cpf.sql:6`) e `public.erros_cliente` (monitoramento, `20261027091000_monitoramento_piloto.sql:9` — sem relação). `src/lib/dados/cliente.ts:19` é o **cliente HTTP do Supabase**, não cadastro de cliente.
- **Estoque**: razão imutável `movimentacoes` com `tipo` incl. `SAIDA`, `origem` em ('manual','pdv','sistema'), `origem_id` anti-duplicidade e FKs por empresa (`20261008120000_base_multiempresa.sql:339-375`); saldo materializado em `estoque_saldos` (`:381-393`); gatilho `app.movimentacoes_saldo` **bloqueia saldo negativo em lançamento manual com mensagem pt-BR** ("Saldo insuficiente…") (`:540-560`).
- **Saída manual atual**: é **insert direto** em `movimentacoes` com `origem_id` do formulário (`src/lib/dados/movimentos.ts:93-114`), **não** existe RPC `registrar_saida`; o RPC existente é `registrar_entrada` (`base_multiempresa.sql:711`, v2 `20261106120000_transferencias_custo_entrada.sql:17`).
- **Lotes/FEFO**: `produtos.controla_estoque` (`20261010120000_pdv.sql:21`); `lotes` com `validade` (`base_multiempresa.sql:321,326`); helper FEFO puro `ordenarFefo` (`src/lib/estoque.ts:66-68`).
- **Garantia por produto**: coluna `produtos.garantia_meses smallint` já existe (`base_multiempresa.sql:283`) e está no grant de UPDATE direto (`:843-845`); **mas o RPC `salvar_produto` NÃO grava a coluna** — nem no insert (`20261010130000_cadastro_para_pdv.sql:15-27`) nem no update (`:30-53`); `:844` é a lista do **grant de UPDATE** (DML direto), não a lista de colunas do RPC. Como o formulário persiste via RPC (padrão do T-036), o campo seria descartado; e a UI hoje não expõe `garantia_meses` (`src/components/ProdutoForm.tsx`). Correção de premissa registrada no Passo 2.
- **Numeração**: contador por empresa via `app.proximo_numero(p_empresa, p_chave)` sobre a tabela `contadores` (`base_multiempresa.sql:146-151, 204-209`), usado pelo gatilho do código interno de produto (`:411`). Venda usa esquema diferente (número **por caixa**, gerado no aparelho, `pdv.sql:157` + `src/pdv/venda.ts:112-113`) — só funciona porque o PDV é offline-first.
- **PDV offline**: eventos com protocolo/hash e fila (`pdv.sql:227-238`, `src/pdv/sincronizador.ts`) — o caixa precisa funcionar sem internet; uma OS de assistência não precisa disso (ver Decisão 8).
- **Cobrança do caixa**: `vendas`/`vendas_itens`/`vendas_pagamentos` com formas '01','03','04','17','99' (`pdv.sql:151-217`); leitura por RLS, **gravação só pela sincronização** (`pdv.sql:807,823-835`) — o PDV é o caminho caro de integrar.
- **Impressão 80mm**: cupom não-fiscal via `.cupom-impressao` (`src/index.css:142-160`), componente `Cupom` com portal (`src/pages/pdv/Cupom.tsx:28-75`) e `window.print()` (`MenuCaixa.tsx:117`, `Venda.tsx:184,455`).
- **Papéis**: `membros.papel in ('dono','gerente','caixa','estoquista')` (`base_multiempresa.sql:120`); helpers de RLS `app.minhas_empresas()`/`empresas_com_papel()`/`minhas_lojas()`/`empresas_gravaveis()` (`:159-202`); espelho no front `src/lib/permissoes.ts:40-59`.
- **Padrão de RLS/grants**: enable RLS + revoke all de anon + revoke DML de authenticated + grants granulares (`pdv.sql:794-857`); funções `security definer set search_path = ''` (`base_multiempresa.sql:196-209`); gatilhos de bloqueio de UPDATE/DELETE (`app.bloquear_alteracao`, `pdv.sql:268-278`).
- **Relatórios**: abas do `Segmentado` com rótulos ≤12 car. e 5 abas em 320 px (`src/pages/Relatorios.tsx:25`); `SECOES` (`:34`) + `Secoes` de `src/lib/exportar/excel.ts` (import `Relatorios.tsx:12`); export com `exportarComToast` (`Relatorios.tsx:16,291-305`).
- **Painel**: cards `.cartao` com `aria-label` (`src/pages/Painel.tsx:265-266`); aritmética em centavos (`:22,188`); busca de vendas com falha silenciosa (`:81-109`).
- **Prova SQL**: `scripts/testar-sql.mjs` (PGlite simulando Supabase; migrations glob `:12-14`; `comoUsuario` `:25`, `esperaErro` `:37`, `semEfeito` `:49`; caso custo `:202` e `:541`). E2E: 15 specs em `e2e/app/`; apoio com `servidor.comoUsuario` (`e2e/apoio/supabase.ts:88-96`).
- **LGPD**: exportação do dono em `src/lib/dados/lgpd.ts` (T-031 concluído) — precisa incluir os dados novos.

## Decisões de escopo (justificadas)

1. **Cliente: campos de texto na OS (v1) — sem tabela `clientes`. CONFIRMADO PELO DONO (15/11/2026).** Justificativa: menor custo (zero tabela/RLS/UX de deduplicação) e a busca no histórico continua possível por telefone/IMEI (colunas indexáveis na própria OS). A mini-tabela só pagaria quando outro módulo reusar clientes (PDV/NFC-e, fidelidade) — aí vira follow-up com migração dos dados. Custo de recadastro por OS é aceitável para loja pequena; o nome é `cliente_nome` (coluna já aponta pro futuro).
2. **Aparelho: campos de texto na OS.** `aparelho_tipo`, `aparelho_marca_modelo`, `aparelho_serie_imei`, `aparelho_cor`, `aparelho_senha` (opcional), `aparelho_acessorios`, `aparelho_estado`, `defeito_relatado`, `prazo_prometido`. **Sem dependência do T-035** (rastreio por série no estoque): módulos independentes; `movimentacoes.serie_id` ("fase eletrônicos", `base_multiempresa.sql:363`) e `produtos.rastreio` (`:280`) ficam intocados. Relação anotada: o T-035, quando existir, pode preencher o IMEI por leitura — nada muda no contrato da OS.
3. **Baixa de peças: na ENTREGA, server-side, FEFO, auditável.** Na mudança para `entregue`, a função de status grava uma `SAIDA` em `movimentacoes` por (item × lote), `origem='manual'` (herda o bloqueio de saldo negativo e a mensagem pt-BR do gatilho, `base_multiempresa.sql:552-556`), `documento='OS 000123'`, `origem_id` determinístico (`md5('os:'||os_id||':'||item||':'||lote_id)::uuid`). Pré-checa o saldo somado por produto e falha com erro claro ("Estoque insuficiente: ⟨produto⟩ — necessário X, disponível Y"). **Por que na entrega e não na aprovação**: a execução pode trocar peça (peça com defeito de fábrica) — baixar na aprovação geraria entrada de volta; a entrega é terminal e atômica (entrega = coletar pagamento + baixar peças + recibo). Lotes escolhidos por FEFO server-side (`validade asc nulls last`) — a tela de OS não precisa ensinar lote (a loja de eletrônicos trabalha com poucos lotes por peça; `ordenarFefo` do front fica só para consulta). Não existe `registrar_saida` RPC — a função nova é o equivalente para o fluxo da OS.
4. **Cobrança: na própria OS (`os_pagamentos`), não pelo PDV.** Espelha as formas de `vendas_pagamentos` ('01','03','04','17','99' + rótulos de `NOME_FORMA`, `src/pdv/venda.ts`) mas é tabela nova com RLS de escrita por papel — sem caixa, sessão, número por caixa nem fila offline (integrar o PDV exigiria entrar no fluxo offline do caixa, custo alto). Coluna `venda_id uuid null` fica reservada: o follow-up "receber no PDV como venda avulsa" apenas preenche a vínculo. Consistência garantida no banco: **entrega sem pagamentos ≥ total falha** com mensagem pt-BR.
5. **Numeração: `numero bigint` por empresa**, gatilho BEFORE INSERT chamando `app.proximo_numero(empresa_id, 'os')` (mesmo padrão do código de produto, `base_multiempresa.sql:411`); exibição "OS 000123" (helper puro como `numeroVenda`, `src/pdv/venda.ts:112-113`). Índice único (empresa, numero).
6. **Transições de status (validadas na função de status):** avançar para qualquer status **posterior** da cadeia é permitido (serviço simples não precisa passar por 7 cliques); voltar não é permitido; `cancelada` a partir de qualquer status ativo com **motivo obrigatório (≥3 caracteres)**, como em `vendas.motivo_cancelamento` (`pdv.sql:177`); `entregue` e `cancelada` são terminais (UPDATE/DELETE bloqueados por gatilho, padrão `app.bloquear_alteracao`). Marcos gravados como colunas de data (`orcado_em`, `aprovada_em`, `pronta_em`, `entregue_em`, `cancelada_em`) — sem tabela de eventos na v1.
7. **Papéis (espelha `permissoes.ts`, banco é quem garante):** dono e gerente: tudo (incluir cancelar); estoquista: criar e mover OS até `pronta` (recebimento, diagnóstico, orçamento, aprovação, execução) — **não entrega** (dinheiro é do caixa); caixa: registra pagamento e **entrega** apenas. Leitura: todos os papéis da loja (política `minhas_lojas`, padrão `pdv.sql:830-835`). `tecnico_id`/`tecnico_nome` opcional (uuid sem FK + nome, padrão `operador_id/operador_nome` de `pdv.sql:160-161`) — não há papel novo de técnico. Flags novas em `permissoes.ts`: `criarOrdem`/`moverOrdem` (= papel estoque), `entregarOrdem` (= papel vender), `cancelarOrdem` (= `cancelarVenda`).
8. **Offline: OS online-first na v1, sem fila.** Justificativa: o PDV é offline-first porque o cliente está no balcão; na assistência, o recebimento/diagnóstico tolera exigir conexão (rede caiu → lançar depois). Evita protocolo de eventos, divergências e hash de conteúdo — a maior parte do custo do PDV.
9. **Notificação: botão "copiar mensagem"** com textos prontos por marco (`aguardando_aprovacao` → orçado; `pronta` → pronto), `navigator.clipboard` + toast. **Sem WhatsApp automático** (T-034) e sem link wa.me na v1 — textos exatos ficam na spec do Designer.
10. **Impressão: comprovante de recebimento + recibo de entrega** em 80mm reusando `.cupom-impressao` e o padrão do `Cupom` (portal + `window.print()`), com "*** DOCUMENTO SEM VALOR FISCAL ***" e termo de responsabilidade (acessórios, estado de conservação, prazo, dados/arquivos).
11. **Garantia: por PRODUTO (pedido do dono), sugerida na OS.** `produtos.garantia_meses` (coluna existente, `base_multiempresa.sql:283`) passa a ser preenchível no cadastro (Passo 2 — o RPC precisa da migration pequena, ver lá). Na OS, `garantia_dias` continua EDITÁVEL, mas a UI **sugere a MAIOR garantia entre as peças do estoque usadas** (itens `origem='estoque'`; protege o consumidor — a maior garantia cobre todo o serviço), com fallback 90 dias quando nada configurado (garantia 0 configurada é respeitada = "sem garantia"). O recibo mostra "Garantia até" (entrega + `garantia_dias` final editado). Anotação: usa a coluna legada `garantia_meses`, mas **NÃO implementa o fluxo de rastreio do T-035** (série/IMEI no estoque segue independente). Consulta por IMEI/telefone na lista permanece. Garantia por item: follow-up.
12. **Superfícies**: card "Ordens de serviço" no Painel (abertas/em execução, aguardando aprovação, prontas não entregues, atrasadas = `prazo_prometido` < hoje e não entregues); aba "Serviços" em Relatórios (KPIs + por técnico + por status + faturamento do período, export Excel/PDF) — 6ª aba/rótulo "Serviços" (8 car.) precisa do confere de 320 px do Designer (`Relatorios.tsx:25`); item no menu lateral (`Layout.tsx:130-142`) e no Mais (`Mais.tsx:57-63`) visível a todos os papéis (ações gateadas por permissão).
13. **LGPD**: dados de cliente aparecem na OS → `lgpd.ts` passa a exportar `ordens_servico` (+ itens/pagamentos). Obrigatório para manter a promessa de exportação completa (T-031).
14. **Agenda/calendário da assistência (pedido do dono):** tela `ServicosAgenda` (`/os/agenda`, atalhos na lista de OS e no card do Painel) com visão de **calendário mensal mobile-first** posicionando as OS por `prazo_prometido`, codificadas por grupo de trabalho: "Orçamento" (`aguardando_aprovacao`+`aprovada`), "Em andamento" (`aberta`+`em_diagnostico`+`em_execucao`), "Prontas" (`pronta` não entregue) e "Atrasadas" (`prazo_prometido` < hoje, não entregue/cancelada) em **destaque visual**; OS sem prazo numa seção própria ("Sem prazo"). **Entregues e canceladas ficam de fora**: a agenda é a visão de trabalho pendente (entregue/cancelada não exigem ação), o Histórico e o Relatório já cobrem a consulta e o grid fica mais limpo — versão discreta com entregues do mês fica de follow-up se o dono pedir. Sem arrastar/reamarcar na v1: o prazo muda no detalhe da OS (já editável). Sem agenda por técnico (fora do escopo). Navegação por mês (anterior/próximo).

## Suposições de produto (só o usuário confirmaria; não bloqueiam)

- Reprovação do orçamento = `cancelada` com motivo ("cliente não aprovou o orçamento"); não há status `reprovada`.
- "Atrasada" = `prazo_prometido` preenchido e vencido, ainda não entregue/cancelada.
- Senha de desbloqueio fica em texto livre na OS (dado sensível de acesso); se o dono quiser ocultar/redigir, é ajuste fino da spec.
- Não há reserva de estoque ao aprovar o orçamento: entre aprovação e entrega a peça pode ser vendida no balcão — a entrega falha com erro claro e o estoquista resolve (realojar peça, item avulso, ou esperar entrada). Reserva é follow-up.
- Uma OS não tem parcelamento/pagamentos compostos além de várias formas simples (somatório).
- OS entregue não é editável; erro de pagamento após entrega = follow-up (v1: nenhuma correção).
- Número da OS é por **empresa** (não por loja) — a maioria tem 1 loja.
- Agenda por TÉCNICO (turnos/ocupação), fotos do aparelho e serviços de terceiros ficam fora — o calendário do dono é por prazo/promessa, não por técnico.

## Passos (ordem, pequenos)

### Passo 1 — Migration + função de status + prova SQL
- Novo `supabase/migrations/20261115090000_modulo_servicos.sql` (data de hoje, padrão `20261010120000_pdv.sql`):
  - `ordens_servico`: `empresa_id`, `id uuid` (default `gen_random_uuid()`), `loja_id`, `numero bigint`, `status text default 'aberta'` (check na lista), dados do cliente (`cliente_nome not null`, `cliente_telefone`, `cliente_documento`), dados do aparelho (texto, ver Decisão 2), `prazo_prometido date`, `valor_mao_de_obra numeric(14,2) default 0 check >=0`, `desconto numeric(14,2) default 0 check >=0`, `garantia_dias int` (null/≥0), `tecnico_id`/`tecnico_nome`, `venda_id uuid null`, `criado_por(_nome)`, marcos `*_em` + `entregue_por(_nome)` + `cancelada_por(_nome)` + `motivo_cancelamento` (check ≥3), FKs (empresa, loja) e unique (empresa, id) e (empresa, numero); índices (empresa, status), (empresa, aparelho_serie_imei), (empresa, cliente_telefone), (loja, numero), (empresa, prazo_prometido).
  - `os_itens`: `empresa_id`, `id uuid`, `os_id`, `loja_id`, `ordem smallint`, `origem check ('estoque','avulsa') default 'estoque'`, `produto_id uuid null`, `descricao not null`, `quantidade numeric(14,3) check >0`, `preco_unitario numeric(14,2) check >=0`, `total` generated (`quantidade * preco_unitario`), `baixado_em`; FK (empresa, os_id) e (empresa, produto_id) quando not null.
  - `os_pagamentos`: `empresa_id`, `id uuid`, `os_id`, `loja_id`, `forma check ('01','03','04','17','99')`, `valor check >0`, `registrado_por(_nome)`, `registrado_em`.
  - Numeração: gatilho BEFORE INSERT chama `app.proximo_numero(new.empresa_id, 'os')`.
  - Gatilho `os_proteger` (padrão `app.bloquear_alteracao`): linhas em `entregue`/`cancelada` não mudam; `os_pagamentos`/`os_itens` bloqueados quando o pai está em `entregue`/`cancelada` (ou, para itens, também após `aprovada`).
  - `os_mudar_status(p_os uuid, p_status text, p_motivo text default null)`: `security definer set search_path = ''`; valida papel (estoquista/dono/gerente para tudo, exceto `entregue` = dono/gerente/caixa), transição (ordem crescente na cadeia; `cancelada` com motivo obrigatório), e **na entrega**: (a) soma de `os_pagamentos` ≥ total da OS (senão exception pt-BR "Registre o pagamento de R$ X antes de entregar."); (b) para cada item `origem='estoque'`: pré-checa saldo por produto e grava `SAIDA`s FEFO em `movimentacoes` (`origem='manual'`, `documento='OS '||lpad(numero,6,'0')`, `origem_id` determinístico) — herda bloqueio de saldo do gatilho existente; (c) grava `entregue_em`/`entregue_por(_nome)` e marca `os_itens.baixado_em`.
  - Segurança no padrão do repo: RLS enable, revoke all de `anon`, revoke DML de `authenticated` (`pdv.sql:794-810`), policies de select (`minhas_empresas`+`minhas_lojas`), insert/update de OS/itens para dono/gerente/estoquista + `empresas_gravaveis()` (status/columnas de status **não** recebem grant — mudança só pela função), insert de `os_pagamentos` para dono/gerente/caixa com pai em `pronta`; `revoke execute` de public/anon e `grant execute` da função a authenticated (`pdv.sql:843-854`); `alter publication supabase_realtime add table public.ordens_servico` (opcional, padrão `pdv.sql:857`).
- Prova em `scripts/testar-sql.mjs` (novo caso, padrão `comoUsuario`/`esperaErro` `:25,:37`): (1) dono cria 2 OS → numero 1 e 2; outra empresa também numera 1; (2) transição completa até `pronta`; (3) entrega sem pagamento falha com mensagem pt-BR; pagamento insuficiente também; (4) com pagamento, entrega grava `SAIDA`s FEFO (2 lotes: vencimento antes do null), `estoque_saldos` atualizados, `baixado_em` preenchido; (5) estoque insuficiente falha citando o produto; (6) estoquista não entrega (42501); caixa não move para `em_diagnostico` e não cancela; (7) cancelar sem motivo falha; `entregue` é terminal (semEfeito); (8) itens imutáveis após `aprovada`; (9) RLS: empresa B não vê OS da empresa A; (10) item avulso (`produto_id null`) não gera SAIDA.
- **Aceite**: `npm run test:sql` verde com os casos novos; erro em pt-BR confirmado nas exceções.

### Passo 2 — Garantia (meses) no cadastro do produto (pedido do dono)
- **Correção à premissa do dono (verificada no código):** `garantia_meses` existe na tabela (`base_multiempresa.sql:283`) e no grant de UPDATE direto (`:843-845`), mas o RPC `salvar_produto` **não** grava a coluna (insert `20261010130000_cadastro_para_pdv.sql:15-27` e update `:30-53` sem a coluna; `:844` é o grant de UPDATE, não a lista do RPC). Sem isso o campo do formulário seria silenciosamente descartado — mesma causa do T-036 com `custo_ultimo`.
- Migration pequena `supabase/migrations/20261115080000_garantia_produto.sql` (só a função; **nenhuma alteração de tabela**): `create or replace function public.salvar_produto(...)` com a mesma assinatura, incluindo `garantia_meses` no insert e no update — `security definer set search_path = ''`, sem grant novo.
- Prova em `scripts/testar-sql.mjs` (caso novo): produto salvo pelo RPC com `garantia_meses = 6` persiste; salvo sem garantia fica `null`; estoquista também salva com garantia (papel).
- `src/lib/tipos.ts`: `ProdutoDados` ganha `'garantia_meses'` (mesmo padrão do `'custo_ultimo'` do T-036).
- `src/components/ProdutoForm.tsx`: campo numérico opcional "Garantia (meses)" (vazio = sem garantia configurada), `inputMode="numeric"`, validação ≥ 0; dica: "Usada para sugerir a garantia nas ordens de serviço."
- **Aceite**: produto salvo com garantia aparece no detalhe e na edição (valor recarregado); sem garantia salva vazio; `npm run lint` (`tsc --noEmit`) e `npm run test:sql` verdes com os casos novos.

### Passo 3 — Tipos + camada de dados
- `src/lib/tipos.ts`: `StatusOS`, `OS`, `ItemOS` (itens de estoque trazem `garantia_meses` do produto — alimenta a sugestão da Decisão 11), `PagamentoOS`, `DadosOS` (formulário).
- Novo `src/lib/dados/os.ts` no padrão de `vendas.ts`/`movimentos.ts`: `listarOrdens(empresaId, lojaId, filtro)` (status, texto livre em cliente/IMEI/numero/descrição, `buscarTudo`), `criarOrdem`, `detalheDaOrdem` (itens com a garantia do produto + pagamentos), `definirItens` (substitui itens enquanto editável), `mudarStatus` (RPC), `registrarPagamento`; re-export em `src/lib/dados/index.ts`.
- **Aceite**: `tsc --noEmit` (lint) verde; sem tela ainda.

### Passo 4 — Helper puro de fluxo + testes unitários
- Novo `src/lib/servicos.ts`: `STATUS_OS` (rótulos pt-BR exatos: "Aberta", "Em diagnóstico", "Aguardando aprovação", "Aprovada", "Em execução", "Pronta", "Entregue", "Cancelada"), `podeMudarStatus(de, para)`, `numeroOS(n)` → "OS 000123", `montarTotalOS(itens, maoDeObra, desconto)` (centavos, padrão `Painel.tsx:22,188`), `faltamPagamentos(total, pagamentos)`, `atrasada(os, hoje)`, `sugerirGarantia(itens)` → **maior** `garantia_meses` entre os itens `origem='estoque'` (avulsos não contam; nada configurado → 90; garantia 0 configurada → 0 = "sem garantia"; Decisão 11), `mensagemOrcado(os)`, `mensagemPronta(os)` (textos pt-BR exatos; Designer revisa).
- Novo `src/lib/servicos.test.ts`: cadeia de transições (avanço livre, volta proibida, terminal), total com desconto, falta de pagamento, mensagem com/sem telefone, atrasada, garantia sugerida (peça com 12 meses → 12; 6 e 12 meses → 12; só item avulso → 90; garantia 0 → 0; sem garantia → 90).
- **Aceite**: `npm test` verde com os casos novos.

### Passo 5 — Permissões no front
- `src/lib/permissoes.ts`: `criarOrdem`/`moverOrdem` (estoque = dono/gerente/estoquista gravável), `entregarOrdem` (= `vender`), `cancelarOrdem` (= `cancelarVenda`). O banco continua a última instância.
- **Aceite**: `tsc` verde; telas existentes sem mudança (só o objeto ganha chaves).

### Passo 6 — Lista de OS + navegação
- Novo `src/pages/Servicos.tsx` (rota `/os`): filtros por status (chips/Segmentado), busca (cliente, IMEI, número), cartões mobile-first (`.cartao`, `Vazio`, alvo ≥44px, aria-label), badge de atrasadas; atalho para a agenda (`/os/agenda`); caixa vê a lista mas as ações gateadas.
- `src/App.tsx`: rotas `/os`, `/os/nova`, `/os/agenda`, `/os/:id` (padrão `App.tsx:56-73`).
- `src/components/Layout.tsx`: item "Serviços" no menu lateral (todos os papéis, `Layout.tsx:130-142`); `src/pages/Mais.tsx`: item equivalente (`Mais.tsx:57-63`). Barra inferior do celular fica como está (decisão do Designer).
- **Aceite**: navegação até /os com os 4 papéis; lista vazia usa `Vazio`.

### Passo 7 — Agenda/calendário da assistência (pedido do dono)
- Novo `src/pages/ServicosAgenda.tsx` (rota `/os/agenda`, atalhos na lista de OS e no card do Painel): visão de **calendário mensal mobile-first** com as OS posicionadas por `prazo_prometido`, codificadas por grupo de trabalho (Decisão 14): "Orçamento" (`aguardando_aprovacao`+`aprovada`), "Em andamento" (`aberta`+`em_diagnostico`+`em_execucao`), "Prontas" (`pronta` não entregue) e "Atrasadas" (`prazo_prometido` < hoje e não entregue/cancelada) em **destaque visual**. OS sem prazo numa seção própria ("Sem prazo") abaixo do calendário. Toque na OS abre o detalhe; **entregues e canceladas ficam de fora** (agenda = trabalho pendente; histórico/relatório cobrem a consulta — ver follow-up).
- Sem arrastar/reamarcar na v1: o prazo muda no detalhe da OS (já editável). Navegação por mês (anterior/próximo). Nota para o Designer: grid de calendário em 320 px precisa de spec cuidadosa (célula compacta com contagem por dia; fallback lista por dia/semana).
- Helper puro de agrupamento no mesmo arquivo/lib (`gruposDaAgenda` em `src/lib/servicos.ts`, com teste: OS em cada grupo certo; sem prazo fora do grid; entregue/cancelada fora).
- **Aceite (QA)**: OS com prazo dentro do mês aparece no dia certo com a cor do grupo; atrasada destacada; OS sem prazo na seção própria; toque abre o detalhe; trocar de mês navega os períodos; testes unitários do agrupamento verdes.

### Passo 8 — Recebimento (nova OS)
- `src/pages/ServicosRecebimento.tsx` (ou componente em Servicos): cliente (nome obrigatório, telefone, doc), aparelho (tipo select sugestivo + texto, marca/modelo, IMEI/série, cor, senha opcional, acessórios, estado de conservação), defeito relatado, prazo prometido, técnico (opcional). Ao criar: comprovante de recebimento (padrão do `Cupom`: portal `.cupom-impressao` + `window.print()`) com termo de responsabilidade.
- **Aceite**: OS criada com número "OS 000001"; comprovante contém cliente, aparelho, acessórios, defeito e termo.

### Passo 9 — Detalhe/fluxo da OS
- `src/pages/ServicosDetalhe.tsx`: cabeçalho de status + próximo passo (avanço livre), timeline dos marcos; diagnóstico/defeito; orçamento: mão de obra + itens (peça do estoque — busca por nome/código reusando `encontrarPorCodigo`/catálogo — ou item avulso; só editável antes de `aprovada`) + desconto; botão "Cliente aprovou o orçamento" (`aguardando_aprovacao`→`aprovada`, registrado com quem aprovou); execução → pronta; campo "Garantia (dias)" visível quando a OS está em `pronta`, pré-preenchido com `sugerirGarantia(itens)` (Decisão 11) e editável até a entrega; botão "Copiar mensagem" (orçado/pronto, Passo 4); cancelar com motivo (dono/gerente).
- **Aceite**: fluxo completo executável pelo estoquista até `pronta`; sugestão de garantia reflete as peças (maior garantia; fallback 90); itens travados após aprovação (erro claro do banco).

### Passo 10 — Entrega + pagamento + recibo (caixa)
- Na tela de detalhe, seção de entrega visível para `entregarOrdem`: lista itens, mão de obra, desconto, total, pagamentos registrados e diferença; registra forma/valor (Dinheiro/Crédito/Débito/Pix/Outros via `NOME_FORMA` de `src/pdv/venda.ts`); "Entregar" chama o RPC → recibo de entrega impresso (itens, total, pagamentos, **Garantia até** = entrega + `garantia_dias` final editado); estoque baixa server-side (Passo 1).
- Componentes de impressão próprios da OS (mesma classe `.cupom-impressao`; atributos de teste `data-comprovante-os`/`data-recibo-os`).
- **Aceite**: entrega bloqueada sem pagamento suficiente (mensagem clara); recibo com "Garantia até" coerente com o valor editado; saldo do estoque reduz (conferível no Estoque).

### Passo 11 — Painel: card "Ordens de serviço"
- `src/pages/Painel.tsx`: card com contagens (abertas/em execução, aguardando aprovação, prontas não entregues, atrasadas) e atalhos para `/os` (lista filtrada) e `/os/agenda` (calendário); padrão do card Resultado (`Painel.tsx:265-266`), falha silenciosa como nas vendas (`:81-109`).
- **Aceite**: card reflete o estado das OS da loja; cliques levam à lista filtrada e à agenda.

### Passo 12 — Relatórios: aba "Serviços" + export
- `src/pages/Relatorios.tsx`: aba `'servicos'` (rótulo "Serviços"; Designer confere as 6 abas em 320 px — `Relatorios.tsx:25`) com KPIs do período (OS recebidas/entregues/canceladas, faturamento de serviços = pagamentos de OS entregues no período) e tabelas por técnico e por status; busca OS + itens + pagamentos no mesmo `useEffect` dos dados do período.
- `src/lib/exportar/excel.ts` e `pdf.ts`: seção `'servicos'` em `Secoes` + planilha/página "Serviços" (padrão da seção `'resultado'` do T-036); atualizar `SECOES`, `OPCOES_ABA` e `contagensSecoes`.
- **Aceite**: Excel/PDF incluem a seção Serviços; contagem "(0)" quando vazia (padrão T-022).

### Passo 13 — LGPD: exportação inclui OS
- `src/lib/dados/lgpd.ts`: exportar `ordens_servico`, `os_itens`, `os_pagamentos` (dados de clientes da OS).
- **Aceite**: JSON do dono contém as OS; `e2e/app/lgpd.spec.ts` atualizado.

### Passo 14 — E2E novo + regressão + checks finais
- Novo `e2e/app/servicos.spec.ts` (seeding padrão `e2e/apoio/supabase.ts`, `servidor.comoUsuario`):
  1. Dono recebe aparelho → lista mostra "OS 000001 · Aberta"; comprovante contém o termo (`data-comprovante-os`).
  2. Fluxo do estoquista até `pronta` com peça do estoque; "Copiar mensagem" mostra a mensagem orçado/pronto.
  3. Garantia sugerida: produto com garantia configurada faz a OS sugerir a maior garantia entre as peças; sem garantia configurada → 90; campo editável antes de entregar.
  4. Caixa entrega: pagamento Dinheiro, status "Entregue", estoque reduzido, recibo com "Garantia até" coerente (`data-recibo-os`).
  5. Entrega sem pagamento → mensagem clara (não entrega).
  6. Filtro por status e busca por IMEI/telefone.
  7. Cancelada exige motivo.
  8. Agenda: OS com prazo no mês aparece no dia certo com a cor do grupo (Orçamento/Em andamento/Prontas), atrasada destacada, OS sem prazo na seção própria, toque abre o detalhe.
- Regressão (Regra 1 do E2E): `e2e/app/produtos.spec.ts` (campo Garantia no formulário), `e2e/app/navegacao.spec.ts` (menu/rotas novos), `e2e/app/painel-estoque.spec.ts` (card OS + atalho da agenda), `e2e/app/relatorios.spec.ts` (6ª aba + seção), `e2e/app/lgpd.spec.ts` (export), `e2e/app/pdv.spec.ts` (intocado, só conferir).
- Checks: `npm run lint` · `npm test` · `npm run test:sql` · `npx playwright test` (novo + regressão) · build.
- Aplicação das migrations na nuvem: pelo Teste (MCP Supabase de produção) após o push (mesmo fluxo do T-036).

## Arquivos

- **Novos**: `supabase/migrations/20261115080000_garantia_produto.sql` (só o RPC `salvar_produto` com `garantia_meses`), `supabase/migrations/20261115090000_modulo_servicos.sql`, `src/lib/dados/os.ts`, `src/lib/servicos.ts`, `src/lib/servicos.test.ts`, `src/pages/Servicos.tsx`, `src/pages/ServicosAgenda.tsx`, `src/pages/ServicosRecebimento.tsx` (ou componente), `src/pages/ServicosDetalhe.tsx`, componente(s) de impressão da OS, `e2e/app/servicos.spec.ts`.
- **Mudam**: `src/lib/tipos.ts`, `src/components/ProdutoForm.tsx`, `src/lib/dados/index.ts`, `src/lib/permissoes.ts`, `src/App.tsx`, `src/components/Layout.tsx`, `src/pages/Mais.tsx`, `src/pages/Painel.tsx`, `src/pages/Relatorios.tsx`, `src/lib/exportar/excel.ts`, `src/lib/exportar/pdf.ts`, `src/lib/dados/lgpd.ts`, `scripts/testar-sql.mjs`.

## Fora do escopo (follow-ups naturais)

- Recebimento pelo **PDV** com venda vinculada (`venda_id` já reservado) — depois que o dono quiser caixa único.
- WhatsApp automático / lembretes — fase T-034.
- Rastreio por série/IMEI no **estoque** e ligação com o IMEI da OS — T-035 (módulos independentes).
- Reserva de peça ao aprovar orçamento; garantia por item; fotos do aparelho; agenda por técnico (turnos/ocupação) e reagendar arrastando no calendário; serviços de terceiros; exibir entregues/canceladas do mês na agenda.
- Base de clientes reutilizável (deduplicação por telefone, fidelidade) — migra os textos da OS quando pedido.
- Edição de pagamento/correção após entrega; NFC-e na entrega — fase fiscal.

## Critérios de aceite (verificáveis pelo QA)

1. Recebimento: OS criada com número sequencial por empresa ("OS 000001") e comprovante de recebimento 80mm com termo de responsabilidade (acessórios, estado, prazo) — `e2e/app/servicos.spec.ts` cenário 1.
2. Fluxo: estoquista move a OS até `pronta` (avanço livre na cadeia, sem voltar); aprovação registrada com quem aprovou; itens travados após `aprovada` (cenário 2 e SQL caso 8).
3. **Garantia do produto (pedido do dono):** campo "Garantia (meses)" no cadastro persiste pelo RPC corrigido (produto com garantia recarrega no detalhe/edição; SQL caso novo do Passo 2); na OS, sugestão = **maior garantia entre as peças do estoque** (fallback 90; 0 configurado respeitado), editável antes da entrega; recibo mostra "Garantia até" coerente com o valor final (cenários 3-4).
4. Entrega: sem pagamento ≥ total **não entrega** com mensagem clara; com pagamento, entrega grava `SAIDA`s FEFO auditáveis em `movimentacoes` (documento "OS xxx"), reduz o saldo e emite recibo (cenários 4-5 e SQL casos 3-5).
5. Estoque insuficiente na entrega: erro claro citando o produto (SQL caso 5).
6. Papéis: caixa só entrega/pagamento; estoquista não entrega; dono/gerente tudo (cancelar com motivo obrigatório) (cenários 5-7, SQL casos 6-7).
7. Lista filtra por status e busca por cliente/IMEI/número; Painel mostra contagens (abertas/em execução, aguardando aprovação, prontas, atrasadas) com atalhos para lista e agenda; aba "Serviços" em Relatórios com Excel/PDF exportando a seção.
8. **Agenda (pedido do dono):** `/os/agenda` mostra as OS do mês no dia do `prazo_prometido` com a cor do grupo (Orçamento/Em andamento/Prontas), atrasada em destaque, "Sem prazo" em seção própria; toque abre o detalhe; navegação por mês (cenário 8).
9. Exportação LGPD do dono inclui ordens_servico (Passo 13).
10. `npm run lint`, `npm test`, `npm run test:sql` e o E2E novo verdes; `produtos`, `navegacao`, `painel-estoque`, `relatorios`, `lgpd` e `pdv` sem regressão.
