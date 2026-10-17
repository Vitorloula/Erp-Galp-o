# Guia de Testes — ERP Galpão

> **Estado deste ciclo: APROVADO.** `tsc`, `vitest` e `npm run build` estão verdes. Ver "Última verificação".

## 1. Comandos obrigatórios (ordem)

```bash
npx tsc --noEmit     # tipagem: PRECISA sair com exit=0
npx vitest run       # testes: PRECISA sair com 0 falhas
npm run build        # tsc -p . + vite build: recomendado antes de release
```

Regra de aceite: **os dois primeiros comandos verdes**. Um verde e outro vermelho = ciclo reprovado.

## 2. Última verificação (QA) — ciclo T-006

| Comando | Exit | Resultado |
|---|---|---|
| `npx tsc --noEmit` | **0** | sem erros |
| `npx vitest run` | **0** | 5 arquivos, **70 testes, 70 passando** (9,11 s) |
| `npm run build` | **0** | 2299 módulos, PWA gerado (`dist/sw.js`), 6,90 s |

Distribuição: `venda.test.ts` 13 · `regras.test.ts` **27** · `exportar.test.ts` 2 ·
`sincronizador.test.ts` 6 · `supabase-local.test.ts` 22.

### 2.1 Falha encontrada e corrigida neste ciclo

`src/lib/regras.test.ts > períodos > chaveIntervalo e juntarFiltros alimentam o link compartilhável`

```
AssertionError: expected 'de=2026-10-01&ate=2026-10-03&q=+' to be 'de=2026-10-01&ate=2026-10-03'
```

Causa: `juntarFiltros` usava `if (valor)` para decidir entre `set` e `delete`; a string `' '`
é *truthy*, então gravava `?q=+` na URL (espaço puro vira lixo de link compartilhado e
dispara busca vazia). Correção em `src/lib/periodos.ts`: o valor é **aparado** antes do
teste (`bruto.trim()`), então vazio/espaços removem o parâmetro. Nenhuma assinatura mudou;
`periodoDaUrl`, `intervaloRapido`, `intervaloParaInstantes` seguem com o mesmo contrato.

## 3. Cobertura atual dos testes

| Arquivo | Testes | Escopo |
|---|---|---|
| `src/lib/regras.test.ts` | 27 | formato (validade, `lerNumero`, `formatarDelta`), `situacaoLote`, `montarLinhasEstoque`, `resumirProduto`, códigos de barras/GTIN, GS1, **períodos + `periodoDaUrl`**, **`totaisPorGrupo`**, permissões por papel, grupos de movimentação, domínio de reposição (§3.1) |
| `src/lib/exportar/exportar.test.ts` | 2 | geração de Excel/PDF |
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

> **Regra para o próximo ciclo:** todo helper puro novo em `src/lib/` (`periodos.ts`,
> `formato.ts`, `estoque.ts`, `relatorio.ts`) **precisa** de caso em `regras.test.ts` no
> mesmo commit. `periodoDaUrl` e `totaisPorGrupo` entraram assim.

## 4. Como rodar um teste isolado

```bash
npx vitest run src/lib/regras.test.ts
npx vitest run -t "períodos"
npx vitest run -t "totais das movimentações na tela"
```

## 5. Checklist de PR (não pular)

- [x] `npx tsc --noEmit` exit 0
- [x] `npx vitest run` 0 falhas
- [x] `npm run build` exit 0
- [x] Novo domínio em `lib/` tem teste em `regras.test.ts`
- [x] Sem `TODO`/`FIXME`/placeholder nos arquivos tocados
- [x] Nenhuma alteração em `src/lib/dados/*` nem `supabase/migrations/*` neste ciclo
- [ ] Filtros da URL (`?de=&ate=&tipo=&q=`) ainda **sem teste de componente** — coberto só
      no nível de `periodos.ts`; smoke manual de Histórico/Relatórios pendente
