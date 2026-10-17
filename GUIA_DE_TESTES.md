# Guia de Testes — ERP Galpão

> **Estado deste ciclo: APROVADO.** `npx tsc --noEmit` exit=0, `npx vitest run` exit=0
> (7 arquivos, **85/85 testes**), `npm run build` exit=0. Os 2 erros de tipo e os 2 testes
> vermelhos do ciclo anterior foram corrigidos. Item **T-001 concluído** no backlog.

## 1. Comandos obrigatórios (ordem)

```bash
npx tsc --noEmit     # tipagem: PRECISA sair com exit=0
npx vitest run       # testes: PRECISA sair com 0 falhas
npm run build        # tsc -p . + vite build: recomendado antes de release
```

Regra de aceite: **os três comandos verdes**. Um vermelho = ciclo reprovado.

## 2. Última verificação (QA) — ciclo T-001, reenvio após correção

| Comando | Exit | Resultado |
|---|---|---|
| `npx tsc --noEmit` | **0** | nenhum erro |
| `npx vitest run` | **0** | 7 arquivos, **85 testes, 85 passando** (9,55 s) |
| `npm run build` | **0** | 2303 módulos, PWA `generateSW`, 11 entradas precache (1.018,56 KiB), 1,02 s |

### 2.1 O que estava quebrado no ciclo anterior e como foi corrigido

| Defeito | Arquivo | Correção verificada |
|---|---|---|
| `TS2322` — `situacao` de `ItemCompra` recebia `SituacaoReposicao` | `src/lib/estoque.ts` | `noPontoDePedido` virou type guard `situacao is SituacaoPedido`; `filtrarItensCompra` grava `comoSituacaoPedido(item.situacao)` (tipo `'abaixo' \| 'no_minimo'`). `tsc` limpo. |
| `TS6133` — `formatarNumero` importado e não usado | `src/lib/exportar/pdf.ts` | import agora traz só `formatarData`, `formatarDataHora`, `formatarValidade` e os helpers de `comum.ts`. `tsc` limpo. |
| `lista-compra.test.ts:62` — `codigo: 'P0005'` × `P0001` | teste | os produtos de teste passaram a declarar `codigo_interno` explícito (`P0001`/`P0002`/`P0003`); a expectativa confere com o código de produção. |
| `lista-compra.test.ts:136` — `getCell(8).value` esperando `8` × `'8 kg (2 emb.)'` | decisão alinhada | **Excel = número puro** (`formatoNumero(comprar, sugestaoCompra)`, negrito verde); **PDF = texto com unidade + embalagem** (`"8 kg (2 emb.)"`). O teste agora espera `8` no Excel; a legenda da planilha explica o arredondamento. |

### 2.2 Regressão conferida (nada caiu)

- `src/pdv/venda.test.ts` 13 · `src/lib/relatorio.test.ts` 3 · `src/lib/regras.test.ts` 27
- `src/lib/exportar/exportar.test.ts` 6 — 4 abas na ordem, `A5 = 'Código'`, `fgColor FF047857`,
  aba "Lista de compras" ausente com `compras:false`, PDF maior com a seção
- `src/lib/exportar/lista-compra.test.ts` **8** (era 6 verdes + 2 vermelhos)
- `src/pdv/sincronizador.test.ts` 6 · `servidor-local/supabase-local.test.ts` 22 (inclui
  WebSocket "cada aparelho só recebe alterações que tem permissão de ver" e
  "os dados e as sessões sobrevivem a um reinício")

## 3. Cobertura atual dos testes

| Arquivo | Testes | Escopo |
|---|---|---|
| `src/lib/regras.test.ts` | 27 | formato (validade, `lerNumero`, `formatarDelta`), `situacaoLote`, `montarLinhasEstoque`, `resumirProduto`, códigos de barras/GTIN, GS1, períodos + `periodoDaUrl`, `totaisPorGrupo`, permissões por papel, grupos de movimentação, domínio de reposição (§3.1) |
| `src/lib/relatorio.test.ts` | 3 | lista de compras do relatório (§3.3) |
| `src/lib/exportar/exportar.test.ts` | 6 | Excel (4 abas, cores, aba "Lista de compras", ausência da aba quando a seção está desmarcada) e PDF (`%PDF-`, cresce com a seção de compras) |
| `src/lib/exportar/lista-compra.test.ts` | **8** | `filtrarItensCompra`, `nomeArquivoListaCompra`, `gerarListaCompraExcel`, `gerarListaCompraPdf` (§3.4) |
| `src/pdv/venda.test.ts` | 13 | regras da venda no PDV |
| `src/pdv/sincronizador.test.ts` | 6 | sincronização offline |
| `servidor-local/supabase-local.test.ts` | 22 | banco local, tempo real (WebSocket), persistência entre reinícios |

### 3.1 Domínio de reposição — coberto

`src/lib/estoque.ts` (`situacaoReposicao`, `sugerirCompra`, `calcularCobertura`,
`montarReposicao`, `precisaRepor`, `saldosPorProduto`) tem casos em `regras.test.ts`:

- `minimo === null` → `'sem_minimo'`, `cobertura === null`, `sugestaoCompra === 0`
- `minimo <= 0` → `'sem_minimo'` (zero = desligado)
- `saldo <= 0` com mínimo → `'abaixo'`
- `saldo < minimo` → `'abaixo'` · `saldo === minimo` → `'no_minimo'` · `saldo > minimo` → `'acima'`
- `sugerirCompra` arredondando por `conteudo_embalagem` (saldo 5, mínimo 12, embalagem 20 → 20)
- `sugerirCompra` sem embalagem (saldo 5, mínimo 12 → 7)
- `montarReposicao` ignora `ativo=false` e `controla_estoque=false`

### 3.2 Filtros na URL e totais da lista (T-006) — coberto

`src/lib/periodos.ts` (`periodoDaUrl`, `chaveIntervalo`, `juntarFiltros`) e
`src/lib/formato.ts` (`totaisPorGrupo`) têm casos em `regras.test.ts`:

- `periodoDaUrl` sem params → `'7dias'` com `intervaloRapido('7dias')`, `personalizado: false`
- `periodoDaUrl` com `de`/`ate` válidos (`2026-10-01` … `2026-10-03`) → `'personalizado'`, `personalizado: true`
- mês/ano aceitos só se a data existe (`2026-02-31` **rejeitado**), `de > ate` rejeitado, `ate` no futuro rejeitado
- um lado só (`de` sem `ate`) → cai no padrão **sem lançar** (`expect(...).not.toThrow()`)
- `chaveIntervalo` → `'AAAA-MM-DD|AAAA-MM-DD'` (dependência estável de efeito)
- `juntarFiltros` → remove `tipo` nulo, remove `q` só com espaços, preserva acentos (`guaraná`)
- `totaisPorGrupo([])` → `lancamentos: 0` e somas 0
- `totaisPorGrupo` com `ENTRADA/DEVOLUCAO` → entradas, `SAIDA/VENDA` → saídas (soma negativa), `AJUSTE/CORRECAO` → ajustes

### 3.3 Lista de compras (reposição) no relatório (T-001) — coberto

`src/lib/relatorio.test.ts` valida `montarRelatorio(...).compras` (só produtos no ponto de pedido):

- entram **apenas** `abaixo` e `no_minimo`; `acima` e `sem_minimo` ficam fora
- ordenação do mais crítico ao menos crítico (cobertura asc): `p2` (0,25) → `p1` (0,50) → `p3` (1,00)
- `sugestaoCompra === sugerirCompra(...)` e `cobertura === calcularCobertura(...)` — prova que
  `relatorio.ts` **não** reimplementa regra
- sem produto no ponto de pedido → `compras === []`
- filtro `produtoId` respeitado na lista de compras

`src/lib/exportar/exportar.test.ts` (Excel/PDF):

- `TODAS` → 4 abas **na ordem**: `Resumo por produto`, `Movimentações`, `Posição de estoque`, `Lista de compras`
- cabeçalho verde `FF047857` em `A5`; linha 5 == `Código…Comprar`; valores 3 / 10 / 0,3 / 8 no 1º produto
- lista vazia ainda cria a aba com "Nenhum produto no ponto de pedido." em `A6`
- `SEM_COMPRAS` → só 3 abas, `getWorksheet('Lista de compras')` **undefined** (CA-5)
- PDF começa com `%PDF-` e é **maior** com `compras: true` (CA-6)

### 3.4 Lista de compras fora do relatório (`lista-compra.test.ts`) — 8/8 verdes

Cobre `filtrarItensCompra` (função pura em `lib/estoque.ts`), `nomeArquivoListaCompra`,
`gerarListaCompraExcel` e `gerarListaCompraPdf` (`lib/exportar/lista-compra.ts`).

- **ordem por cobertura**: `p` (0,3) antes de `q` (1,0), independente da ordem do `Set`
- `situacoes === ['abaixo', 'no_minimo']` e `sugestaoCompra === 0` preservado no `no_minimo`
- **cópia sem recálculo**: `codigo='P0001'`, `categoria`, `unidade='kg'`, `saldo/minimo/cobertura/sugestao`
  iguais à origem, `sugestaoCompra === 8` (7 → 2 embalagens de 4)
- `Set` vazio ⇒ `[]`; id inexistente ignorado; acima do mínimo fora mesmo selecionado
- `nomeArquivoListaCompra` → `lista-de-compras_2026-10-03.xlsx|pdf` e default `\d{4}-\d{2}-\d{2}`
- Excel: 1 aba `Lista de compras`, `A1` = empresa, `A2` contém `— 2 produtos`, `A3` = `Gerado em …`,
  linha 5 com as 10 colunas, `fgColor FF047857`, linha 6 = 3 / 10 / 0,3 / **8 (número)**,
  colunas 9 e 10 `null`, `rowCount === 5 + itens + 1` (legenda)
- Excel sem seleção: aviso "Nenhum produto selecionado para compra." em `A6`
- PDF: `%PDF-` e > 5000 bytes, com e sem itens

> **Contrato de formatação da coluna "Comprar" (decidido neste ciclo):**
> **Excel** ⇒ número puro (reaproveitável pelo fornecedor, negrito verde);
> **PDF** ⇒ texto `"8 kg (2 emb.)"`. O teste trava o número no Excel; a legenda da planilha
> registra o arredondamento pela embalagem.

> **Regra para os próximos ciclos:** todo helper puro novo em `src/lib/` (`periodos.ts`,
> `formato.ts`, `estoque.ts`, `relatorio.ts`, `exportar/lista-compra.ts`) **precisa** de caso em
> `regras.test.ts` (ou num `*.test.ts` próprio do módulo) no mesmo commit, **verde**.

## 4. Como rodar um teste isolado

```bash
npx vitest run src/lib/regras.test.ts
npx vitest run src/lib/relatorio.test.ts
npx vitest run src/lib/exportar/lista-compra.test.ts
npx vitest run -t "Lista de compras"
npx vitest run -t "Excel: 1 aba"
```

## 5. Checklist de PR (não pular)

- [x] `npx tsc --noEmit` exit 0
- [x] `npx vitest run` 0 falhas (85/85)
- [x] `npm run build` exit 0
- [x] Novo domínio em `lib/` tem teste próprio (`relatorio.test.ts`, `lista-compra.test.ts`)
- [x] Sem `TODO`/`FIXME`/placeholder nos arquivos tocados
- [x] Nenhuma alteração em `src/lib/dados/*` nem `supabase/migrations/*` neste ciclo
- [ ] Filtros da URL (`?de=&ate=&tipo=&q=`) ainda **sem teste de componente** — coberto só
      no nível de `periodos.ts`; smoke manual de Histórico/Relatórios pendente
- [ ] Checkbox "Lista de compras (reposição)" e o toast "Escolha pelo menos uma seção do
      relatório." (CA-7) só têm verificação **por revisão de código** — não há teste de
      componente (nenhum `*.test.tsx` no projeto, `@testing-library` não instalado)
- [ ] T-001: seleção/checkboxes/`BarraAcoesCompra` (`Estoque.tsx`, `ListaReposicao.tsx`) sem
      teste de componente — só revisão de código; CA-2/3/4/5 verificáveis por `filter['aria-label']`
      exigiriam `@testing-library`
