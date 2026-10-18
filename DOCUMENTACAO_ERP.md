# Documentação do ERP Galpão

## Status do repositório (verificado por este QA no reenvio de T-021)

**Compilação: OK** — `npx tsc --noEmit` → **exit 0** · `npx tsc -p e2e/tsconfig.json --noEmit` → **exit 0**.
Testes: **90/90 passando** em 8 arquivos (`npx vitest run` → **exit 0**, 10,63 s de parede).
Build: **OK** (`npm run build` → exit 0, 2303 módulos, PWA `generateSW`, 11 entradas precache,
1.018,59 KiB, 1,06 s). Playwright: `--list` → **171 testes / 17 arquivos** (execução real fica no
gate externo `qa_gate.py`; `npm run lint` **não existe** — `Missing script: "lint"`).
Backlog: **T-021 NÃO entregue** — ver "Item do ciclo". Últimos concluídos: T-001/T-006/T-009/T-011.

---

## Item do ciclo: T-021 — link do Relatório perde o filtro de produto (`?produto=`)

### Situação: **NÃO ENTREGUE no código** (critérios 1–4 sem evidência; 5 parcial; 6 cumprido como baseline)

### O que o operador vê hoje (o defeito continua vivo)

1. Em **Relatórios**, o operador escolhe **"Glifosato 480 SL"** no select **Produto**. A tela mostra
   1 linha; a conta fecha.
2. Ele **recarrega a página** (F5 no computador do galpão) ou **copia o link** para o dono conferir no
   celular. O link é só `/relatorios`.
3. A tela reabre em **"Todos os produtos"** — o recorte por produto **não sobrevive** ao link nem ao
   reload, e o Excel/PDF baixado sai com o **estoque inteiro**, não com o produto que interessava.

**A correção não está no código:** `src/pages/Relatorios.tsx` guarda o produto em `useState('')`, o
`<select id="r-produto">` só chama `setProdutoId`, e `refletirNaUrl` só escreve `de`/`ate` montando
`URLSearchParams` à mão.

### O que deveria mudar (contrato com o usuário, para o próximo ciclo)

> **Escolher um produto no Relatório passa a deixar o recorte na URL** (`?produto=<id>`), então
> **recarregar ou compartilhar o link abre a mesma tela** — mesmo produto, mesmo arquivo.

- Abrir `/relatorios?produto=<id>` já mostra o produto selecionado e o relatório **filtrado**; vale
  também após **F5**, e para as abas **Resumo**, **Movimentações**, **Posição** e **Compras**
  (`montarRelatorio` já recorta tudo pelo `produtoId`).
- Trocar o select grava `produto=` na URL **sem sujar o histórico** (`replace`) e **sem params
  vazios** (voltar para "Todos os produtos" **remove** o parâmetro — contrato de `juntarFiltros`).
- Escolher um período (ex.: "Últimos 30 dias") **preserva** `produto=`: um recorte não apaga o outro.
- Link velho com produto **excluído** (id inexistente) **não quebra a tela** e não mostra erro: cai em
  **"Todos os produtos"** — mesma filosofia de `periodoDaUrl` ("link quebrado não derruba a tela").
- Um aviso discreto informa o recorte ativo ("Relatório e arquivos exportados mostram só
  **Glifosato 480 SL**") com atalho **"ver todos os produtos"** (e um `x` ao lado do select) que volta
  ao relatório completo e **devolve o foco ao select** — quem usa teclado não se perde.

### O que **não** muda (contrato com quem já usa e com o E2E)

- `<label className="rotulo" htmlFor="r-produto">Produto</label>` e o texto das opções
  (`Todos os produtos`, `p.nome`): o `getByRole('combobox', { name: 'Produto' })` de
  `e2e/app/relatorios.spec.ts` **não pode ser renomeado**.
- `getByLabel('De', { exact: true })`, KPIs (`main .cartao:has(span.text-2xl)` → 3), abas
  `Resumo`/`Movimentações`/`Posição`/`Compras` (`exact: true`), 4 checkboxes de seção, botões
  `Baixar Excel (.xlsx)`/`Baixar PDF`, texto `"Nenhuma movimentação no período."`, toast
  `"Escolha pelo menos uma seção do relatório."` — **todos congelados**.
- Nenhum `data-testid`/`aria-label`/texto existente muda; o único nome novo é
  `aria-label="Limpar filtro de produto"` (não colide com `Limpar filtros` do Histórico).
- O aviso de recorte **não** usa `aria-live`: `e2e/base.ts` escaneia `[aria-live="polite"]` para os
  toasts e um segundo `aria-live` na página cria ambiguidade nos specs.
- `lib/relatorio.ts` **não muda**: `doFiltro` já ignora id inexistente. `lib/periodos.ts` ganha no
  máximo helpers puros (`produtoDaUrl`, `paramsDoPeriodo`) — `periodoDaUrl`, `chaveIntervalo` e
  `juntarFiltros` **não** mudam.
- Breakpoint do grid (`grid gap-3 sm:grid-cols-3`) e ausência de rolagem horizontal
  (`navegacao.spec.ts › semRolagemHorizontal`) — T-021 é **estado/URL**, não redesenho.
- ⚠️ **`@/` não é alias válido** neste projeto: `tsconfig.json` usa `moduleResolution: bundler` e
  **não** declara `paths`; `vite.config.ts` **não** tem `resolve.alias`. Use caminhos relativos
  (padrão em 100% de `src/`).

### O que foi verificado neste ciclo (por leitura + comandos, sem maquiar)

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx tsc -p e2e/tsconfig.json --noEmit` | exit 0 |
| `npx vitest run` | 8 arquivos · **90/90** |
| `npm run build` | exit 0 · 2303 módulos · PWA ok · 1,06 s |
| `npx playwright test --list` | **171 testes / 17 arquivos** |
| `src/pages/Relatorios.tsx` | ❌ `useState('')`; `onChange={e => setProdutoId(e.target.value)}`; `refletirNaUrl(p, i)` só grava `de`/`ate` com `new URLSearchParams`; **sem** leitura de `?produto=`, sem Limpar, sem Aviso de recorte, sem `data-filtro="produto"` |
| `src/lib/periodos.ts` | ❌ sem `produtoDaUrl`/`paramsDoPeriodo`; `juntarFiltros` (o helper a reaproveitar) existe e é testado |
| `src/lib/estoque.ts` | ❌ sem `filtrarRecorte` (T-019 não entrou) |
| `src/lib/relatorio.ts` | `montarRelatorio(…, produtoId?)` com 6 parâmetros; `doFiltro` já ignora id inexistente |
| `src/lib/relatorio.test.ts` | **3** `it()`; nenhum de id inexistente |
| `src/lib/regras.test.ts` | 27 `it()`; `juntarFiltros` coberto, **sem** asserção de `produto` |
| `e2e/app/relatorios.spec.ts` | **5** casos; nenhum de `?produto=`/reload/limpar |
| `e2e/app/estoque-repor.spec.ts` | **não existe** (dívida herdada de T-009) |
| `memoria/estado.json` | `"plano_atual": null`, `"ciclos": 0` — plano do Arquiteto **não persistido** no arquivo |

Conclusão factual: o repositório está **verde** (tsc/vitest/build), mas **a correção de T-021 não foi
aplicada e a cobertura dela não está no disco**. O relatório de entrega afirmava `filtrarRecorte` em
`estoque.ts`, `produtoDaUrl`/`paramsDoPeriodo` em `periodos.ts`, 1 `it()` novo em `relatorio.test.ts`,
1 asserção nova em `regras.test.ts` e 3 casos E2E novos em `relatorios.spec.ts`; o disco mostra
**0 de todos eles**. Registrado sem maquiar.

---

## Itens anteriores aprovados

### T-016 / T-017 — "Exportar" do Estoque levando filtros para o Relatório

**NÃO ENTREGUE no código** (mesma evidência dos ciclos anteriores, reconfirmada agora).

O defeito do operador segue vivo: chip **"Repor"** + categoria **Fertilizante** em `/estoque`, toca
**Exportar** → abre `/relatorios` **sem filtro nenhum** porque `src/pages/Estoque.tsx` tem
`<Link to="/relatorios" className="btn btn-secundario">Exportar</Link>` fixo. O Excel/PDF sai com o
estoque inteiro e o operador confere linha a linha na planilha.

Contrato (inalterado): link carrega `categoria=`, `q=` e `situacao=` via `juntarFiltros` (a chave
interna `filtro=` **não** vaza); `Relatorios.tsx` lê os três, mostra um aviso com os filtros ativos e
um **"Limpar filtros"** que volta a `/relatorios` limpo; o recorte vale para **Posição** e
**Compras**; `Resumo` e `Movimentações` continuam completos. Sem filtro, o link leva a
`/relatorios` **exatamente** (tela de destino byte a byte como hoje).

> **Ordem de dependência:** T-021 é **pré-requisito** de T-016 — sem `?produto=` na URL via
> `juntarFiltros`, o link de T-016 perde o recorte de produto ao recarregar/compartilhar.

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

Decisões registradas: `saldosPorProduto` **permaneceu** (consumida por `Painel.tsx`, KPI "Para
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
antes do teste de presença em `periodos.ts`. **É o helper que T-016 e T-021 devem usar** (na
primeira escrita de qualquer filtro do Relatórios, para `de`/`ate`/`produto`).

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
> `l.situacao` do lote. Um produto abaixo do mínimo com 2 lotes apareceria como 2 linhas "Repor" se a
> regra de lote fosse usada — é exatamente o defeito que T-009 corrigiu na tela.

## Filtros do Relatórios e a URL (estado real, após T-021 não entregue)

| Param | Origem | Escrita | Leitura |
|---|---|---|---|
| `de` / `ate` | chips de período / input de data | `refletirNaUrl` (hoje com `URLSearchParams` à mão; **deve** migrar para `juntarFiltros`) | `periodoDaUrl(params, hojeISO())` |
| `produto` | `<select id="r-produto">` | **não escreve hoje** (T-021) | **não lê hoje** (T-021) |
| `q` / `categoria` / `situacao` | link do Estoque | — | **não lê** (T-016/T-017) |

Regra única que o Relatórios deve manter: **um só escritor de URL** (`refletirNaUrl`), sempre com
`juntarFiltros` e `{ replace: true }`; valor `''` ⇒ `null` ⇒ parâmetro **removido**. Produto
inexistente é ignorado (`doFiltro` do `montarRelatorio` já garante), **sem** toast de erro.

## Estado do backlog (persistido em `memoria/estado.json`)

Aberto após este ciclo (ordem de prioridade):

- **T-016** (prio 1, bug) — "Exportar" do Estoque abre `/relatorios` sem os filtros da tela.
  **Não entregue.**
- **T-021** (prio 1, bug) — `?produto=` do Relatórios não vai para a URL; link compartilhado abre
  "Todos os produtos". **Não entregue** (pré-requisito de T-016).
- **T-019** (prio 2, refatoração) — recorte único reutilizável (produto+termo+categoria+situação)
  entre Estoque e Relatórios. `filtrarRecorte` **não existe**.
- **T-017** (prio 2, melhoria) — aba Posição ignora busca/categoria e não avisa que os filtros vieram
  no link. **Não entregue.**
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
- **Processo:** `plano_atual` continua `null` em `memoria/estado.json` e `"ciclos": 0`, mas os ciclos
  estão registrados em `memoria/historico.md` — o `estado.json` não reflete o histórico (divergência
  de ferramenta, não de código).
