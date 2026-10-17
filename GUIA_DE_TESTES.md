# Guia de Testes — ERP Galpão

> **Estado deste ciclo: APROVADO.** `tsc`, `vitest` e `npm run build` estão verdes. Ver "Última verificação".

## 1. Comandos obrigatórios (ordem)

```bash
npx tsc --noEmit     # tipagem: PRECISA sair com exit=0
npx vitest run       # testes: PRECISA sair com 0 falhas
npm run build        # tsc -p . + vite build: recomendado antes de release
```

Regra de aceite: **os dois primeiros comandos verdes**. Um verde e outro vermelho = ciclo reprovado.

## 2. Última verificação (QA) — ciclo T-001

| Comando | Exit | Resultado |
|---|---|---|
| `npx tsc --noEmit` | **0** | sem erros |
| `npx vitest run` | **0** | 6 arquivos, **77 testes, 77 passando** (9,07 s) |
| `npm run build` | **0** | 2299 módulos, PWA gerado (`dist/sw.js`), 894 ms |

Distribuição: `venda.test.ts` 13 · `relatorio.test.ts` **3 (novo)** · `regras.test.ts` 27 ·
`exportar.test.ts` **6** (era 2) · `sincronizador.test.ts` 6 · `supabase-local.test.ts` 22.

Sem falha em nenhuma das rodadas deste ciclo (as correções foram feitas pelo DEV antes do QA).

## 3. Cobertura atual dos testes

| Arquivo | Testes | Escopo |
|---|---|---|
| `src/lib/regras.test.ts` | 27 | formato (validade, `lerNumero`, `formatarDelta`), `situacaoLote`, `montarLinhasEstoque`, `resumirProduto`, códigos de barras/GTIN, GS1, períodos + `periodoDaUrl`, `totaisPorGrupo`, permissões por papel, grupos de movimentação, domínio de reposição (§3.1) |
| `src/lib/relatorio.test.ts` | **3** | lista de compras do relatório (§3.3) |
| `src/lib/exportar/exportar.test.ts` | 6 | Excel (4 abas, cores, aba "Lista de compras", ausência da aba quando a seção está desmarcada) e PDF (`%PDF-`, cresce com a seção de compras) |
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
- `sugestaoCompra === sugerirCompra(saldo, minimo, conteudo_embalagem)` e
  `cobertura === calcularCobertura(saldo, minimo)` — prova que `relatorio.ts` **não** reimplementa regra
- sem produto no ponto de pedido → `compras === []`
- filtro `produtoId` respeitado na lista de compras

`src/lib/exportar/exportar.test.ts` (Excel/PDF):

- `TODAS` → 4 abas **na ordem**: `Resumo por produto`, `Movimentações`, `Posição de estoque`, `Lista de compras`
- cabeçalho verde `FF047857` em `A5`; linha 5 == `Código…Comprar`; valores 3 / 10 / 0,3 / 8 no 1º produto
  (reposição com embalagem: saldo 3, mínimo 10, embalagem 4 → comprar 8)
- lista vazia ainda cria a aba com "Nenhum produto no ponto de pedido." em `A6`
- `SEM_COMPRAS` → só 3 abas, `getWorksheet('Lista de compras')` **undefined** (CA-5)
- PDF começa com `%PDF-` e é **maior** com `compras: true` do que sem a seção (CA-6)

> **Regra para o próximo ciclo:** todo helper puro novo em `src/lib/` (`periodos.ts`,
> `formato.ts`, `estoque.ts`, `relatorio.ts`) **precisa** de caso em `regras.test.ts` (ou num
> `*.test.ts` próprio do módulo) no mesmo commit. `relatorio.test.ts` nasceu assim.

## 4. Como rodar um teste isolado

```bash
npx vitest run src/lib/regras.test.ts
npx vitest run src/lib/relatorio.test.ts
npx vitest run -t "Lista de compras"
npx vitest run -t "PDF cresce com a seção de compras"
```

## 5. Checklist de PR (não pular)

- [x] `npx tsc --noEmit` exit 0
- [x] `npx vitest run` 0 falhas (77/77)
- [x] `npm run build` exit 0
- [x] Novo domínio em `lib/` tem teste próprio (`relatorio.test.ts`)
- [x] Sem `TODO`/`FIXME`/placeholder nos arquivos tocados
- [x] Nenhuma alteração em `src/lib/dados/*` nem `supabase/migrations/*` neste ciclo
- [ ] Filtros da URL (`?de=&ate=&tipo=&q=`) ainda **sem teste de componente** — coberto só
      no nível de `periodos.ts`; smoke manual de Histórico/Relatórios pendente
- [ ] Checkbox "Lista de compras (reposição)" e o toast "Escolha pelo menos uma seção do
      relatório." (CA-7) só têm verificação **por revisão de código** — não há teste de
      componente (nenhum `*.test.tsx` no projeto, `@testing-library` não instalado)
