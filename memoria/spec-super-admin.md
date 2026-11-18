# Spec de UI — Painel Super Admin (T-039)

Designer · 18/11/2026 · branch `saas` · fonte: `memoria/plano-super-admin.md` (F1–F5 + D1–D4) e `memoria/espec-super-admin.md` (verbatim do dono). Esta spec define interface e textos; **nada é implementado aqui** e **nenhum arquivo em `src/` é alterado**.

## 0. Decisões principais (resumo)

1. **Área admin na mesma SPA**, rotas `/admin*`, lazy-loaded, montadas **antes** do gate de empresa (`App.tsx:36-47`), mesma sessão de login. A proteção real é server-side (D1 do plano: `app.sou_super_admin()`); a rota apenas não aparece para quem não é admin.
2. **Layout próprio** (`AdminLayout`) — não reusa `Layout.tsx`, que depende de `EmpresaProvider`/`loja`/`pode`. Banner persistente **"Área da plataforma — você está fora da visão de uma loja."** (tom info) em todas as telas admin.
3. **Menu admin separado**, 5 itens: Visão geral (`/admin`) · Empresas (`/admin/empresas`) · Logs (`/admin/logs`) · Incidentes (`/admin/incidentes`) · Auditoria (`/admin/auditoria`). Nenhum item de loja.
4. **Navegação de saída**: link discreto **"Voltar para a loja"** (quando o admin também é membro de alguma empresa) + botão **"Sair"**. Admin puro (sem empresa) vê só "Sair".
5. **Primitivas 100% reaproveitadas** (`ui.tsx`, `index.css`) — nada de componente novo de UI; tabelas simples com `.cartao` + `Paginacao`.
6. **Cores**: somente paleta existente (`index.css:6-12` + famílias amber/sky/emerald/red de `ui.tsx:52-57,118-128`). **Nada de paleta nova.**
7. **Inspeção (F4)**: somente leitura, sessão de 60 min com banner fixo + botão "Encerrar agora"; **nenhum botão de gravação** nas telas de inspeção. Primeira escrita administrativa é só o ajuste de assinatura, com motivo obrigatório.
8. **IA (F5)**: botão "Analisar com IA" sob demanda, resultado em linguagem clara, histórico de análises; modo sem-chave devolve resposta fixa para manter e2e verde.
9. **A11y**: alvos ≥44 px, `aria-label` em botões de ícone, foco visível, erro de campo com `aria-invalid` + `aria-describedby`.
10. **Mobile-first**: tabelas viram lista de cartões empilhados em <640 px; filtros em chips roláveis (`.rolagem-x`).

## 0.1 Primitivas reaproveitadas (evidência)

| Primitiva | Onde | Uso nesta spec |
|---|---|---|
| `Vazio` | `src/components/ui.tsx:39-50` | empty states de todas as telas admin |
| `Cabecalho` | `ui.tsx:344-354` | título + ações de cada página admin |
| `Modal` (portal, foco preso, Esc) | `ui.tsx:149-266` | abrir inspeção, ajustar assinatura, criar incidente, analisar com IA, detalhe de grupo |
| `Kpi` (clicável) | `ui.tsx:268-302` | indicadores do painel global |
| `Aviso` (info/alerta/erro) | `ui.tsx:356-363` | banner "área da plataforma", modo inspeção, avisos de erro |
| `Segmentado` | `ui.tsx:304-342` | seletor de período/gravidade nas telas |
| `Paginacao` (50/página) | `src/components/Paginacao.tsx:14-46` | listas longas (logs, empresas, incidentes, auditoria) |
| `BadgeSituacao` (ícone + texto) | `ui.tsx:52-70` | badges de gravidade/status |
| `.btn/.btn-primario/.btn-secundario/.btn-perigo/.btn-fantasma/.btn-grande` | `src/index.css:40-59` | todos os botões |
| `.campo/.rotulo` | `index.css:60-66` | formulários |
| `.cartao` | `index.css:67-69` | cartões de empresa, KPIs, grupos |
| `.chip/.chip-ativo/.chip-inativo` + `.rolagem-x` | `index.css:70-78,93-99` | filtros de logs/incidentes |
| `Carregando` | `ui.tsx:30-37` | loading das telas |
| `Avatar` | `src/components/Avatar.tsx` | identificação do admin |
| `formatarData`/`formatarReais`/`hojeISO` | `src/lib/formato.ts` | formatação |
| `traduzirErro` | `src/lib/dados/cliente.ts:30-61` | mensagens de erro |
| `Paginacao` rótulo | `Paginacao.tsx:14-46` | listas admin |

Cores: somente a paleta existente (`index.css:6-12` + famílias amber/sky/emerald/red de `ui.tsx:52-57,118-128`). **Nada de paleta nova.**

---

## 1. Área admin — rotas, layout, menu, banner

### 1.1 Rotas (`src/App.tsx`)

Montadas **antes** do gate de empresa (`App.tsx:36-47`), em lazy chunk separado:

```
/admin                  → AdminPainel
/admin/empresas         → AdminEmpresas
/admin/empresas/:id     → AdminEmpresa
/admin/logs             → AdminObservabilidade
/admin/incidentes       → AdminIncidentes
/admin/incidentes/:id   → AdminIncidenteDetalhe
/admin/auditoria        → AdminAuditoria
```

`/admin*` renderiza `AdminLayout` (sem `EmpresaProvider`/`DadosProvider` da loja). Se o usuário não for super admin, a tela renderiza e **o servidor nega os dados (42501)** — a UI mostra "Sem acesso" e um e2e prova isso (§10).

### 1.2 `AdminLayout` (novo: `src/pages/admin/AdminLayout.tsx`)

- Cabeçalho fixo superior (mobile) / sidebar (desktop) com `Marca` (`Layout.tsx:65-75`) reaproveitada, porém `subtitulo="área da plataforma"` e `titulo="ponto admin"`.
- **Banner persistente** (primeira coisa após o cabeçalho, em todas as rotas admin):
  > `Aviso` tom="info": **"Área da plataforma."** Você está fora da visão de uma loja. Tudo o que você consultar aqui é registrado em auditoria.
- Menu de 5 itens (ícones lucide): `LayoutDashboard` Visão geral · `Building2` Empresas · `Activity` Logs · `Siren` Incidentes · `ScrollText` Auditoria.
- Rodapé da sidebar: `Avatar` + nome + rótulo **"Super admin"** + botão `LogOut` (aria-label="Sair") — padrão `Layout.tsx:200-209`.
- Link discreto **"Voltar para a loja"** (ícone `ArrowLeft`) só quando `admin_sou_admin()` e o usuário tem ao menos uma empresa (verificado por RPC `admin_tem_empresa()`); caso contrário oculto.
- Sem seletor de empresa/loja (não há contexto de loja ativa na área admin).
- Sem barra inferior de celular (a área admin é desktop-first; no mobile usa menu hambúrguer com os 5 itens).

### 1.3 Link de entrada no app da loja (`src/components/Layout.tsx`)

Apenas quando `admin_sou_admin()` retorna true, o item **"Painel da plataforma"** (ícone `ShieldCheck`, rota `/admin`) aparece no final do menu lateral (`Layout.tsx:131-144`) e no "Mais" (`Mais.tsx:56-64`). Texto do item no Mais: **"Painel da plataforma: visão global e suporte"**. Não aparece para lojista (prova SQL negativa + e2e).

### 1.4 Estado vazio de acesso negado

Quando `/admin` é aberto por não-admin (ou quando uma RPC retorna 42501):

> `Vazio` ícone `ShieldX`, título **"Sem acesso"**, texto **"Esta área é restrita aos administradores da plataforma."** + link **"Voltar para o painel"** (`/painel`).

---

## 2. Painel global `/admin` — `AdminPainel.tsx`

`Cabecalho` título **"Visão geral da plataforma"**, subtítulo **"Todas as empresas, status e saúde em um só lugar."** Ações: **"Atualizar"** (ícone `RefreshCw`, aria-label="Atualizar dados").

### 2.1 Indicadores (grid de `Kpi`, 2×3 mobile, 3×2 ≥md)

| # | Título | Valor | Tom | Detalhe |
|---|---|---|---|---|
| 1 | Empresas cadastradas | total | neutro | "desde o início" |
| 2 | Empresas ativas | ativas | verde | "assinatura em dia" |
| 3 | Trial vencendo (7d) | count | amarelo | "vence nos próximos 7 dias" |
| 4 | Suspensas | count | vermelho (se >0) | "sem acesso a lançamentos" |
| 5 | Erros (7d) | count | vermelho (se >0) | "ocorrências em todas as lojas" |
| 6 | Incidentes críticos abertos | count | vermelho (se >0) | "precisam de atenção" — clicável → `/admin/incidentes?filtro=critico` |

Falha silenciosa: valor **"—"** (padrão `Painel.tsx:81-109`).

### 2.2 Lista de empresas (`.cartao` + `Paginacao`, 25/página)

Colunas (desktop) / cartão empilhado (mobile):

> **Empresa** · **Segmento** · **Estado da assinatura** (badge: Trial/Ativa/Cancelada/Cortesia + data) · **Lojas** · **Usuários** · **Vendas 7d** (count + faturamento) · **Última atividade** · **Erros 7d** · **Divergências abertas** · ações.

Badge de estado (ícone + texto, nunca só cor): Trial = amber (`Clock`), Ativa = emerald (`CircleCheck`), Atrasada = amber (`Clock`), Somente leitura/Suspensa/Cancelada = red (`OctagonAlert`).

Ações por linha (botões de ícone ≥44 px): **"Ver detalhe"** (`Eye`, aria-label="Ver detalhe da empresa {nome}") → `/admin/empresas/:id`; **"Inspecionar"** (`Search`, aria-label="Inspecionar a loja {nome}") → abre modal "Abrir inspeção" (§6); **"Ajustar assinatura"** (`CreditCard`, aria-label="Ajustar assinatura da empresa {nome}") → modal (§6.4).

Ordenação padrão: erros 7d desc, depois nome. Busca por nome (placeholder **"Buscar empresa"**, aria-label="Buscar").

### 2.3 Atalhos (linha de botões secundários)

- **"Ver todos os logs"** → `/admin/logs`
- **"Ver incidentes"** → `/admin/incidentes`
- **"Auditoria"** → `/admin/auditoria`

### 2.4 Empty state

> `Vazio` ícone `Building2`, título **"Nenhuma empresa cadastrada ainda."**, texto **"As empresas aparecem aqui assim que forem criadas."**

### 2.5 Card "Incidentes críticos abertos" (se count > 0)

`.cartao` com fundo `bg-red-50` (tom erro), lista dos 5 mais recentes (título · empresa · "há {tempo}") + link **"Ver todos"**. Se 0, o card não renderiza (em vez de empty state).

---

## 3. Tela de empresa `/admin/empresas/:id` — `AdminEmpresa.tsx`

`Cabecalho` título = nome da empresa, subtítulo = **"{segmento} · cadastrada em {data}"**. Ações: **"Inspecionar"** (primário) · **"Ajustar assinatura"** (secundário) · **"Voltar"** (fantasma, → `/admin/empresas`).

### 3.1 Seções (`.cartao` empilhados, gap-4)

1. **Assinatura** (card): status, plano, trial_ate/pago_ate, "estado calculado" (ativa/atrasada/somente_leitura/suspensa), botão **"Ajustar assinatura"**.
2. **Lojas** (tabela): nome · endereço · ativa · usuários · última venda · divergências abertas. Cada linha: **"Inspecionar esta loja"** (ícone `Search`).
3. **Equipe** (tabela): nome · e-mail · papel · ativo · último acesso. (admin vê nome/e-mail — decisão §7-D5 aprovada.)
4. **Convites pendentes** (lista): e-mail · papel · enviado em · expira em · status.
5. **Vendas (7d)** (mini-gráfico de barras por dia, padrão `Painel.tsx:324-349`, mas por loja): total por dia + total do período.
6. **Últimos erros (20)** (lista compacta): data/hora · gravidade (badge) · módulo · mensagem (truncada) · loja · link **"Ver no log"** → `/admin/logs?fingerprint=...`.
7. **Últimas movimentações (20)** (lista): data/hora · tipo (badge) · produto · quantidade · usuário.
8. **Divergências abertas** (se houver): lista com link para `/admin` (somente leitura — a resolução fica no app da loja).

### 3.2 Empty states por seção

- Lojas: **"Nenhuma loja cadastrada."**
- Equipe: **"Nenhuma pessoa na equipe."**
- Convites: **"Nenhum convite pendente."**
- Erros: **"Nenhum erro registrado nos últimos 7 dias."** (tom positivo, ícone `CircleCheck`)
- Movimentações: **"Nenhuma movimentação recente."**
- Divergências: **"Nenhuma divergência aberta."**

### 3.3 Falha de carregamento

`Aviso` tom="erro": **"Não foi possível carregar os dados da empresa. Tente novamente."** + botão **"Tentar de novo"**.

---

## 4. Observabilidade `/admin/logs` — `AdminObservabilidade.tsx`

`Cabecalho` título **"Logs da plataforma"**, subtítulo **"Erros e eventos de todas as lojas, agrupados por semelhança."** Ações: **"Exportar CSV"** (secundário, ícone `Download`), **"Atualizar"**.

### 4.1 Filtros (chips roláveis `.rolagem-x` + selects)

Linha 1 — chips de gravidade (um por vez, `aria-pressed`):
> **Todos** · **Info** (slate) · **Aviso** (amber) · **Erro** (red) · **Crítico** (red, fundo red-100)

Linha 2 — filtros em `<select>`/inputs:
- **Loja** (todas / por loja da empresa selecionada ou todas)
- **Empresa** (todas / por empresa)
- **Usuário** (busca por nome)
- **Módulo/funcionalidade** (select com os módulos conhecidos + "Outros")
- **Status** (Todos / Novo / Em análise / Resolvido / Recorrente)
- **Fingerprint** (busca por id/texto)
- **Período** (de/até, date inputs) + atalhos: **"Hoje"** · **"7 dias"** · **"30 dias"**

Botão **"Limpar filtros"** (fantasma) aparece quando há filtro ativo.

### 4.2 Lista agrupada por fingerprint

Cada grupo é um `.cartao` expansível:

> Cabeçalho do grupo: badge de gravidade + **mensagem exemplar** (truncada) + **"{N} ocorrências"** + **"entre {data início} e {data fim}"** + **"{X} lojas"** + **"{Y} usuários"** + fingerprint (mono, copiável, aria-label="Copiar fingerprint").
> Ações no cabeçalho: **"Criar incidente"** (ícone `Siren`, secundário) · **"Analisar com IA"** (ícone `Sparkles`, secundário) · chevron expandir.

Expandido: lista das ocorrências (data/hora · loja · usuário · módulo · endpoint/método/status HTTP quando houver · stack truncada em `<details>` **"Ver stack"**) + ações de status:

- Select de status: **Novo / Em análise / Resolvido / Recorrente** (mudança exige `Modal` "Atualizar status" com campos **Causa provável** (textarea) e **Sugestão de solução** (textarea) + botões **"Voltar"** / **"Salvar"**).
- Toast: **"Status atualizado."**

### 4.3 Drill-down de uma ocorrência

`Modal` "Detalhe do erro" com todos os campos do log em pares rótulo/valor (data/hora, id, empresa, loja, usuário, módulo, funcionalidade, gravidade, descrição, endpoint, método, status HTTP, código de resposta, stack, request id/correlação, causa, sugestão, status atual). Botão **"Copiar diagnóstico"** (padrão `ErroApp.tsx:71-74`) → toast **"Diagnóstico copiado."**.

### 4.4 Empty states

- Sem logs no período: `Vazio` ícone `Activity`, título **"Nenhum log no período."**, texto **"Ajuste os filtros ou amplie o intervalo."**
- Filtro sem resultado: título **"Nada encontrado"**, texto **"Ajuste a busca ou os filtros."** (padrão `Estoque.tsx:375`).

### 4.5 Aviso de honestidade (rodapé da página)

`Aviso` tom="info":
> **"O que aparece aqui:"** erros de tela do app, falhas de API vistas pelo cliente e estado do banco por loja. **"O que ainda não aparece:"** logs server-side de autenticação e de integrações (chegam com o T-034), latência real e disponibilidade externa.

---

## 5. Incidentes `/admin/incidentes` — `AdminIncidentes.tsx`

`Cabecalho` título **"Incidentes"**, subtítulo **"Problemas acompanhados até a resolução."** Ações: **"Novo incidente"** (primário, ícone `Plus`).

### 5.1 Card "Críticos abertos" (topo, só se count > 0)

`.cartao` fundo `bg-red-50`, contagem grande + lista dos 3 mais recentes (título · empresa/loja · "há {tempo}") + link **"Ver todos os críticos"** (filtro `?prioridade=critica&situacao=aberto`).

### 5.2 Filtros (chips)

Prioridade: **Todos · Baixa · Média · Alta · Crítica**
Situação: **Todos · Aberto · Em análise · Resolvido · Cancelado**
+ select de empresa + período.

### 5.3 Lista de incidentes (`.cartao` + `Paginacao`, 25/página)

Cada linha: badge de prioridade (ícone + texto) · título · empresa/loja · **"{N} usuários impactados"** · primeira/última ocorrência · responsável (ou **"Sem responsável"**) · badge de situação · ações.

Ações: **"Ver"** → `/admin/incidentes/:id`; **"Atribuir a mim"** (ícone `UserCheck`, fantasma) — seta responsável = admin atual + status "em análise" + registra ação.

### 5.4 Detalhe `/admin/incidentes/:id` — `AdminIncidenteDetalhe.tsx`

`Cabecalho` título = título do incidente, subtítulo = **"{prioridade} · {situacao} · {empresa/loja}"**. Ações: **"Analisar com IA"** (primário, ícone `Sparkles`) · **"Recontar"** (secundário, ícone `RefreshCw`, aria-label="Recalcular estatísticas do grupo").

Seções:

1. **Resumo** (card): prioridade (select editável) · situação (select editável) · responsável (select de admins) · usuários impactados · primeira ocorrência · última ocorrência · fingerprint principal (copiável) · grupos relacionados (lista de fingerprints).
2. **Diagnóstico** (card): textarea **"Diagnóstico"** + textarea **"Solução recomendada"** + botão **"Salvar"**. Quando preenchido pela IA, mostra badge **"Gerado pela IA em {data}"**.
3. **Histórico de ações** (timeline vertical, padrão `ServicosDetalhe.tsx:145-149`): cada ação com data/hora · autor · ação · detalhe. Ações possíveis: **Criado · Status alterado · Diagnóstico atualizado · Análise de IA · Atribuído · Recontado**.
4. **Ocorrências do grupo** (lista compacta, link para `/admin/logs?fingerprint=...`): **"Ver todas as {N} ocorrências"**.

### 5.5 Modal "Criar incidente" (a partir de um grupo de log)

Campos: **Título \*** (input) · **Descrição** (textarea) · **Prioridade** (select: Baixa/Média/Alta/Crítica, default Média) · **Empresa** (select, default a da ocorrência; "Plataforma" para problema global) · **Loja** (select, opcional) · botões **"Voltar"** / **"Criar incidente"**.

Toast: **"Incidente criado."**

### 5.6 Empty state

> `Vazio` ícone `Siren`, título **"Nenhum incidente aberto."**, texto **"Quando um grupo de erros virar incidente, ele aparece aqui."**

---

## 6. Inspeção de loja (F4) — somente leitura

### 6.1 Modal "Abrir inspeção" (chamado de `/admin` ou `/admin/empresas/:id`)

Campos: **Empresa** (fixo, da tela) · **Loja** (select: "Toda a empresa" ou loja específica) · **Motivo \*** (textarea, mínimo 10 caracteres; placeholder **"Ex.: cliente relatou erro na finalização de venda; investigar logs e estoque"**) · erro de campo: **"Descreva o motivo (mínimo de 10 caracteres)."** · botões **"Voltar"** / **"Abrir inspeção"**.

Toast: **"Inspeção aberta. Encerra em {hora}."**

### 6.2 Banner de inspeção (persistente em todas as telas de inspeção)

`Aviso` tom="alerta", fixo no topo (abaixo do cabeçalho admin):
> **"Modo inspeção — {empresa} / {loja ou 'toda a empresa'}."** Somente leitura. Encerra em {hh:mm}. **"Encerrar agora"** (botão, estilo `btn-perigo` pequeno).

Quando a sessão vence no meio do uso: `Aviso` tom="erro": **"A inspeção expirou. Abra uma nova para continuar."** + botão **"Abrir nova inspeção"**; as leituras são bloqueadas.

### 6.3 Telas de inspeção (somente leitura, reutilizando componentes de UI)

Rotas: `/admin/inspecao/:id` com abas (Segmentado rolável):
- **Estoque** — lista de produtos com saldo/lote/validade (somente leitura; sem movimentar).
- **Vendas** — últimas vendas por período (somente leitura).
- **Produtos** — catálogo (somente leitura).
- **Movimentações** — últimas N movimentações.
- **Equipe** — membros.
- **Divergências** — abertas.
- **Assinatura** — estado atual.

Cada tela reusa `.cartao`, tabelas, `Vazio`, `Carregando`, `Paginacao`. **Nenhum botão de gravação** (sem "Movimentar", "Nova venda", "Salvar", "Excluir"). Campos aparecem `disabled` com tooltip **"Somente leitura em modo inspeção."** onde houver input.

Cada navegação de leitura gera uma linha em `admin_auditoria` (invisível ao admin na UI, visível em `/admin/auditoria`).

### 6.4 Modal "Ajustar assinatura" (primeira escrita administrativa)

Campos: **Status** (select: Trial / Ativa / Cancelada / Cortesia) · **Dias** (number, para trial/ativa) · **Motivo \*** (textarea, mínimo 10 caracteres) · preview **"Antes: {status atual} até {data}"** → **"Depois: {novo status} até {data}"**.
Botões: **"Voltar"** / **"Aplicar"** (primário; confirmação extra se for Cancelada: `Modal` aninhado **"Cancelar a assinatura da empresa {nome}?"** com botões **"Voltar"** / **"Confirmar cancelamento"**).

Toast: **"Assinatura ajustada."** / erro do banco aparece cru em `Aviso` tom="erro".

Reversibilidade: o mesmo modal reverte (o admin reabre e ajusta de volta) — registrado em auditoria com antes/depois.

### 6.5 Encerrar inspeção

Botão **"Encerrar agora"** no banner → `Modal` **"Encerrar a inspeção?"** corpo **"Os dados consultados ficam registrados em auditoria. Você pode abrir uma nova inspeção a qualquer momento."** botões **"Voltar"** / **"Encerrar"**. Toast: **"Inspeção encerrada."** → redireciona para `/admin/empresas/:id` (ou `/admin`).

---

## 7. Agente de IA (F5) — `AdminAgente` (integrado às telas)

### 7.1 Botão "Analisar com IA"

Presente em: detalhe do incidente (`/admin/incidentes/:id`) e cabeçalho de cada grupo em `/admin/logs`. Estilo `btn-primario`, ícone `Sparkles`, texto **"Analisar com IA"** (loading: **"Analisando..."**, disabled durante a chamada).

### 7.2 Resultado exibido

Após a análise, um card `.cartao` aparece no incidente/grupo:

> Cabeçalho: **"Análise da IA"** + badge **"Gerado em {data/hora}"** + modelo (mono, pequeno).
> Corpo: texto em linguagem clara (parágrafos), seguido de seções colapsáveis:
> - **"Causa provável"**
> - **"Sugestão de solução"**
> - **"Problemas relacionados"** (lista de fingerprints)
> - **"Ações sugeridas"** (lista; ações de escrita exigem aprovação — botão **"Aprovar e executar"** só aparece para ações de baixo risco com regra explícita; caso contrário mostra **"Requer aprovação do super admin"** desabilitado).
> Rodapé: **"Esta análise foi salva no histórico."** + link **"Ver histórico de análises"**.

Toast de sucesso: **"Análise concluída."** / falha: **"Não foi possível analisar agora. Tente novamente."**

### 7.3 Histórico de análises

`Modal` "Histórico de análises" (aberto por link no card): lista de análises anteriores (data · modelo · resumo de 1 linha) + botão **"Ver"** que expande o resultado completo. Empty state: **"Nenhuma análise anterior."**

### 7.4 Modo sem-chave (dev)

Quando a Edge Function devolve o modo sem-chave, o card mostra:
> `Aviso` tom="info": **"IA não configurada (modo desenvolvimento)."** A análise automática está desativada; configure o segredo para ativar.

A análise ainda é registrada em `admin_incidente_analises` com resultado fixo, para manter e2e verde.

### 7.5 Limite diário

Acima de 50 análises/dia: botão disabled + tooltip **"Limite diário de análises atingido ({N}/50). Tente amanhã."**

---

## 8. Auditoria `/admin/auditoria` — `AdminAuditoria.tsx`

`Cabecalho` título **"Auditoria"**, subtítulo **"Quem acessou o quê, quando."** Filtros: admin (select) · período (de/até + atalhos) · ação (Todos/Consulta/Ação/Agente) · empresa (todas/por empresa) · limite (100/200/500).

Tabela: data/hora · admin (nome) · ação (badge) · alvo · empresa/loja · correlação (copiável) · detalhes (expandível, JSON formatado em `<pre>`).

Empty state: `Vazio` ícone `ScrollText`, título **"Nenhuma entrada de auditoria."**, texto **"As consultas e ações administrativas aparecem aqui."**

---

## 9. A11y (regras transversais obrigatórias)

- **Alvos ≥44×44 px**: botões de ícone (`p-2.5` mínimo), chips de filtro (`min-h-[44px]`), itens de lista (`py-3`/`py-4`), KPIs clicáveis (já `min-h-[118px]`).
- **`aria-label` em todo botão de ícone**: labels exatos listados em cada seção acima (ex.: "Ver detalhe da empresa {nome}", "Inspecionar a loja {nome}", "Ajustar assinatura da empresa {nome}", "Criar incidente", "Analisar com IA", "Copiar fingerprint", "Encerrar agora", "Voltar para a loja", "Sair").
- **Foco**: ordem de foco = ordem visual; foco visível herdado do `.btn` (`ring-letreiro`, `index.css:42`); modal prende foco e devolve ao fechar (`ui.tsx:172-215`).
- **Erro de campo**: `aria-invalid` + texto `<p id>` referenciado por `aria-describedby` + foco no primeiro campo inválido (padrão `ServicosRecebimento.tsx`).
- **Nunca só cor**: badges e chips sempre com ícone + texto (padrão `BadgeSituacao`, `ui.tsx:52-70`); gravidade Crítica usa red-100/red-800 (contraste AA, paleta existente).
- **`aria-live="polite"`** nos toasts (já existente) e na contagem de KPIs do painel.
- **Tabelas acessíveis**: `<table>` com `<caption className="sr-only">` e `<th scope="col">`; em mobile vira lista de cartões (não tabela aninhada).

---

## 10. Textos exatos (pt-BR) — resumo consolidado

**Títulos de página**
- `/admin`: **"Visão geral da plataforma"**
- `/admin/empresas`: **"Empresas"**
- `/admin/empresas/:id`: nome da empresa (h1)
- `/admin/logs`: **"Logs da plataforma"**
- `/admin/incidentes`: **"Incidentes"**
- `/admin/incidentes/:id`: título do incidente (h1)
- `/admin/auditoria`: **"Auditoria"**

**Botões principais**
- **"Atualizar"** · **"Exportar CSV"** · **"Ver detalhe"** · **"Inspecionar"** · **"Ajustar assinatura"** · **"Abrir inspeção"** · **"Encerrar agora"** · **"Aplicar"** · **"Criar incidente"** · **"Analisar com IA"** · **"Analisando..."** · **"Recontar"** · **"Atribuir a mim"** · **"Salvar"** · **"Voltar"** · **"Confirmar cancelamento"** · **"Limpar filtros"** · **"Tentar de novo"** · **"Voltar para a loja"** · **"Sair"** · **"Copiar diagnóstico"** · **"Copiar fingerprint"**

**Empty states**
- Painel sem empresas: **"Nenhuma empresa cadastrada ainda."** / **"As empresas aparecem aqui assim que forem criadas."**
- Logs sem registro: **"Nenhum log no período."** / **"Ajuste os filtros ou amplie o intervalo."**
- Filtro sem resultado: **"Nada encontrado"** / **"Ajuste a busca ou os filtros."**
- Incidentes: **"Nenhum incidente aberto."** / **"Quando um grupo de erros virar incidente, ele aparece aqui."**
- Auditoria: **"Nenhuma entrada de auditoria."** / **"As consultas e ações administrativas aparecem aqui."**
- Inspeção — sem dados: **"Nenhum registro encontrado."**
- Sem acesso: **"Sem acesso"** / **"Esta área é restrita aos administradores da plataforma."**

**Toasts**
- **"Status atualizado."** · **"Inspeção aberta. Encerra em {hora}."** · **"Inspeção encerrada."** · **"Assinatura ajustada."** · **"Incidente criado."** · **"Análise concluída."** · **"Não foi possível analisar agora. Tente novamente."** · **"Diagnóstico copiado."** · **"Limite diário de análises atingido ({N}/50). Tente amanhã."**

**Avisos**
- Banner área da plataforma: **"Área da plataforma. Você está fora da visão de uma loja. Tudo o que você consultar aqui é registrado em auditoria."**
- Modo inspeção: **"Modo inspeção — {empresa} / {loja}. Somente leitura. Encerra em {hh:mm}."**
- Inspeção expirada: **"A inspeção expirou. Abra uma nova para continuar."**
- IA sem chave: **"IA não configurada (modo desenvolvimento)."**
- Somente leitura (tooltip): **"Somente leitura em modo inspeção."**
- Honesty (logs): **"O que aparece aqui: erros de tela do app, falhas de API vistas pelo cliente e estado do banco por loja. O que ainda não aparece: logs server-side de autenticação e de integrações (chegam com o T-034), latência real e disponibilidade externa."**
- Encerrar inspeção: **"Os dados consultados ficam registrados em auditoria. Você pode abrir uma nova inspeção a qualquer momento."**

**Validações de campo**
- Motivo (inspeção): **"Descreva o motivo (mínimo de 10 caracteres)."**
- Título (incidente): **"Informe o título do incidente."**
- Causa/sugestão: opcionais, sem validação mínima.

---

## 11. Specs de teste afetadas

**Novos:**
- `e2e/app/admin-base.spec.ts` (F1): negativo — lojista abre `/admin` e vê "Sem acesso" com zero dados; positivo (com fixture de admin promovido) — visão geral mostra a empresa de exemplo com contagens reais; auditoria lista a própria consulta.
- `e2e/app/admin-observabilidade.spec.ts` (F2): provocar erro no app da loja, abrir `/admin/logs` como admin, filtrar por loja/módulo, ver grupo com 2 ocorrências, marcar "em análise"; lojista não vê a tela (negativo).
- `e2e/app/admin-incidentes.spec.ts` (F3): criar incidente de um grupo, mudar situação, ver histórico, card de críticos refletindo contagem.
- `e2e/app/admin-inspecao.spec.ts` (F4): admin inspeciona a loja de exemplo, vê estoque/vendas reais, banner visível, encerra e perde acesso às leituras.
- `e2e/app/admin-ia.spec.ts` (F5): botão "Analisar" com modo sem-chave devolve resposta fixa registrada no incidente e no histórico.

**SQL (PGlite, prova positiva E negativa) — por fase:**
- F1: super admin promovido por SQL vê todas as empresas em `admin_visao_geral` e lê erros de empresa alheia; lojista chamando `admin_visao_geral` → 42501; lojista com `select` direto em `admin_auditoria` → 0 linhas/negado; cada consulta do admin grava linha em `admin_auditoria`; `anon` não executa nenhuma função nova (metateste `testar-sql.mjs:89-95`); RLS on (metateste `:72-73`).
- F2: mesma mensagem duplicada → mesmo fingerprint; mensagens com números diferentes → mesmo fingerprint; mensagens distintas → fingerprints distintos; backfill cobre linhas antigas; dono/gerente tentando alterar `status` direto → negado (só via `admin_log_status`, que audita); lojista continua vendo só os erros da própria empresa; erros de empresa alheia invisíveis; `anon` não executa as novas funções; teste SQL varre colunas de log por padrões proibidos (senha/token/CPF).
- F3: criar incidente de um grupo popula estatísticas corretas; lojista sem acesso a qualquer tabela de incidente; ações imutáveis (sem grant de update/delete).
- F4: sessão expirada → todas as leituras falham; leitura de recurso fora do alvo da sessão → falha; cada leitura grava auditoria; encerrar bloqueia novas leituras; `admin_ajustar_assinatura` audita antes/depois e é reversível; lojista não consegue abrir inspeção (42501).
- F5: pacote sanitizado (positiva e negativa), limite diário recusa além de N, cada chamada de agente audita, guard de todas as ferramentas.

**Unit (Vitest):**
- Wrapper do cliente admin (correlação estável por sessão, 42501 → "Sem acesso").
- Montagem do payload de contexto (truncamentos, campos proibidos ausentes).
- Mapa de gravidade; montagem/parse do pacote de IA.

**Regressão:**
- `navegacao.spec.ts`: item "Painel da plataforma" no menu lateral e no Mais só para admin; barra inferior intacta; `/admin` não quebra o fallback `*` → `/painel`.
- `lgpd.spec.ts`: exportação do dono não inclui tabelas de plataforma (auditoria/incidentes/inspeções) — elas não têm `empresa_id` e não entram na exportação.
- Metarregras do CI: `testar-sql.mjs` — acrescentar `admin_auditoria`, `admin_incidentes`, `admin_incidente_acoes`, `admin_inspecoes`, `admin_incidente_analises` (e as demais tabelas de plataforma) à lista `sistema` (`testar-sql.mjs:75`); RLS on (`:72-73`); `anon` sem acesso (`:84-95`); policies via `(select …)` (`:78-82`).

---

## 12. Fora do escopo desta spec (follow-ups, do plano)

Reprodução fiel das telas do lojista na inspeção (depende de resposta do dono); escrita em dados operacionais da loja (produtos/movimentações); desativar usuário/loja pelo painel; migração de usuários entre empresas; criar/remover empresas pelo painel (expurgo segue service-role); alerta por e-mail/WhatsApp (F3 declara honestamente que não há infra server-side hoje); monitoramento contínuo agendado (F5); correções autônomas de baixo risco (aguardam whitelist aprovada); alterações de código automatizadas; multi-provedor de IA; APM/latência real; probe de disponibilidade externa; expurgo automático (limpeza manual documentada, como hoje).

---

## 13. Dependências e ordem (decisão do dono §9)

Fila: **T-038 → QA → T-039 → T-028**; **T-040 por último**. F1–F4 independem do T-034; F5 prefere vir após o T-034 (padrão de Edge Functions), senão cria-se a Edge Function mínima `admin-ia` dedicada. Implementação do T-039 só começa depois do T-038 fechar (gates reexecutados), porque `App.tsx`/`Layout.tsx` são tocados pelo T-038.
