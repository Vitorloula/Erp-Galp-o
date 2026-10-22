# Manual de teste — ERP Galpão (piloto controlado)

Este guia valida, numa loja real **sem venda fiscal** (sem NFC-e e sem cobrança), o
núcleo que foi entregue: sincronização do estoque mínimo entre aparelhos, filtros na
URL e os pontos de integração de NFC-e/Asaas (desligados por padrão).

> Pré-requisito: [Node.js](https://nodejs.org) 22.12+.

---

## 1. Subir o sistema (servidor local)

```bash
npm install
npm run dev
```

Abra **http://localhost:5173**. Sem `.env`, o `npm run dev` sobe junto o
"Supabase" local (PGlite) com as mesmas migrações da nuvem.

Para testar **no celular** (mesmo Wi-Fi): use o endereço `Network` do terminal
(ex.: `http://192.168.0.110:5173`).

---

## 2. Criar conta e primeira empresa

1. Clique em **Criar conta**.
2. Escolha o segmento (ex.: **Galpão/distribuidora**) — as categorias já vêm prontas.
3. Recomendado: **Conhecer com dados de exemplo** (empresa de exemplo já populada) ou cadastre sua empresa.

---

## 3. Cadastrar um produto com estoque mínimo (pré-requisito da lista de compras)

1. Vá em **Produtos → Cadastrar produto**.
2. Preencha nome, unidade, código (ou escaneie) e salve.
3. No **Estoque**, filtro **Repor**, abra o produto e toque em **definir estoque mínimo** (formulário de reposição). Informe um mínimo (ex.: `10`) e salve.

---

## 4. Sincronização do estoque mínimo (fix da migration `estoque_minimo`)

**Objetivo:** o mínimo/ponto de pedido deve viajar entre computador e celular.

1. No **computador**, defina o estoque mínimo de um produto (passo 3).
2. No **celular** (mesma loja), abra **Estoque → Repor**.
3. ✅ O produto deve aparecer na lista de compras com o **mesmo mínimo** cadastrado no computador.
4. Antes da migration, o mínimo ficava só no aparelho (localStorage) — agora sincroniza.

---

## 5. Filtros na URL (fix T-021 — link do Relatório mantém o produto)

**Objetivo:** recarregar ou compartilhar o link do Relatório preserva o recorte.

1. Em **Relatórios**, escolha um produto no select **Produto**.
2. Repare que a URL passa a conter `?produto=<id>`.
3. Aperte **F5** (ou copie o link e abra noutra aba).
4. ✅ O mesmo produto continua selecionado e o relatório/arquivo saem filtrados.
5. Aparece o aviso *"Relatório e arquivos exportados mostram só `<produto>`"* com o botão **ver todos os produtos** — toque nele e o filtro some da URL.
6. Link com produto excluído (id inexistente) → cai em **Todos os produtos** sem erro.

---

## 6. Lista de compras / exportação (regressão)

1. Em **Estoque → Repor**, marque produtos e **Baixar Excel** e **Baixar PDF**.
2. ✅ O chip **"Repor N"**, a tabela e o arquivo devem mostrar a **mesma contagem** (uma linha por produto).

---

## 7. Pontos de integração NFC-e e Asaas (desligados por padrão)

**Objetivo:** confirmar que estão "no ponto de só colocar as keys", sem quebrar o fluxo.

1. Confira em `.env.example` as chaves comentadas `VITE_NFCE_*` e `VITE_ASAAS_API_KEY`.
2. Sem essas chaves, os módulos `src/lib/nfce.ts` e `src/lib/cobranca.ts` ficam
   **desligados**: o caixa emite o cupom normal (não fiscal) e a assinatura continua no fluxo de trial.
3. Para ligar depois, é só preencher as keys (idealmente em segredos do Supabase + Edge Function) e trocar o stub pela API real.

---

## 8. Testes automatizados (validação de regressão)

```bash
npm run lint      # tsc --noEmit (type-check)
npm test          # 91 testes de regras/servidor local (vitest)
npm run test:sql  # 219 verificações de segurança do banco (RLS, papéis, assinatura)
npm run test:e2e  # telas no navegador (Playwright + Edge), 171 testes
npm run build     # gera dist para publicação
```

Todos devem terminar com **exit 0**.

---

## Pendências conhecidas (próximas entregas)

- **T-016/T-017** — botão "Exportar" do Estoque levar os filtros (categoria/busca/situação) para o Relatório, e o Relatório aplicá-los (depende da refatoração `filtrarRecorte`, T-019). *O `?produto=` (T-021) já foi entregue.*
- **T-024** — inventário cego (contagem física).
- **T-025** — backup automático do banco.
- **NFC-e real e Asaas real** — só plugar as keys/API (scaffolding pronto).
