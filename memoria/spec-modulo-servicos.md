# Spec de UI — Módulo Serviços (Ordem de Serviço) — T-038

Designer · 15/11/2026 · branch `saas` · fonte: `memoria/plano-modulo-servicos.md` (14 passos, Decisões 1–14). Esta spec define interface e textos; **nada é implementado aqui**.

## 0. Decisões principais (resumo)

1. **Filtros da lista**: chips horizontais com rolagem (`.rolagem-x`, padrão do Estoque) — `Segmentado` não suporta 8 status; um chip dinâmico de grupo atende os atalhos do Painel.
2. **Agenda em 320–430 px**: calendário mensal **full-bleed** (células de ~45 px) com número do dia + bolinhas por grupo; **toque no dia seleciona** e o painel do dia abaixo lista as OS (alvo ≥44 px) — toque na OS abre o detalhe. Semana-selecionável descartada (esconde os outros dias e custa 2 toques).
3. **Relatórios (6ª aba)**: `Segmentado` ganha prop opt-in `rolavel` (flex + `.rolagem-x` no mobile, grid igualitário ≥640 px). Renomear "Movimentações" confunde; scroll é o padrão dos chips do Estoque.
4. **Barra inferior do celular: NÃO entra** "Serviços" (5 itens hoje; 6 colunas em 320 px aperta o botão central "Movimentar"). Compensação: item "Mais" acende em `/os*` e o card do Painel dá 1 toque.
5. **Senha do aparelho**: oculta por padrão no detalhe (toggle) e **nunca impressa** no comprovante (LGPD).

## 0.1 Primitivas reaproveitadas (evidência)

| Primitiva | Onde | Uso nesta spec |
|---|---|---|
| `Vazio` | `src/components/ui.tsx:39-50` | estados vazios de todas as telas |
| `Cabecalho` | `ui.tsx:334-344` | título + ações de cada página |
| `Modal` (portal, foco preso, Esc) | `ui.tsx:149-266` | cancelar, avançar status, confirmação de entrega, busca de peça |
| `Kpi` (clicável) | `ui.tsx:268-302` | Painel e Relatórios |
| `Aviso` (info/alerta/erro) | `ui.tsx:346-353` | avisos de trava, erros de entrega |
| `BadgeSituacao`/`BadgeReposicao` (ícone + texto, nunca só cor) | `ui.tsx:52-70,72-98` | padrão dos badges "Atrasada" |
| `.btn/.btn-primario/.btn-secundario/.btn-perigo` | `src/index.css:40-59` | todos os botões |
| `.campo/.rotulo` | `index.css:60-66` | formulários |
| `.cartao` | `index.css:67-69` | cartões de OS e cards |
| `.chip/.chip-ativo/.chip-inativo` + `.rolagem-x` | `index.css:70-78,93-99` | filtros por status |
| `.cupom-impressao` (80mm, só o cupom na impressão) | `index.css:142-165` | comprovante e recibo |
| `Cupom` (portal + `window.print()` após 50 ms) | `src/pages/pdv/Cupom.tsx:32-75`, `src/pages/pdv/MenuCaixa.tsx:112-118` | padrão dos impressos da OS |
| `NOME_FORMA` (Dinheiro, Pix, Débito, Crédito, Outros) | `src/pdv/venda.ts:7-16` | formas de pagamento da entrega |
| `numeroVenda` ("02-000123") | `venda.ts:112-113` | padrão do helper `numeroOS` → "OS 000123" |
| Chips com contagem + `aria-pressed` | `src/pages/Estoque.tsx:242-256` | filtros da lista de OS |
| Busca com lupa e `aria-label="Buscar"` | `Estoque.tsx:226-229`, `src/pages/Produtos.tsx:76` | busca da lista de OS |
| `Paginacao` (50 por página) | `src/components/Paginacao.tsx:14-46` | lista de OS e tabelas |
| Falha silenciosa com "—" | `src/pages/Painel.tsx:81-109,246-249` | card do Painel e KPIs |
| Estado/params na URL (`?filtro=`, `?q=`) | `Estoque.tsx:152-156`, `src/pages/Historico.tsx:27-34` | filtros compartilháveis |
| `BuscaProduto` (câmera/USB/manual) | `src/components/BuscaProduto.tsx:30-80` | adicionar peça do estoque no orçamento |

Cores: somente a paleta existente (`index.css:6-12` + famílias amber/sky/emerald/red de `ui.tsx:52-57,118-128`). **Nada de paleta nova.**

---

## 1. Lista `/os` — `src/pages/Servicos.tsx`

`Cabecalho` título **"Ordens de serviço"**, subtítulo **"Aparelhos recebidos, orçamentos e entregas."**, ações: `Agenda` (secundário, link `/os/agenda`) e `Nova OS` (primário, link `/os/nova`, só `pode.criarOrdem`).

**Busca** (padrão `Estoque.tsx:226-229`): placeholder exato `"Buscar cliente, IMEI ou número da OS"`, `aria-label="Buscar"`. Normaliza "OS 000123" → número (aceita digitar "123" ou "000123").

**Chips de status** (padrão `Estoque.tsx:242-256`; `role="group" aria-label="Filtrar por status"`; um filtro por vez; ponto de cor + contagem; `aria-pressed`; **`min-h-[44px]` em cada chip**):

> Todos · **Aberta** (ponto slate-400) · **Em diagnóstico** (sky-500) · **Aguardando aprovação** (amber-400) · **Aprovada** (amber-400) · **Em execução** (sky-500) · **Pronta** (emerald-500) · **Entregue** (emerald-500) · **Cancelada** (slate-400) · **Atrasadas** (ponto red-500) · **Sem prazo** (ponto slate-300)

- Os grupos de cor são os mesmos da Agenda (seção 2).
- Atalhos do Painel usam `?grupo=em_andamento` (aberta+em_diagnostico+em_execucao): nesse caso um **chip composto ativo** "Em andamento" aparece no início da barra, com contagem e `aria-label="Filtro de grupo: Em andamento (aberta, em diagnóstico e em execução). Toque para limpar"`. Os demais grupos são atendidos por chips estáticos (Aguardando aprovação = status único; Atrasadas/Sem prazo já existem).

**Cartão de OS** (`.cartao`, link inteiro para `/os/:id`, `py-4`, foco visível `ring-letreiro` como `.btn` em `index.css:42`; `data-os="000123" data-status="pronta"`):

> Linha 1: **OS 000123** (tabular) · badge de status · badge **"Atrasada"** quando vencida
> Linha 2: **Maria Souza** · (11) 99999-0000
> Linha 3: Celular · Samsung Galaxy A54 · IMEI `354899109583011` (font-mono)
> Linha 4: **Prazo: 12/11** ou **Sem prazo**

- Badge de status: texto + cor de fundo (sem ícone). **Badge "Atrasada"**: padrão `vencido` do `BadgeSituacao` (`ui.tsx:53`) — `bg-red-100 text-red-800 ring-red-200` + ícone `OctagonAlert`.
- Ordenação: atrasadas primeiro, depois prazo mais próximo, depois número desc.
- `Paginacao` com `rotulo="ordens de serviço"` (50/página).

**Textos exatos (vazios):**

> Sem OS nenhuma → `Vazio` ícone `Wrench`, título **"Nenhuma ordem de serviço"**, texto **"Receba o primeiro aparelho no botão Nova OS."** + botão **"Nova OS"**.
> Filtro/busca sem resultado → título **"Nada encontrado"**, texto **"Ajuste a busca ou os filtros."** (padrão `Estoque.tsx:375`).

---

## 2. Agenda `/os/agenda` — `src/pages/ServicosAgenda.tsx`

`Cabecalho` **"Agenda"**, subtítulo **"Ordens por prazo prometido. Entregues e canceladas não aparecem."** (Decisão 14). Ações: `Lista` (link `/os`) e `Nova OS`.

**Calendário mensal (mobile-first):**

- Cabeçalho do mês: **"novembro de 2026"** (`Intl.DateTimeFormat('pt-BR', {month:'long', year:'numeric'})`) com botões de ícone `‹`/`›` (`aria-label="Mês anterior"` / `"Mês próximo"`, ≥44 px).
- **Full-bleed no mobile** (`-mx-4`): 7 colunas × ~45 px por célula em 320 px → alvo de toque ≥44 px sem exceção.
- Célula: número do dia + contagem quando >0 + até 3 bolinhas (uma por grupo presente; se houver atrasadas, a bolinha do dia é **red-500** e a célula ganha fundo `bg-red-50 text-red-950` — padrão `.linha-vencido`, `index.css:82-84`). Hoje: anel `ring-letreiro`.
- Estrutura acessível: `role="grid"` / `role="row"` / `role="gridcell"` com **botão por dia**; `aria-label` do botão com resumo:

> `aria-label="5 de novembro: 2 ordens, 1 atrasada"`

- **Toque no dia seleciona** → painel do dia abaixo do calendário lista as OS daquele dia (título **"terça-feira, 5 de novembro"**, `formatarData` estendido com dia da semana); cada linha é um alvo ≥44 px (`py-3`) que abre `/os/:id` — o requisito "toque na OS abre o detalhe" (Passo 7) é cumprido no painel do dia, não dentro da célula de 45 px. Dia selecionado por padrão: hoje.

**Grupos/cor (exatos, Decisão 14):** "Orçamento" = `aguardando_aprovacao` + `aprovada` → **amber-400**; "Em andamento" = `aberta` + `em_diagnostico` + `em_execucao` → **sky-500**; "Prontas" = `pronta` não entregue → **emerald-500**; "Atrasadas" = prazo vencido, não entregue/cancelada → **red-500** em destaque.

**Legenda com contagens** (acima do calendário, `<ul>`): itens no formato:

> **Orçamento (3)** · **Em andamento (5)** · **Prontas (2)** · **Atrasadas (1)**

**Seção "Sem prazo"** (abaixo do painel do dia; só aparece quando existe ≥1): título **"Sem prazo (2)"** com as mesmas linhas de OS do painel do dia.

**Navegação por mês**: só `‹`/`›`; sem arrastar (Decisão 14 — reagendar é follow-up).

**Textos exatos (vazios):**

> Painel do dia sem OS → **"Nenhuma ordem com prazo neste dia."**
> Mês inteiro sem OS com prazo → `Vazio` ícone `CalendarDays`, título **"Nada previsto para novembro"**, texto **"Troque de mês ou veja a lista de ordens."**
> Sem OS sem prazo → a seção fica oculta (não renderiza).

---

## 3. Recebimento `/os/nova` — `src/pages/ServicosRecebimento.tsx`

`Cabecalho` **"Receber aparelho"**, subtítulo **"Abre a ordem de serviço e imprime o comprovante."** Formulário em seções (`.cartao p-4`), 1 coluna no mobile, pares em `grid-cols-2` ≥sm; `autoFocus` em "Nome do cliente"; ordem de foco = ordem visual.

**Cliente:** `Nome do cliente *` (placeholder "Ex.: Maria Souza") · `Telefone` ("Ex.: (11) 99999-0000") · `CPF ou CNPJ` ("Opcional").
**Aparelho:** `Tipo de aparelho *` — `<input list>` (datalist: Celular, Notebook, Tablet, Televisão, Eletrodoméstico, Outro; placeholder "Ex.: Celular") · `Marca e modelo *` ("Ex.: Samsung Galaxy A54") · `IMEI ou nº de série` (font-mono, "Ex.: 354899109583011") · `Cor` ("Opcional") · `Senha de desbloqueio (opcional)` + `Aviso` tom="alerta":

> **A senha é um dado sensível:** fica gravada na ordem de serviço para uso interno da loja e **não aparece no comprovante impresso**.

**Estado e problema:** `Acessórios entregues` ("Ex.: carregador, capa, cartão de memória") · `Estado de conservação` ("Ex.: riscos na tampa traseira") · `Defeito relatado *` (textarea, "Ex.: não liga; tela quebrada") · `Prazo prometido` (date, dica **"Data prometida ao cliente. Aparece na agenda."**) · `Técnico responsável` ("Opcional").

**Validações (mensagens exatas, junto ao campo com `aria-invalid` + `aria-describedby` e foco no primeiro campo com erro):**

> **"Informe o nome do cliente."**
> **"Informe o tipo de aparelho."**
> **"Informe a marca e o modelo."**
> **"Informe o defeito relatado."**

**Salvar:** botão primário grande **"Receber aparelho"** (loading **"Salvando..."**). Sucesso → toast **"OS 000001 recebida."**, navega para `/os/:id` e o **comprovante de recebimento** abre e imprime (portal `.cupom-impressao` + `window.print()` após 50 ms, padrão `MenuCaixa.tsx:112-118`). Falha → `Aviso` tom="erro" com a mensagem crua do banco.

---

## 4. Detalhe `/os/:id` — `src/pages/ServicosDetalhe.tsx`

**Cabeçalho:** `h1` **"OS 000123"** · badge de status · badge **"Atrasada"** quando vencida · subtítulo **"Maria Souza · Celular Samsung Galaxy A54"**. Ações (botões de ícone ≥44 px): `Imprimir comprovante` (`aria-label="Imprimir comprovante de recebimento"`), `Copiar mensagem` (quando `aguardando_aprovacao` ou `pronta`), `Cancelar` (só `pode.cancelarOrdem`; ícone `X`? — texto **"Cancelar"** com estilo `btn-perigo` pequeno).

**Próximo passo (avanço livre na cadeia, Decisão 6):** botão primário do passo natural + botão fantasma **"Avançar para outro status"** (abre modal "Avançar status" com radios dos status posteriores disponíveis, pré-selecionado o passo natural, botões **"Voltar"** / **"Avançar"**; status anteriores nunca aparecem — volta é proibido).

| Status atual | Botão primário (texto exato) |
|---|---|
| `aberta` | **"Iniciar diagnóstico"** |
| `em_diagnostico` | **"Enviar orçamento"** |
| `aguardando_aprovacao` | **"Cliente aprovou o orçamento"** |
| `aprovada` | **"Iniciar execução"** |
| `em_execucao` | **"Marcar como pronta"** |
| `pronta` | (botão **"Entregar"** fica na seção 5) |

Ação `entregue`/`cancelada`: sem botões de avanço. Toasts: **"Status atualizado."** / aprovação: **"Aprovação registrada."**.

**Timeline dos marcos** (lista vertical com bolinha preenchida/vazia; rótulos exatos):

> **Recebida** (`criada_em`) · **Orçamento enviado** (`orcado_em`) · **Orçamento aprovado** (`aprovada_em`, + **"por {nome}"** quando houver `aprovada_por_nome`) · **Pronta** (`pronta_em`) · **Entregue** (`entregue_em`, + **"por {entregue_por_nome}"**) · **Cancelada** (`cancelada_em`, + motivo)

Marco futuro: texto **"Pendente"** em cinza. Cancelada mostra o motivo logo abaixo do marco.

> **Requisito de dado (para o Passo 1):** "registrada com quem aprovou" (Passo 9 do plano) exige a coluna `aprovada_por_nome text` — mesma fórmula de `entregue_por_nome`. Sem ela, a timeline mostra só a data.

**Seção "Diagnóstico":** mostra os dados recebidos — cliente/telefone/doc; aparelho (tipo, marca/modelo, IMEI mono, cor); `Senha de desbloqueio` **oculta** (`••••••`) com toggle `aria-label="Mostrar senha"` / `"Ocultar senha"`; acessórios; estado. Campo `Defeito relatado` (textarea) editável por quem tem `moverOrdem` enquanto status anterior a `pronta`, com botão **"Salvar diagnóstico"** (aparece quando há mudança local).

**Seção "Orçamento":** `Mão de obra (R$)` (placeholder **"R$ 0,00"**) · itens (lista: descrição, `Quantidade`, `Preço unitário (R$)`, total; tag de origem **"Estoque"**/**"Avulsa"** estilo `chip-inativo`) · `Desconto (R$)`. Botões (só editável + `moverOrdem`): **"Adicionar peça do estoque"** (abre `BuscaProduto` num `Modal`, padrão do PDV) e **"Adicionar item avulso"** (form inline: descrição, quantidade, preço, botão **"Adicionar"**). Remover item: `aria-label="Remover {descrição}"`. Resumo: **Subtotal** (mão de obra + itens) · **Desconto** · **Total** (destaque, tabular-nums). Edições locais são salvas com barra fixa (padrão sticky `Estoque.tsx:315`): **"Salvar orçamento"** + **"Descartar"**.

**Trava pós-aprovação** (status `aprovada`→`entregue`): campos `disabled` + `Aviso` tom="alerta" com texto exato:

> **Orçamento aprovado pelo cliente:** itens, mão de obra e desconto não podem mais mudar.

**Copiar mensagem** (`navigator.clipboard` + toast **"Mensagem copiada. Cole no WhatsApp do cliente."**). Textos exatos das mensagens (variantes entre chaves; `{total}` em `formatarReais`, `{numero}` = "OS 000123", `{aparelho}` = "tipo marca_modelo"):

> **Orçado (base):**
> `Olá, {cliente_nome}! O orçamento da OS {numero} ({aparelho}) ficou em {total}. Podemos começar o conserto?`
> **Com prazo:** acrescenta ` Prazo prometido: {data}.`
> **Com telefone:** acrescenta ` Se preferir, fale com a loja pelo telefone {telefone}.`
> **Pronto (base):**
> `Olá, {cliente_nome}! A OS {numero} ({aparelho}) está pronta. Total: {total}. Pode retirar quando puder.`
> **Com garantia:** acrescenta ` Garantia até {data}.` (entre "Total" e "Pode retirar")

Os testes de `servicos.test.ts` cobrem as 4 combinações de orçado (com/sem prazo × com/sem telefone).

**Cancelar** (dono/gerente; `Modal`): título **"Cancelar ordem de serviço"**, corpo:

> A OS fica registrada como **Cancelada**, com o seu nome, e não pode mais ser alterada.

Campo `Motivo *` (textarea, placeholder **"Ex.: cliente não aprovou o orçamento"**), erro de campo **"Descreva o motivo (mínimo de 3 letras)."**, botões **"Voltar"** / **"Cancelar OS"** (`btn-perigo`, disabled <3 caracteres). Toast: **"OS 000123 cancelada."**

---

## 5. Entrega + pagamento (seção do detalhe)

Visível só quando `pode.entregarOrdem` **e** status `pronta` (dono/gerente/caixa — `permissoes.ts:54`). Depois de entregue, a seção vira card **"Entregue em {data} por {nome}"** com botão de ícone `Imprimir recibo` (`aria-label="Imprimir recibo"`).

**Resumo** (linhas com rótulos exatos): **Itens** · **Mão de obra** · **Desconto** · **Total**.
**Trio** (padrão `Venda.tsx:736-740`): **Total** · **Pago** · **Falta** (destaque amber; quando 0 → **"Tudo pago"**).
**Pagamentos registrados:** lista forma + valor + remover (`aria-label="Remover pagamento"`).
**Registrar:** grid de 5 formas (padrão `Venda.tsx:741-752`) com os rótulos de `NOME_FORMA` — **Dinheiro · Pix · Débito · Crédito · Outros** — campo `Valor recebido (deixe vazio para o que falta)` (mesmo texto do PDV, `Venda.tsx:755`) e botão **"Registrar pagamento"** (grava na hora em `os_pagamentos`). Valor acima do total: aviso informativo **"O total registrado passou do valor da OS. Dê o troco em dinheiro."** (não bloqueia).
**Botão "Entregar"**: `btn-primario btn-grande w-full`, **disabled enquanto falta > 0**. Abre confirmação (`Modal`, texto exato):

> Entregar o aparelho para {cliente_nome}? As peças do estoque são baixadas agora e a OS {numero} não pode mais ser alterada.

Botões: **"Voltar"** / **"Entregar"**.

**Erros do banco aparecem como estão** (`Aviso` tom="erro", sem prefixo):

> `Registre o pagamento de R$ 50,00 antes de entregar.`
> `Estoque insuficiente: Tela iPhone 12 — necessário 1, disponível 0.`

**Recibo pós-entrega** (portal + `window.print()`; `data-recibo-os="000001"`): itens (formato do `Cupom`, `Cupom.tsx:46-57`), **TOTAL R$**, pagamentos por forma, **"Garantia até {data}"** (negrito; linha omitida se `garantia_dias` for nulo), e o termo:

> O aparelho foi entregue funcionando. A garantia cobre o conserto realizado e não cobre mal uso, queda ou água.
> Obrigado pela preferência!

---

## 6. Comprovante de recebimento 80mm

Mesma classe `.cupom-impressao` (`index.css:142-165`), portal no `<body>`, `window.print()`; `data-comprovante-os="000001"`. **Linha a linha:**

```
{empresa}                                    ← centro, negrito 13px
*** DOCUMENTO SEM VALOR FISCAL ***           ← centro, negrito (padrão Cupom.tsx:40)
OS 000001                                    ← centro, negrito
{data/hora} · Recebido por {nome}
─────────────────────────────────────
CLIENTE: {cliente_nome}
TELEFONE: {cliente_telefone}                 ← só se houver
CPF/CNPJ: {cliente_documento}                ← só se houver
APARELHO: {tipo} {marca_modelo}
IMEI/SÉRIE: {imei}                           ← só se houver
COR: {cor}                                   ← só se houver
ACESSÓRIOS: {acessorios}                     ← "Nenhum" quando vazio
ESTADO: {estado}                             ← só se houver
DEFEITO: {defeito_relatado}
PRAZO: {data}                                ← ou "A combinar"
─────────────────────────────────────
TERMO DE RESPONSABILIDADE
Declaro que deixei para conserto o aparelho descrito acima, no estado de
conservação indicado, e que os acessórios listados foram entregues com ele.
Não nos responsabilizamos por dados, arquivos ou senhas armazenados no
aparelho, que podem ser perdidos durante o conserto. O serviço só começa
após a aprovação do orçamento.
Assinatura do cliente: ______________
Assinatura da loja: ______________
```

**A senha de desbloqueio não é impressa** (decisão LGPD; ela vive só na OS).

---

## 7. Garantia por produto

**`src/components/ProdutoForm.tsx`** — campo logo abaixo do bloco "Conteúdo por embalagem" + dica (`ProdutoForm.tsx:202-205`):

> Rótulo: **"Garantia (meses)"** · `inputMode="numeric"` · placeholder **"Opcional"** · dica exata: **"Usada para sugerir a garantia nas ordens de serviço."**
> Vazio → salva `null` (sem garantia configurada). Erro de campo: **"Garantia inválida."** (não numérico, negativo ou decimal).

**Na OS** — campo **"Garantia (dias)"** aparece quando status = `pronta` (Passo 9), pré-preenchido com `sugerirGarantia(itens)` e editável até a entrega. Dicas exatas conforme a origem da sugestão (Decisão 11; conversão fixa **1 mês = 30 dias**):

> Peças com garantia: **"Sugestão: maior garantia entre as peças ({n} dias)."**
> Nada configurado: **"Nenhuma peça tem garantia configurada: sugeridos 90 dias."**
> Garantia 0 configurada: **"Uma das peças está configurada sem garantia: sugeridos 0 dias."**

Salvamento: botão **"Salvar garantia"** ao lado do campo (aparece quando o valor difere do salvo). O recibo imprime **"Garantia até {data}"** = entrega + dias finais.

---

## 8. Painel — card "Ordens de serviço"

Card `.cartao` no padrão "Resultado de hoje" (`Painel.tsx:265-290`), `aria-label="Ordens de serviço"`, `data-card="ordens"`. Cabeçalho: título **"Ordens de serviço"** + links pequenos **"Lista"** (`/os`), **"Agenda"** (`/os/agenda`) e **"Nova OS"** (`pode.criarOrdem`).

Grid de 4 `Kpi` clicáveis (2×2 no mobile, 4 em ≥sm) — contagens exatas por grupo (Decisão 12), falha silenciosa mostra **"—"** (`Painel.tsx:81-109`):

> **Em andamento** — detalhe "Abertas, em diagnóstico e em execução" → `/os?grupo=em_andamento`
> **Aguardando aprovação** — detalhe "Orçamentos à espera do cliente" → `/os?status=aguardando_aprovacao`
> **Prontas** — detalhe "À espera de entrega e pagamento" → `/os?status=pronta`
> **Atrasadas** (tom vermelho) — detalhe "Prazo vencido, não entregues" → `/os?filtro=atrasada`

**Estado vazio (0 OS):** no lugar do grid,

> **"Nenhuma ordem de serviço ainda."** — **"Toque em Nova OS para receber o primeiro aparelho."** + botão **"Nova OS"**

---

## 9. Relatórios — aba "Serviços"

**6ª aba em 320 px (decisão):** `Segmentado` (`ui.tsx:304-332`) ganha prop opt-in **`rolavel`** — com ela, em `<640px` o container vira `flex overflow-x-auto rolagem-x` com botões `shrink-0` (aba ativa rola para visível); em ≥640px mantém o grid igualitário. `Relatorios.tsx:518` usa `rolavel`; os outros 5 usos (`Login.tsx:89`, `Movimentar.tsx:91`, `Vendas.tsx:156`, `Divergencias.tsx:59`) **não mudam**. Justificativa: 6 rótulos somam ~490 px > 288 px úteis em 320 px; renomear "Movimentações" confunde usuário; scroll é o padrão já usado nos chips do Estoque (`Estoque.tsx:242`). Atualizar o comentário de `Relatorios.tsx:25`.

`OPCOES_ABA` acrescenta `{ valor: 'servicos', rotulo: 'Serviços' }` (8 car.); `SECOES` acrescenta `['servicos', 'Serviços']` (`Relatorios.tsx:34-40`); `Secoes`/`contagensSecoes` idem (`:267-282`).

**KPIs do período** (mesmo período global da página; `formatarReais`):

> **Recebidas** (OS criadas no período) · **Entregues** (tom verde) · **Canceladas** (tom vermelho) · **Faturamento de serviços** (pagamentos das OS entregues no período)

**Tabelas:** "Por status" — colunas **Status | Ordens | Faturamento** (faturamento só na linha Entregue; demais "—"). "Por técnico" — colunas **Técnico | Recebidas | Entregues | Faturado** (linha "—" para OS sem técnico: rótulo **"Sem técnico"**).

**Textos exatos (vazios):**

> `Vazio` ícone `Wrench`, título **"Sem ordens de serviço no período."**, texto **"Nenhuma OS foi recebida neste intervalo."**

**Excel/PDF** (`excel.ts`/`pdf.ts`): página/planilha **"Serviços"**, uma linha por OS do período, colunas exatas:

> **OS · Cliente · Aparelho · Status · Recebida em · Prazo · Entregue em · Técnico · Total**

Linha final **TOTAL** com o faturamento do período. Seção vazia exportada com contagem **"(0)"** (padrão T-022, `Relatorios.tsx:467-472`).

---

## 10. Navegação

**Menu lateral** (`Layout.tsx:130-142`): item **"Serviços"**, ícone lucide **`Wrench`**, posição **logo após "Vendas e caixa"** (ambos são atendimento de balcão), visível a todos os papéis (ações gateadas por permissão).

**Mais** (`Mais.tsx:56-64`): `Item` **"Serviços"** — texto **"Ordens de serviço: recebimento, orçamento e entrega"** — posicionado logo após "Vendas".

**Barra inferior do celular: NÃO entra.** Justificativa: hoje são 5 itens (`grid-cols-5`, `Layout.tsx:271`) e o 6º coluna em 320 px deixa células de ~53 px, aperta os rótulos de 11 px e reduz a área visual do botão central "Movimentar" (`Layout.tsx:275-290`) — a ação mais crítica do app. "Serviços" fica a 1 toque (card do Painel) e 2 toques (Mais). Para a barra acender corretamente, **`/os` entra no `ativoEm` do item "Mais"** (`Layout.tsx:297`). Follow-up registrado: se o dono pedir, "Serviços" entra no lugar de "Histórico" (que migra para o Mais).

**Rotas** (`App.tsx:56-73`): `/os`, `/os/nova`, `/os/agenda`, `/os/:id` — **`/os/nova` e `/os/agenda` declaradas antes de `/os/:id`**.

---

## 11. A11y (regras transversais obrigatórias)

- **Alvos ≥44×44 px:** chips de status e chip de grupo (`min-h-[44px]`); dias do calendário (full-bleed ⇒ ~45 px, altura mínima 44); itens de lista/cartões (`py-4`/`py-3`); botões de ícone (`p-2.5` mínimo ≈44 px); formas de pagamento (padrão do PDV já ok); links "Lista/Agenda/Nova OS" do Painel (`py-2 px-2`).
- **`aria-label` em todo botão de ícone** (labels exatos): `Imprimir comprovante de recebimento` · `Imprimir recibo` · `Copiar mensagem do orçamento` / `Copiar mensagem de aparelho pronto` · `Mostrar senha` / `Ocultar senha` · `Remover pagamento` · `Remover {descrição}` · `Mês anterior` · `Mês próximo` · `Fechar` (herdado do `Modal`, `ui.tsx:250`).
- **Foco:** ordem de foco = ordem visual; `autoFocus` no primeiro campo obrigatório de cada formulário; foco visível herdado do `.btn` (`ring-letreiro`, `index.css:42`); modal prende o foco e devolve ao fechar (já pronto, `ui.tsx:172-215`).
- **Erro de campo:** `aria-invalid` + texto `<p id>` referenciado por `aria-describedby` + foco movido ao primeiro campo inválido; erro geral do formulário em `Aviso` tom="erro".
- **Nunca só cor:** badges e bolinhas da agenda sempre com texto/contagem associada (padrão `BadgeReposicao`, `ui.tsx:85`); "Atrasada" usa red-100/red-800 como `vencido` (`ui.tsx:53`) — contraste AA garantido pela paleta existente.
- `aria-pressed` nos chips; `role="grid/row/gridcell"` + `aria-label` por dia na agenda; `aria-live="polite"` nos toasts (já existente) e no trio Total/Pago/Falta.

---

## 12. Specs de teste afetadas

**Novo: `e2e/app/servicos.spec.ts`** (Passo 14; seeding `e2e/apoio/supabase.ts`, `servidor.comoUsuario`):

1. **Recebimento:** dono cria OS → lista mostra **"OS 000001"** + **"Aberta"**; comprovante `[data-comprovante-os]` contém **"TERMO DE RESPONSABILIDADE"** e **"A combinar"** quando sem prazo; sem a senha digitada.
2. **Fluxo do estoquista** até `pronta` com peça do estoque: botões **"Iniciar diagnóstico"** → **"Enviar orçamento"** → **"Cliente aprovou o orçamento"** → **"Iniciar execução"** → **"Marcar como pronta"**; **"Copiar mensagem"** → toast **"Mensagem copiada. Cole no WhatsApp do cliente."**; orçamento mostra o aviso de trava após aprovada.
3. **Garantia sugerida:** produto com 12 meses → dica **"Sugestão: maior garantia entre as peças (360 dias)."**; sem garantia configurada → **"sugeridos 90 dias"**; campo editável antes de entregar.
4. **Entrega pelo caixa:** Dinheiro, status **"Entregue"**, estoque reduzido (conferir no Estoque), recibo `[data-recibo-os]` com **"Garantia até"**.
5. **Entrega sem pagamento:** aviso casa com `/Registre o pagamento de R\$ .* antes de entregar\./` e a OS não muda de status.
6. **Filtro e busca:** chip **"Atrasadas"** filtra; busca por IMEI e por telefone encontra a OS.
7. **Cancelar exige motivo:** botão **"Cancelar OS"** disabled até 3 caracteres.
8. **Agenda:** OS com prazo aparece no dia certo com a cor do grupo (Orçamento/Em andamento/Prontas), atrasada com fundo vermelho destacado, OS sem prazo na seção **"Sem prazo"**, toque no dia abre o painel e toque na OS abre o detalhe.

**Regressão (o que muda em cada):**

- `navegacao.spec.ts`: novo item **"Serviços"** no menu lateral e no Mais (rotas novas não podem quebrar o menu nem o fallback `*` → `/painel`); barra inferior **intacta** (o spec atual não deve ver mudança).
- `painel-estoque.spec.ts`: card **"Ordens de serviço"** novo no Painel (com estado vazio "Nenhuma ordem de serviço ainda." quando 0) — card "Resultado de hoje" e KPIs de vendas intactos.
- `relatorios.spec.ts`: **6 abas** (a 5ª "Lucro" não mudou; a 6ª "Serviços" entra) com scroll no mobile; seção **"Serviços"** no Excel/PDF com contagem "(0)"; abas existentes com as mesmas KPIs/tabelas.
- `produtos.spec.ts`: campo **"Garantia (meses)"** no formulário persiste e recarrega; produtos existentes salvam igual (campo opcional).
- `lgpd.spec.ts`: JSON do dono passa a conter `ordens_servico`, `os_itens`, `os_pagamentos` (Passo 13).
- `pdv.spec.ts`: **intocado** — só conferir (nenhum arquivo de PDV muda).

---

## Fora do escopo desta spec (follow-ups, do plano)

Reagendar arrastando no calendário; entregues/canceladas na agenda; agenda por técnico; WhatsApp automático (T-034); recebimento pelo PDV; reserva de peça; garantia por item; fotos do aparelho; edição de pagamento após entrega.
