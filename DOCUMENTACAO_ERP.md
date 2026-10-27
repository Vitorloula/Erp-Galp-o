# Documentação do ERP Galpão

## 1. Status atual (27/10/2026)

- **Compilação:** `npm run lint` (`tsc -p . --noEmit`) → **0 erros**.
- **Testes de regras:** `npm test` → **117/117** em 12 arquivos.
- **Testes de banco/RLS:** `npm run test:sql` → **238/238**.
- **Build de produção:** `npm run build` → **OK**.
- **E2E direcionado:** importação, inventário por lote, LGPD e produtos passaram com
  `--workers=1`. O E2E completo roda no CI com retries; a suíte inteira ainda não foi
  declarada estável em workers padrão.
- **Backlog:** a fonte de verdade é `memoria/estado.json`. Estão abertos **T-028**
  (piloto em loja real + restauração de produção) e **T-034** (integrações reais de
  NFC-e e Asaas).

O escopo do piloto é **uma loja por empresa, PDV não fiscal, sem NFC-e/NF-e real e
sem cobrança automática**. O cupom sempre exibe **“DOCUMENTO SEM VALOR FISCAL”**.

## 2. Arquitetura

- **Frontend:** React + TypeScript + Vite, PWA instalável, Tailwind.
- **Nuvem:** Supabase (Postgres, Auth, RLS e RPCs). Regras críticas de estoque e
  permissões ficam no banco, não só na tela.
- **Servidor local de desenvolvimento/E2E:** PGlite em `servidor-local/`, com um
  ambiente que simula `auth.uid()`, roles e políticas.
- **Operação do suporte:** service role somente em scripts locais (`npm run piloto`,
  backup e consultas de erro), nunca no bundle do navegador.
- **Offline:** o PDV grava eventos no aparelho e sincroniza quando a conexão volta.

## 3. Funcionalidades prontas para o piloto

### Catálogo e importação

- Cadastro e edição de produtos com código interno automático, múltiplos códigos de
  barras, categoria, unidade, preço, fabricante e ponto de pedido.
- Importação de catálogo por **CSV** (`;`, `,` ou tab) ou **XLSX** na tela Produtos.
- Prévia antes de gravar, com validação de unidade, números brasileiros, data,
  duplicidade de código, lote/validade e quantidade.
- RPC `public.importar_catalogo` em subtransação por linha: uma linha inválida não
  derruba o arquivo. O resultado informa criados, saldos lançados e erros por linha.
- Categoria inexistente é criada; o ponto de pedido é gravado diretamente na coluna
  `produtos.estoque_minimo`.
- O saldo inicial entra como movimentação `ENTRADA` com documento
  “Saldo inicial importado”.

### Estoque por lote

- Saldo materializado por loja e lote; histórico imutável de movimentações.
- Entrada, saída, ajuste e correção sempre vinculados a um lote.
- Lotes com validade, alerta de vencimento e ordenação FEFO na venda.
- Bloqueio de saída acima do saldo, salvo eventos de PDV offline que já aconteceram
  (esses viram divergência para conferência).
- Produto sem lote cadastrado pode receber um lote durante o inventário.

### Inventário por lote

- Contagem **cega**: o saldo do sistema não aparece durante a digitação.
- Uma linha por lote; a diferença é ajustada no lote contado, nunca no “primeiro
  lote” do produto.
- Rascunho salvo no aparelho até finalizar; busca e paginação para catálogos grandes.
- Revisão mostra saldo, contagem e diferença antes de gerar os ajustes.
- Cada divergência gera um lançamento `AJUSTE` com motivo de inventário.

### PDV e caixa

- Abertura/fechamento de caixa, sangria, suprimento e fechamento às cegas.
- Venda com múltiplas formas de pagamento, troco, desconto e cancelamento com
  autorização.
- Operação offline com sincronização idempotente; conflito de evento vira
  divergência.
- Venda baixa estoque por lote (FEFO); “Diversos” pode não movimentar estoque.
- Limite de caixas conforme o plano; caixa aberto em outro aparelho é bloqueado.

### Relatórios, filtros e exportação

- Painel, estoque, histórico, relatórios e lista de compras.
- Filtros de estoque e relatório refletidos na URL, inclusive produto, categoria,
  busca e situação.
- Exportação Excel/PDF com helper único, mensagens padronizadas e aviso quando uma
  seção escolhida está vazia.
- Lista de compras com sugestão por embalagem; chip “Repor”, tabela e arquivo usam a
  mesma regra (`montarReposicao`).

### Equipe, permissões e assinatura

- Papéis `dono`, `gerente`, `caixa` e `estoquista`, com RLS por empresa e loja.
- Convites por link/e-mail, com expiração e uso único.
- Assinatura em trial, ativa, atrasada (aviso), somente leitura, suspensa e cortesia.
- Painel do dono para dados da empresa, lojas, caixas, equipe e assinatura.

### LGPD, privacidade e monitoramento

- Política de Privacidade em `/privacidade.html` e Termos de Uso em `/termos.html`,
  acessíveis antes do login.
- Dono exporta os dados da empresa em JSON (catálogo, estoque, movimentações, vendas,
  equipe e configurações), sem senhas e sem hash de convite.
- Tabela `public.erros_cliente` recebe falhas de JavaScript/React; leitura restrita a
  dono/gerente da própria empresa; suporte usa service role.
- Tela de erro amigável com recarregar e **Copiar diagnóstico**; últimas 20 falhas
  ficam no aparelho.

## 4. Regras importantes de estoque

- O saldo exibido por produto é a soma dos lotes com saldo; a situação consolidada é a
  pior situação entre os lotes.
- Produto abaixo do ponto de pedido entra em “Repor”. O cálculo usa o saldo
  consolidado, não a situação de um lote isolado.
- Ajustes e correções nunca alteram o histórico: criam um novo lançamento.
- O inventário é a forma recomendada de corrigir saldo físico; não edite tabelas
  diretamente.
- A venda offline pode deixar saldo negativo temporariamente; isso é registrado como
  divergência para conferência, não como falha silenciosa.

## 5. Importação: colunas aceitas

| Coluna | Obrigatória | Observação |
| --- | --- | --- |
| `nome` | sim | Nome do produto. |
| `codigo_interno` | não | Vazio ⇒ código automático. |
| `codigo_barras` | não | Vários separados por ponto e vírgula (no Excel, vírgula também). |
| `categoria` | não | Criada se não existir. |
| `unidade` | não | `un`, `kg`, `g`, `L`, `ml`, `m`, `cx`, etc. Padrão `un`. |
| `preco_venda` | não | `19,90` ou `19.90`. |
| `estoque_minimo` | não | Vazio/0 desliga o alerta. |
| `quantidade` | não | Saldo inicial; 0/vazio não cria lote. |
| `lote` | não | Preencha quando o produto controla lote e há saldo inicial. |
| `validade` | não | `31/12/2027`, `2027-12-31` ou data do Excel. |
| `controla_estoque` | não | `sim`/`não`; padrão `sim`. |
| `rastreio` | não | `lote` ou `nenhum`; padrão `nenhum`. |
| `fabricante`, `observacao` | não | Texto livre. |

O modelo para download está na própria tela de importação. Linhas com erro são
mostradas com o número da linha e podem ser corrigidas em um novo arquivo.

## 6. Operação e suporte

- Runbook completo: [`PILOTO.md`](PILOTO.md).
- Manual de testes: [`MANUAL_TESTE.md`](MANUAL_TESTE.md).
- Cortesia/trial:
  `npm run piloto -- cortesia <empresa_id>` ou
  `npm run piloto -- trial <empresa_id> 60`.
- Backup local: `npm run backup`; restauração:
  `node scripts/backup.mjs --restore <arquivo.tar>`.
- Erros do piloto:

```sql
select criado_em, empresa_id, loja_id, mensagem, url, stack
from public.erros_cliente
order by criado_em desc
limit 50;
```

**Pendência de produção:** o backup/restauração do Supabase em nuvem ainda não foi
ensaiado neste ambiente. Não prometa point-in-time recovery antes de validar com o
provedor.

## 7. Testes e CI

```powershell
npm run lint          # tipos do frontend
npm test              # Vitest
npm run test:sql      # migrations, RLS e regras no PGlite
npm run build         # produção
npm run test:e2e      # Playwright local
npm run test:e2e:ci   # Playwright com retries (CI)
```

O workflow `.github/workflows/testes.yml` separa:

- **qualidade** (Ubuntu): instala, build, Vitest e SQL;
- **e2e** (Windows + Edge): Playwright com retries e artefato do relatório em falha.

O `ia-diaria.yml` usa a branch `saas` e o mesmo caminho de E2E com retries.

## 8. Backlog atual

- **T-028** (prio 1, meta): piloto controlado em loja real, sem NFC-e/Asaas.
  Pré-requisitos técnicos concluídos; falta validar em loja e ensaiar restauração de
  produção.
- **T-034** (prio 2, integração): NFC-e e cobrança Asaas reais. Os scaffolds existem,
  mas continuam stubs; implementar só depois do piloto, com homologação fiscal e
  revisão contábil/jurídica.

Concluídos recentemente: T-016, T-017, T-019, T-021 (filtros/URL), T-023 (migration
de estoque mínimo), T-024 (inventário por lote), T-025 (backup local), T-026/T-027
(scaffolds), T-029 (importação), T-030 (operação do piloto), T-031 (LGPD), T-032
(paginação) e T-033 (qualidade/CI). O detalhe de cada item está em
`memoria/estado.json` e `memoria/historico.md`.

## 9. Limitações conhecidas

- Sem emissão fiscal real; o cupom é comprovante interno.
- Sem cobrança automática Asaas; assinatura é ajustada pelo suporte.
- Sem integração multi-loja/transferência completa no piloto.
- Backup em nuvem depende da configuração do Supabase e ainda não foi testado em
  restauração de produção.
- A suíte E2E completa ainda precisa de acompanhamento no CI para confirmar
  estabilidade sem retries.
- O factory de agentes de IA não é necessário para a operação do piloto e continua
  dependendo de Python/CrewAI e chave de LLM.
