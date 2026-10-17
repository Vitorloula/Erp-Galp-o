# Guia de Testes — ERP Galpão

> **Estado deste ciclo: APROVADO.** `tsc` e `vitest` estão verdes. Ver "Última verificação".

## 1. Comandos obrigatórios (ordem)

```bash
npx tsc --noEmit     # tipagem: PRECISA sair com exit=0
npx vitest run       # testes: PRECISA sair com 0 falhas
npm run build        # recomendado antes de release (não executado neste ciclo)
```

Regra de aceite: **os dois primeiros comandos verdes**. Um verde e outro vermelho = ciclo reprovado.

## 2. Última verificação (QA)

| Comando | Exit | Resultado |
|---|---|---|
| `npx tsc --noEmit` | **0** | sem erros (o `TS2345` em `ProdutoForm.tsx` foi corrigido) |
| `npx vitest run` | **0** | 5 arquivos, **63 testes, 63 passando** (9,15 s) |

Distribuição: `venda.test.ts` 13 · `regras.test.ts` 20 · `exportar.test.ts` 2 ·
`sincronizador.test.ts` 6 · `supabase-local.test.ts` 22.

> A falha `TS2345: Property 'estoque_minimo' is missing ... in type 'ProdutoDados'` em
> `src/components/ProdutoForm.tsx` está resolvida. Também ficou registrado que a previsão
> anterior de quebra em `regras.test.ts`/`exportar.test.ts` por causa do novo campo
> obrigatório **não se confirmou** — os helpers usam `...extra` e seguem válidos.

## 3. Cobertura atual dos testes

| Arquivo | Testes | Escopo |
|---|---|---|
| `src/lib/regras.test.ts` | 20 | formato (validade, `lerNumero`), `situacaoLote`, `montarLinhasEstoque`, `resumirProduto`, códigos de barras/GTIN, GS1, períodos, permissões por papel, grupos de movimentação, **domínio de reposição (§3.1)** |
| `src/lib/exportar/exportar.test.ts` | 2 | geração de Excel/PDF |
| `src/pdv/venda.test.ts` | 13 | regras da venda no PDV |
| `src/pdv/sincronizador.test.ts` | 6 | sincronização offline |
| `servidor-local/supabase-local.test.ts` | 22 | banco local, tempo real (WebSocket), persistência entre reinícios |

### 3.1 Domínio de reposição — coberto

`src/lib/estoque.ts` (`situacaoReposicao`, `sugerirCompra`, `calcularCobertura`,
`montarReposicao`, `precisaRepor`, `saldosPorProduto`) agora tem casos em `regras.test.ts`:

- `minimo === null` → `'sem_minimo'`, `cobertura === null`, `sugestaoCompra === 0`
- `minimo <= 0` → `'sem_minimo'` (zero = desligado)
- `saldo <= 0` com mínimo → `'abaixo'`
- `saldo < minimo` → `'abaixo'`
- `saldo === minimo` → `'no_minimo'`
- `saldo > minimo` → `'acima'`
- `sugerirCompra` arredondando por `conteudo_embalagem` (saldo 5, mínimo 12, embalagem 20 → 20)
- `sugerirCompra` sem embalagem (saldo 5, mínimo 12 → 7)
- `montarReposicao` ignora `ativo=false` e `controla_estoque=false`

## 4. Como rodar um teste isolado

```bash
npx vitest run src/lib/regras.test.ts
npx vitest run -t "estoque mínimo"
```

## 5. Checklist de PR (não pular)

- [x] `npx tsc --noEmit` exit 0
- [x] `npx vitest run` 0 falhas
- [x] Novo domínio em `lib/` tem teste em `regras.test.ts`
- [x] Sem `TODO`/`FIXME`/placeholder deixado para trás nos arquivos tocados
- [ ] `npm run build` antes de release
