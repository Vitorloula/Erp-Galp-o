# Documentação do ERP Galpão

## Status do repositório (verificado por este QA no ciclo T-016 / T-017)

**Compilação: OK** — `npx tsc --noEmit` → **exit 0** · `npx tsc -p e2e/tsconfig.json --noEmit` → **exit 0**.
Testes: **90/90 passando** em 8 arquivos (`npx vitest run` → **exit 0**, 9,84 s).
Build: **OK** (`npm run build` → exit 0, 2303 módulos, PWA `generateSW`, 11 entradas precache,
1.018,63 KiB, 901 ms). Playwright: `--list` → **171 testes / 17 arquivos** (execução real fica no
gate externo `qa_gate.py`; `npm run lint` **não existe** — `Missing script: "lint"`).
Backlog: **T-016/T-017 NÃO entregues** — ver "Item do ciclo" abaixo. Último concluído: T-009.

---

## Item do ciclo: T-016 + T-017 — "Exportar" do Estoque não levava os filtros para o Relatório

### Situação: **NÃO ENTREGUE no código** (critérios 1–5 e 7 do plano sem evidência; sem plano persistido)

### O que o operador vê hoje (o defeito continua vivo)

1. Em **Estoque**, o operador toca no chip **"Repor"** e escolhe a categoria **Fertilizante**.
   A tela mostra só o que precisa ser comprado *daquela* categoria.
2. Toca em **Exportar** (cabeçalho). O app abre **`/relatorios` sem nenhum filtro** — o link é
   `<Link to="/relatorios">` fixo (`src/pages/Estoque.tsx:187`).
3. O Excel/PDF sai com o **estoque inteiro**, não com o recorte. O operador confere linha a linha
   na planilha para achar o que interessava — ou leva ao fornecedor uma lista com produto a mais.

É o defeito que T-016 descreve. **A correção não está no código** (ver §"O que foi verificado").

### O que deveria mudar (contrato com o usuário, para o próximo ciclo)

> **Clicar em "Exportar" no Estoque abre o Relatório já recortado pelos MESMOS filtros da tela**, e o
> Relatório **avisa** de onde veio o recorte, com um botão **"Limpar filtros"** para voltar ao
> relatório completo.

Regras que o usuário percebe:

- **Sem filtro nenhum** em `/estoque`, o link leva a `/relatorios` **exatamente** — a tela de destino
  se comporta byte a byte como hoje (3 KPIs, 13 linhas na Posição da fixture, 2 vencidos, 3 vencendo,
  4 abas no Excel, PDF > 20 000 bytes).
- **Chip de situação** (Vencidos / Zerados / Vencem em N dias / Repor / Em dia) vira `situacao=` no
  destino; **"Repor"** vira `situacao=abaixo` ("Repor" é a palavra que o operador vê nas duas telas).
- **Busca** vira `q=` (aparada — busca só com espaços **não** gera `?q=`); **categoria** vira
  `categoria=<id>`. A chave interna `filtro=` da tela Estoque **não** vaza para o link.
- No Relatório, o recorte vale para as abas **Posição** e **Compras**; o aviso diz isso com todas as
  letras ("Valem para **Posição** e **Compras** · N linhas"). **Resumo** e **Movimentações** continuam
  completos: são totais do período, não uma posição de estoque.
- **Compras** só entende o recorte "Repor" (produto abaixo do mínimo); "Vencidos"/"Zerados"/"Em dia"
  são situação de **lote** e não se aplicam a produto — nesses casos a aba Compras fica só com
  busca/categoria, e o aviso continua verdadeiro.
- **Posição** com 0 linhas mostra "Nada encontrado — Ajuste os filtros recebidos do estoque."
  (sem botão duplicado; "Limpar filtros" fica no aviso, uma vez só).
- **"Limpar filtros"** tira `q`/`categoria`/`situacao` da URL (`replace`, sem sujar o histórico),
  devolve o foco ao `<h1>` e a tela volta a 13 linhas / 2 vencidas / 3 vencendo.
- Link quebrado/compartilhado com `categoria` inexistente ou `situacao` desconhecida **não filtra e
  não quebra a tela** (mesma filosofia de `periodoDaUrl`: "link quebrado não derruba a tela").
- O link "Exportar" continua sendo **um link** com texto visível **"Exportar"** (não vira botão, não
  ganha contagem no rótulo visível); a contagem, quando existir, vai no `aria-label` (WCAG 2.5.3
  "Label in Name"). Continua **clicável mesmo com 0 produtos** (link desabilitado no galpão vira
  chamado de suporte).

### O que **não** muda (contrato com quem já usa e com o E2E)

- Heading `Estoque atual` / `Relatórios`; `aria-label` `Buscar`, `Categoria`, `Ordenar por`, `De`,
  `Até`, `Produto`; os 4 checkboxes de seção; botões `Baixar Excel (.xlsx)`/`Baixar PDF`; abas
  `Resumo`/`Movimentações`/`Posição`/`Compras`; chips de situação e suas cores; `data-linha-estoque`,
  `data-situacao`, classes `linha-*`; o `[aria-live="polite"]` de toast e da barra de seleção; cores
  e breakpoints (`sm`/`md`/`lg`) — T-016/T-017 é **navegação**, não redesenho.
- `lib/estoque.ts`, `lib/periodos.ts`, `lib/formato.ts` e `src/index.css` **não** precisam de mudança:
  `juntarFiltros`, `produtoCombina`, `montarReposicao`, `abaixoDoMinimo` já existem e já são testados.
- ⚠️ **`@/` não é alias válido** neste projeto: `tsconfig.json` usa `moduleResolution: bundler` e
  **não** declara `paths`; `vite.config.ts` **não** tem `resolve.alias`. Escrever `@/lib/...` quebra
  `tsc` e `vite` na hora. Use caminhos relativos (padrão em 100% de `src/`).

### O que foi verificado neste ciclo (por leitura + comandos, sem maquiar)

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx tsc -p e2e/tsconfig.json --noEmit` | exit 0 |
| `npx vitest run` | 8 arquivos · **90/90** |
| `npx vitest run src/lib/relatorio.test.ts --reporter=verbose` | **3/3**, nenhum de filtro |
| `npm run build` | exit 0 · 2303 módulos · PWA ok |
| `npx playwright test --list` | **171 testes / 17 arquivos** |
| `src/pages/Estoque.tsx:187` | `<Link to="/relatorios">` **fixo** — sem `juntarFiltros`, sem `situacao=`, sem `aria-label` |
| `src/pages/Relatorios.tsx` | lê só `de`/`ate` + `produtoId`; **sem** `FiltrosRecebidos`, **sem** "Limpar filtros", **sem** `Vazio` na Posição |
| `src/lib/relatorio.ts` | `montarRelatorio` com **6 parâmetros** (sem `filtroPosicao`) |
| `src/lib/relatorio.test.ts` | **3** `it()`; nenhum caso de `filtroPosicao`/categoria/termo/situação |
| `e2e/app/painel-estoque.spec.ts` / `relatorios.spec.ts` | **6** e **5** casos — nenhum de Exportar/filtros recebidos |
| `e2e/app/estoque-repor.spec.ts` | **não existe** (dívida herdada de T-009) |
| `memoria/estado.json` | `"plano_atual": null`, `"ciclos": 0` — **sem plano do Arquiteto** |

Conclusão factual: o repositório está **verde** (tsc/vitest/build), mas **a correção de T-016/T-017
não foi aplicada e a cobertura dela não está no disco**. O relatório de entrega do ciclo afirmava 4
`it()` novos e 3 casos E2E novos; o disco mostra 3 `it()` e 0 casos novos. Registrado.

---

## Itens anteriores aprovados

### T-009 — A tela Estoque mostrava dois números diferentes para "Repor"

**Concluído no código**; cobertura E2E da paridade **pendente**.

Contrato: **Chip "Repor N" = nº de linhas da tabela = nº de linhas do arquivo baixado**, uma linha
por **produto** (não por lote), com qualquer combinação de busca/categoria.

```ts
// src/pages/Estoque.tsx — derivado único (não exportado)
const reposicao         = useMemo(() => montarReposicao(produtos, lotes), [produtos, lotes])
const visiveisReposicao = useMemo(
  () => precisaRepor(reposicao).filter(
    i => (!categoria || i.produto.categoria_id === categoria) && produtoCombina(i.produto, termo)),
  [reposicao, categoria, termo])
const itensRepor        = useMemo(() => ordenarReposicao(visiveisReposicao, ordem), [...])
// contagem.abaixo = visiveisReposicao.length   ← MESMA lista que a tabela desenha
```

Decisões registradas: `saldosPorProduto` **permaneceu** (é consumida por `Painel.tsx`, KPI "Para
repor"); `ordem` é **ignorada** (não `disabled`) no filtro Repor; "Vencidos"/"Zerados" continuam
vindo de `montarLinhasEstoque` (visão por lote) — só o filtro Repor é por produto.

### T-011 — lista de compras mostra "Comprar 8 kg (2 emb.)"

`textoEmbalagensSugestao` em `ListaReposicao.tsx`, `data-embalagens` na `<li>`, paridade tela × PDF
provada por `lista-compra-paridade.test.ts` (4 testes).

```ts
// src/components/ListaReposicao.tsx
export function textoEmbalagensSugestao(
  produto: Pick<Produto, 'conteudo_embalagem'>,
  sugestaoCompra: number,
): string | null            // "2 emb." | null
```

### T-001 (parte relatório) — lista de compras no Excel/PDF e na tela

`LinhaCompraRel`/`Relatorio.compras` em `lib/relatorio.ts`, aba "Lista de compras" em
`lib/exportar/excel.ts`, tabela "Compras (reposição)" em `lib/exportar/pdf.ts`, 4º checkbox em
`Relatorios.tsx`, `relatorio.test.ts` (3) e `exportar.test.ts` (6).

```ts
// src/lib/estoque.ts
type SituacaoPedido = Extract<SituacaoReposicao, 'abaixo' | 'no_minimo'>
export interface ItemCompra {
  produto: Produto; codigo: string; categoria: string; unidade: Unidade
  saldo: number; minimo: number | null; cobertura: number | null
  sugestaoCompra: number; situacao: SituacaoPedido
}
export function filtrarItensCompra(itens, selecionados, nomeCategoria?): ItemCompra[]

// src/lib/exportar/lista-compra.ts
export function nomeArquivoListaCompra(ext: 'xlsx' | 'pdf', dia?: string): string
export function gerarListaCompraExcel(itens, empresa, opcoes?: { geradoEm?: Date }): Promise<Blob>
export function gerarListaCompraPdf  (itens, empresa, opcoes?: { geradoEm?: Date }): Promise<Blob>
```

Contrato de formatação da coluna "Comprar": **Excel = número puro** (negrito verde),
**PDF = texto** `"8 kg (2 emb.)"`, **tela = o mesmo texto do PDF**.

### T-006 — Filtros na URL + rodapé de totais

```ts
periodoDaUrl(query, hoje?): PeriodoDaUrl
chaveIntervalo(i: Intervalo): string                  // "AAAA-MM-DD|AAAA-MM-DD"
juntarFiltros(params, mudancas): URLSearchParams      // valor vazio (ou só espaços) remove o parâmetro
totaisPorGrupo(movs): TotaisMov
```

Defeito corrigido naquele ciclo: `juntarFiltros` gravava `?q=+` com busca só de espaços — `trim()`
antes do teste de presença em `periodos.ts`. **É o helper que T-016 deve usar no `href` do Exportar.**

### T-002 — Estoque mínimo / ponto de pedido

`Produto.estoque_minimo`, `SituacaoReposicao`, `montarReposicao`, `precisaRepor`, `abaixoDoMinimo`,
`BadgeReposicao`, `Cobertura`, `ReposicaoForm`, `ListaReposicao`, filtro "Repor". Cobertura em
`regras.test.ts`. Pendências: migration e `Painel.tsx`.

### T-007 — `ListaReposicao` não era usada (diagnóstico desmentido)

`src/pages/Estoque.tsx` importa `ListaReposicao` e a renderiza dentro do filtro `filtro === 'abaixo'`,
com `selecionados`, `aoAlternar` e `aoMarcarTodosToggle` ligados.

## Modelo de domínio de reposição

```
SituacaoReposicao = 'abaixo' | 'no_minimo' | 'acima' | 'sem_minimo'
SituacaoPedido    = Extract<SituacaoReposicao, 'abaixo' | 'no_minimo'>   // entra na lista de compras

cobertura = saldo / minimo            (null quando sem mínimo)
sugestaoCompra = ceil((minimo - saldo) / conteudo_embalagem) * conteudo_embalagem
                 (ou minimo - saldo arredondado, quando não há embalagem)
embalagens = round(sugestaoCompra / conteudo_embalagem, 2)   // "2 emb." — tela e PDF
```

Regras: `minimo` nulo ou `<= 0` → `sem_minimo`; `saldo <= 0` ou `saldo < minimo` → `abaixo`;
`saldo === minimo` → `no_minimo`; `saldo > minimo` → `acima`.

Entram na lista de compras: **abaixo + no_minimo**, uma linha **por produto**, ordenados por
cobertura ascendente (mais crítico primeiro). `precisaRepor(montarReposicao(produtos, lotes))` é a
**única** porta de entrada — usada pelo chip "Repor", pela tabela e pelo arquivo baixado.
Reposição **não** colore a linha (o fundo segue a pior situação de lote); o badge sempre traz
ícone + texto, nunca só cor.

> **Pegadinha registrada para T-017:** `situacao=abaixo` no relatório deve ser decidido pelo
> **saldo consolidado do produto** (`saldosPorProduto` + `estoque_minimo`), **nunca** por
> `l.situacao` do lote. Um produto abaixo do mínimo com 2 lotes apareceria como 2 linhas "Repor"
> se a regra de lote fosse usada — é exatamente o defeito que T-009 corrigiu na tela.

## Estado do backlog (persistido em `memoria/estado.json`)

Aberto após este ciclo (ordem de prioridade):

- **T-016** (prio 1, bug) — "Exportar" do Estoque abre `/relatorios` sem os filtros da tela.
  **Não entregue neste ciclo** (evidência em §"O que foi verificado").
- **T-021** (prio 1, bug) — `?produto=` do Relatórios não vai para a URL; link compartilhado abre
  "Todos os produtos".
- **T-019** (prio 2, refatoração) — recorte único reutilizável (produto+termo+categoria+situação)
  entre Estoque e Relatórios.
- **T-017** (prio 2, melhoria) — aba Posição ignora busca/categoria e não avisa que os filtros vieram
  no link. **Não entregue neste ciclo.**
- **T-020** (prio 2, teste) — falta teste de aceite da contagem chip "Repor" × tabela × compras.
- **T-018** (prio 3, refatoração) — duplicação da geração/entrega de arquivo (import dinâmico +
  `baixarArquivo` + toast + estado "gerando").
- **T-022** (prio 3, melhoria) — arquivo sai com seções vazias sem avisar antes do download.
- **T-008** (acessibilidade) — modal "Estoque mínimo" fecha sem devolver o foco.
- **T-010** / **T-012** / **T-003** / **T-004** / **T-002** / **T-006-E2E** — seguem abertos como
  registrado nos ciclos anteriores.

Concluído: T-001 (lista de compras no relatório), T-002 (estoque mínimo), T-005 (chip "Repor" por
produto), T-006 (filtros na URL), T-007 (uso de `ListaReposicao`), T-009 (fonte única do "Repor"),
T-011 (embalagens na lista de compras).

Pendências verificadas no código e ainda não abertas como item:

- Migration de `estoque_minimo` ausente em `supabase/migrations` — mínimos e lista de compras hoje só
  existem no aparelho.
- Sem tela de conferência/inventário cego.
- Filtros de URL sem teste de componente (só teste de unidade em `periodos.ts`).
- Seleção/checkboxes/`BarraAcoesCompra`/toasts de T-001 e o render de T-011 sem teste de componente —
  projeto sem `@testing-library`; verificação por revisão + Playwright.
- **Processo:** `atualizar_backlog` com ação `reordenar` **apagou** o backlog no ciclo T-009 — não
  usar `reordenar` como ferramenta de priorização; recadastrar item a item.
- **Processo:** `plano_atual` continua `null` em `memoria/estado.json` — o passo `definir_plano`
  precisa rodar antes do próximo ciclo, senão Designer/DEV/QA trabalham sem contrato de escopo.
