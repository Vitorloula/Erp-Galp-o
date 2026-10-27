# Manual de teste — ERP Galpão (piloto controlado)

Este guia valida, numa loja real **sem venda fiscal** (sem NFC-e e sem cobrança), o
núcleo entregue para o piloto: catálogo e saldo inicial, estoque por lote, inventário
cego por lote, LGPD, backup local, monitoramento e os pontos de integração de
NFC-e/Asaas (desligados por padrão).

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
3. Recomendado: **Conhecer com dados de exemplo** (empresa de exemplo já populada) ou
   cadastre sua empresa.
4. Confira se a loja principal e o **Caixa 01** foram criados.

---

## 3. Cadastrar produto com estoque mínimo

1. Vá em **Produtos → Novo produto**.
2. Preencha nome, unidade, preço, código (ou deixe automático) e o **Estoque mínimo**
   (ex.: `10`).
3. Salve e abra o produto. ✅ O detalhe mostra “Estoque mínimo” e o valor salvo.
4. No **Estoque → Repor**, o produto deve aparecer quando o saldo ficar abaixo do
   mínimo.

---

## 4. Sincronização do estoque mínimo entre aparelhos

**Objetivo:** o mínimo/ponto de pedido deve viajar entre computador e celular.

1. No **computador**, defina o estoque mínimo de um produto (passo 3).
2. No **celular** (mesma loja), abra **Estoque → Repor**.
3. ✅ O produto deve aparecer com o mesmo mínimo cadastrado no computador.
4. O valor agora fica em `produtos.estoque_minimo` no banco, não apenas no aparelho.

---

## 5. Importar catálogo e saldo inicial

**Objetivo:** subir uma planilha real sem digitar produto por produto.

1. Em **Produtos**, clique em **Importar**.
2. Baixe o **modelo CSV** e preencha pelo menos `nome`; para saldo inicial use
   `quantidade`, `lote` e `validade`.
3. Selecione o arquivo `.csv` ou `.xlsx`.
4. ✅ A prévia mostra quantos produtos estão prontos e os erros por linha.
5. Clique em **Importar**. ✅ O resultado informa produtos criados, saldos lançados e
   eventuais falhas.
6. Abra um produto importado e confira preço, ponto de pedido e lote/saldo.
7. Teste uma linha inválida (sem nome ou código repetido): as demais devem entrar e o
   erro deve apontar a linha.

> Planilhas com `;`, `,` ou tab são aceitas. Números como `19,90` e datas como
> `31/12/2027` são convertidos. O saldo inicial vira uma `ENTRADA` com documento
> “Saldo inicial importado”.

---

## 6. Inventário cego por lote

**Objetivo:** contar o estoque físico sem ver o saldo e ajustar o lote correto.

1. Vá em **Inventário** (menu lateral, ou **Mais** no celular).
2. Busque um produto com **dois lotes** (na empresa de exemplo, “Atrazina 500 SC”).
3. ✅ Aparecem duas linhas, uma por lote, **sem o saldo do sistema**.
4. Preencha o **Contado** de cada lote. A contagem fica salva como rascunho no aparelho;
   recarregue a página para conferir.
5. Clique em **Revisar**. ✅ A tela mostra saldo do sistema e diferença por lote.
6. Clique em **Gerar ajustes**. ✅ É criado um `AJUSTE` no lote contado, não no
   “primeiro lote” do produto.
7. Confira o histórico do produto e os saldos dos dois lotes.
8. Em um produto sem lote cadastrado, informe o número do lote e a validade na própria
   linha antes de gerar o ajuste.

---

## 7. Privacidade e LGPD

**Objetivo:** confirmar páginas públicas e portabilidade dos dados.

1. Abra `/privacidade.html` e `/termos.html` numa aba anônima. ✅ As páginas abrem sem
   login e explicam o escopo não fiscal do piloto.
2. Entre como **dono** e vá em **Empresa → Privacidade e seus dados**.
3. Clique em **Baixar dados (JSON)**. ✅ O arquivo baixa com catálogo, estoque,
   movimentações, vendas, equipe e configurações.
4. Confirme que o JSON **não** contém senhas nem token de convite.
5. Os links de Política e Termos também aparecem no **Login** e em **Mais**.

---

## 8. Backup local e monitoramento

**Backup local:**

1. Pare o `npm run dev` e rode:
   ```bash
   npm run backup
   ```
2. ✅ A mensagem confirma o caminho em `servidor-local/backup/backup-<data>.tar`.
3. Para restaurar: `node scripts/backup.mjs --restore <arquivo.tar>`.

**Monitoramento:**

1. Abra a tela de erro (pode ser provocada em desenvolvimento) e clique em
   **Copiar diagnóstico**.
2. Como suporte, consulte com a service role:
   ```sql
   select criado_em, empresa_id, mensagem, url, stack
   from public.erros_cliente
   order by criado_em desc
   limit 20;
   ```
3. ✅ Dono/gerente só veem erros da própria empresa; outra empresa não vê nada.

> Em produção, o backup é responsabilidade do Supabase. A restauração em nuvem ainda
> precisa ser ensaiada num projeto de staging antes de prometer recuperação ao cliente.

---

## 9. Filtros na URL e relatórios

1. Em **Relatórios**, escolha um produto no select **Produto**.
2. ✅ A URL passa a conter `?produto=<id>`.
3. Aperte **F5** (ou copie o link e abra noutra aba). ✅ O mesmo produto continua
   selecionado e o arquivo sai filtrado.
4. O aviso de recorte tem **ver todos os produtos**; link com id inexistente cai em
   “Todos os produtos” sem erro.
5. Em **Estoque**, filtre categoria/busca/situação e clique em **Exportar**. ✅ O
   Relatório abre com os filtros aplicados, e **Limpar filtros** volta ao completo.

---

## 10. Lista de compras / exportação (regressão)

1. Em **Estoque → Repor**, marque produtos e baixe **Excel** e **PDF**.
2. ✅ O chip **“Repor N”**, a tabela e o arquivo mostram a mesma contagem (uma linha por
   produto).
3. ✅ Uma seção vazia no relatório mostra `(0)`/aviso antes do download, sem quebrar a
   geração.

---

## 11. Operação do piloto (cortesia/trial)

Com a service role configurada no computador do suporte:

```powershell
npm run piloto -- listar
npm run piloto -- status <empresa_id>
npm run piloto -- cortesia <empresa_id>
npm run piloto -- trial <empresa_id> 60
```

✅ A assinatura muda sem abrir o painel e a empresa continua acessível. Nunca coloque
a service role no `.env` do frontend publicado.

---

## 12. Pontos de integração NFC-e e Asaas (desligados por padrão)

1. Confira em `.env.example` as chaves `VITE_NFCE_*` e `VITE_ASAAS_API_KEY`.
2. Sem essas chaves, `src/lib/nfce.ts` e `src/lib/cobranca.ts` ficam **desligados**: o
   caixa emite o cupom normal (não fiscal) e a assinatura continua no trial/cortesia.
3. Para ligar depois, use segredos no Supabase/Edge Function e troque o stub pela API
   real. **Não** é parte do piloto atual.

---

## 13. Testes automatizados

```bash
npm run lint          # tsc --noEmit
npm test              # Vitest: 117 testes
npm run test:sql      # PGlite: 238 verificações de RLS/regras
npm run test:e2e:smoke # fluxos principais, workers=1
npm run test:e2e:ci   # Playwright com retries (CI)
npm run build         # gera dist para publicação
```

Todos devem terminar com **exit 0**. O E2E completo roda no CI; localmente, use
`--workers=1` ao investigar falhas.

---

## Pendências conhecidas

- **T-028**: validar o piloto em loja real e ensaiar restauração do Supabase de
  produção.
- **T-034**: NFC-e e Asaas reais (os stubs existem; falta homologação/integração).
- A suíte E2E completa ainda precisa de acompanhamento no CI para confirmar
  estabilidade sem retries.
