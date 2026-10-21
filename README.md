# Controle de Estoque (PDV por assinatura — em desenvolvimento)

> **Branch `main` — fases 1 e 2 do plano: base multiempresa e caixa (PDV) que vende sem internet.**
> O sistema atende várias empresas, cada uma com suas lojas, equipe e assinatura, isoladas pelo próprio banco (RLS).
> A versão entregue ao cliente galpão fica no branch `galpao-1.x` (tags `v1.0.0-galpao`, `v1.0.1-galpao`).

Controle de estoque com lote e validade, **caixa (PDV) que vende sem internet**, leitura de código de barras pela câmera do celular, alertas de vencimento e relatórios em Excel/PDF. Funciona no computador e no celular, e pode ser instalado como aplicativo. Próximas fases: cobrança da assinatura pelo Asaas, série/IMEI para eletrônicos e NFC-e.

## O que o sistema faz

| Recurso | Onde está |
|---|---|
| Várias empresas por conta, várias lojas por empresa | Troca pelo nome da empresa (menu lateral ou barra do topo no celular). Cada loja tem o próprio estoque |
| Equipe com papéis: **dono, gerente, estoquista, caixa** | **Equipe → Convidar pessoa**: gera um link de uso único (WhatsApp ou e-mail) |
| Cadastro com escolha do segmento | Galpão/distribuidora, mercadinho, eletrônicos ou outro (já vêm as categorias certas). Dá para começar com uma **empresa de exemplo** |
| 🟥 Linha vermelha: estoque zerado ou validade vencida · 🟨 Amarela: vence em 30 dias | **Painel**, **Estoque**, **Produto** e relatórios Excel/PDF |
| Leitor de código de barras pela câmera | **Movimentar → Escanear** (EAN-13/8, UPC, Code 128/39, ITF, QR e DataMatrix). Lê o código GS1 e já preenche **lote e validade** |
| Vários códigos por produto | Unidade, caixa fechada (ex.: cada leitura = 12) e códigos de fornecedores diferentes |
| Preço de venda e categorias próprias | Cadastro do produto; categorias em **Produtos → Categorias** |
| Unidades técnicas (L, ml, kg, g, t, sc, gl, cx, un, pc, par, kit, m) | Lançamento na unidade ou **por embalagem** (ex.: 3 galões de 20 L = 60 L) |
| Validade em data real, exibida como `jun./26` | No Excel é uma data de verdade, filtrável |
| Estoque em tempo real | Todos os aparelhos se atualizam sozinhos (Supabase Realtime) |
| Relatórios por período em Excel e PDF | **Relatórios**: 7 dias, mês atual, mês anterior ou personalizado |
| Histórico imutável e correções auditáveis | Ninguém altera ou apaga movimentações. Erros são corrigidos com **Corrigir** (lançamento de correção vinculado) |
| Assinatura | Teste grátis de 14 dias. Em atraso: aviso por 7 dias, depois **somente consulta** (nada é apagado) |
| **Caixa (PDV)** | **Abrir o caixa**: tela cheia, leitor USB/Bluetooth, câmera, etiqueta de balança, desconto, várias formas de pagamento, troco e cupom 80 mm. Ver [Caixa (PDV)](#caixa-pdv) |
| Vendas e fechamentos | **Vendas**: total por forma de pagamento, detalhe e cancelamento (gerente/dono); aba **Caixas** com sobra/falta de cada fechamento |
| Divergências | O que os caixas registraram sem internet e não fechou (estoque negativo, número repetido, relógio errado), para conferir e resolver |

---

## Testar agora (servidor local, sem conta na nuvem)

Requer [Node.js](https://nodejs.org) 22.12 ou superior.

```bash
npm install
npm run dev
```

Sem `.env`, o `npm run dev` sobe junto um **"Supabase" local**: o banco PostgreSQL de verdade (PGlite) com as mesmas migrações da nuvem, login, API e tempo real. Abra http://localhost:5173, clique em **Criar conta** e escolha **Conhecer com dados de exemplo** (ou cadastre sua empresa).

- **No celular, no mesmo Wi-Fi:** abra o endereço `Network` mostrado no terminal (ex.: `http://192.168.0.110:5173`). Computador e celular veem os mesmos dados e se atualizam sozinhos.
- **Câmera no celular** (exige HTTPS): `npm run dev:celular` e acesse `https://<ip>:5173`, aceitando o aviso de certificado.
- **Convidar o celular para a equipe:** **Equipe → Convidar pessoa** e abra o link no celular.
- **E-mails** (confirmação, nova senha): o servidor local não envia; o link aparece no terminal.
- **Dados:** ficam em `servidor-local/banco/`. Para recomeçar do zero, pare o servidor e apague essa pasta.

> É só para testes: um único processo, sem backup. Com o `.env` do Supabase configurado, `npm run dev` usa a nuvem; para forçar o servidor local mesmo assim, use `npm run dev:servidor`.

---

## Caixa (PDV)

Em **Abrir o caixa (PDV)** (menu lateral ou **Mais** no celular):

1. Na primeira vez, escolha qual caixa é o aparelho (ex.: Caixa 01). Novos caixas: **Empresa → Caixas (PDV)**.
2. Informe o dinheiro de troco e **Abrir caixa**.
3. Venda passando o código no leitor (ou digitando e Enter). Atalhos:

| Tecla | Ação |
|---|---|
| `3*` antes do código | vende 3 unidades |
| F2 | buscar produto pelo nome |
| F3 | desconto na venda (em R$ ou %, rateado entre os itens) |
| F4 | pagar — depois F5 dinheiro, F6 Pix, F7 débito, F8 crédito, F9 outros; Enter sem valor = o que falta |
| F10 | menu: últimas vendas (reimprimir/cancelar), sangria, suprimento, sincronização e **fechar caixa** |
| F12 | imprimir o cupom da venda concluída |
| Esc | cancelar a venda em andamento |

- **Sem internet:** o caixa continua vendendo. As vendas ficam no aparelho e sobem sozinhas quando a conexão volta (indicador no topo: *Sincronizado*, *Offline · 3 pendentes*). Reenviar nunca duplica. Na primeira vez o aparelho precisa de internet para baixar os produtos; depois abre até sem conexão (instale como aplicativo: botão de instalar do navegador ou **Adicionar à tela inicial**).
- **Venda sem estoque**, número repetido ou relógio errado **não bloqueiam** a venda (ela já aconteceu): viram **Divergências** para o gerente conferir.
- **Fechamento às cegas:** o operador informa o que contou antes de ver o valor esperado; a diferença aparece no fechamento e em **Vendas → Caixas**.
- **Cancelar venda** concluída: só gerente ou dono (no caixa ou em **Vendas**); os itens voltam ao estoque e o cancelamento fica registrado com motivo e autor.
- **Balança:** marque o produto como *Vendido por peso* e informe o *Código na balança (PLU)*. O caixa lê a etiqueta (EAN-13 começando com 2) com o preço ou o peso. Itens sem cadastro: produto **Diversos** (mercadinho já vem com ele), com o preço digitado.
- **Cupom:** sai pela impressão do navegador, em 80 mm. Para imprimir direto, sem a janela de impressão, abra o Chrome/Edge do caixa com `--kiosk-printing` e deixe a térmica como impressora padrão. No Android, use um app de impressão como o RawBT. O cupom **não é documento fiscal** (a NFC-e vem na fase fiscal).
- **Não limpe os dados do navegador** do caixa com vendas pendentes; para trocar de aparelho, use **Sincronização → Exportar pendências** antes.

---

## Colocar no ar

### 1. Banco de dados — Supabase

1. Crie um projeto em [supabase.com](https://supabase.com). Região sugerida: **South America (São Paulo)**. Para clientes pagantes use o plano **Pro** (não pausa, tem backup).
2. Aplique as migrações de [`supabase/migrations/`](supabase/migrations), em ordem:
   - pelo [Supabase CLI](https://supabase.com/docs/guides/cli): `supabase link` e `supabase db push`; ou
   - no **SQL Editor**, colando e executando cada arquivo (do mais antigo para o mais novo).
3. Em **Authentication → URL Configuration**, preencha **Site URL** com o endereço do sistema (links de confirmação e de nova senha).
4. **E-mail próprio (SMTP):** o envio embutido do Supabase tem limite baixo de e-mails por hora. Em **Authentication → Emails → SMTP Settings**, configure um provedor (ex.: Amazon SES, Resend, Brevo) com o domínio da empresa.
5. Em **Project Settings → API**, copie a **Project URL** e a chave **anon/publishable**.

Não existe mais "primeiro usuário vira administrador": cada pessoa cria a conta e **cadastra a própria empresa** (vira dona) ou **entra por convite**.

### 2. Hospedagem do site

O site é estático (pasta `dist`). **Não use o plano gratuito da Vercel** (proíbe uso comercial).

**Cloudflare Pages (recomendado):**

1. Suba o projeto para um repositório no GitHub.
2. Em [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → Create → Pages → Connect to Git**.
3. Build command: `npm run build` · Build output directory: `dist`.
4. **Environment variables:** `VITE_SUPABASE_URL` (Project URL), `VITE_SUPABASE_ANON_KEY` (chave anon/publishable) e, opcional, `VITE_NOME_SISTEMA` (nome do sistema na tela de login).

**Netlify** também funciona: mesmo comando e pasta; o arquivo `public/_redirects` já está pronto.

> A chave anon pode ficar pública no site: quem protege os dados são as regras do banco (RLS), testadas em `npm run test:sql`.

### 3. Nos aparelhos

Abra o endereço no Chrome (Android) ou Safari (iPhone), entre uma vez e use **Adicionar à tela inicial**.

---

## Segurança (aplicada no próprio banco)

| Ação | Caixa | Estoquista | Gerente | Dono |
|---|:-:|:-:|:-:|:-:|
| Consultar estoque, histórico e relatórios | ✅ | ✅ | ✅ | ✅ |
| Lançar entrada, saída, ajuste e correção | — | ✅ | ✅ | ✅ |
| Cadastrar e editar produtos | — | ✅ | ✅ | ✅ |
| Corrigir número/validade de lote, gerenciar categorias | — | — | ✅ | ✅ |
| Convidar pessoas | — | — | ✅ (exceto gerentes) | ✅ |
| Alterar papéis, remover pessoas, lojas e dados da empresa | — | — | — | ✅ |
| Vender no caixa (PDV) | ✅ | — | ✅ | ✅ |
| Cancelar venda concluída, ver e resolver divergências, cadastrar caixas | — | — | ✅ | ✅ |
| **Alterar ou excluir movimentações** | ❌ | ❌ | ❌ | ❌ |

Além disso:
- uma empresa **nunca** lê nem altera dados de outra (testado tabela por tabela, inclusive tentando "apontar" registros para outra empresa);
- data/hora e usuário de cada lançamento são carimbados pelo servidor;
- o saldo nunca fica negativo, inclusive com dois aparelhos lançando ao mesmo tempo;
- reenviar um lançamento depois de uma falha de rede não duplica;
- assinatura vencida deixa tudo **somente para consulta**: nada é apagado e os relatórios continuam disponíveis.

---

## Desenvolvimento

```bash
npm run dev        # sistema + servidor local (sem .env) ou Supabase na nuvem (com .env)
npm test           # regras (alertas, validade, GS1, permissões, Excel/PDF) e servidor local (Auth, REST, tempo real)
npm run test:sql   # migrações num PostgreSQL embutido: isolamento entre empresas, papéis, convites, assinatura, imutabilidade
npm run test:e2e   # telas no navegador (Playwright + Microsoft Edge), contra o banco real
npm run test:tudo  # build + todos os testes acima
npm run build      # gera a pasta dist para publicação
```

### Testes de ponta a ponta (`e2e/`)

Rodam no build de produção, no Microsoft Edge já instalado no Windows (em outro sistema, instale com `npx playwright install msedge`). O app conversa com o mesmo "Supabase" local do servidor de desenvolvimento (banco real com as migrações); cada teste cria a própria empresa.

| Projeto | O que cobre |
|---|---|
| `app-computador` e `app-celular` | Todos os fluxos de tela em 1366 px e 390 px, numa empresa de exemplo nova: painel, estoque e alertas, entrada/saída/ajuste, leitor USB, códigos GS1, cadastro rápido, histórico e correções, produtos e lotes, relatórios (abre o Excel e o PDF baixados), equipe e convites, lojas com estoque separado, troca de empresa, tempo real entre abas, aviso sem internet, sem rolagem lateral e sem erros no console |
| `camera` e `camera-sem-codigo` | Leitura **real** pela câmera (vídeo com um EAN-13 gerado pelo teste) e câmera desligada ao fechar o leitor |
| `acesso` | Login, cadastro com confirmação de e-mail, primeira empresa, empresa de exemplo, esqueci a senha, convite aceito em outro aparelho, papéis (caixa, estoquista, gerente), isolamento entre empresas, assinatura vencida/em carência, abertura sem internet, reenvio sem duplicar, saldo concorrente e o que o app envia à API |
| `pdv` | Caixa vendendo sem internet e sincronizando sem duplicar, dois caixas offline vendendo a última unidade (estoque −1 e divergência), relógio do aparelho adiantado, etiqueta de balança, Diversos e operador sem permissão de cancelar |
| `pwa` | Aplicativo instalado: o caixa recarrega a página sem internet e continua vendendo |
| `servidor-local` | `npm run dev` de verdade: computador e celular no mesmo banco, convite e tempo real por WebSocket |

Depois de rodar, `npm run test:e2e:relatorio` abre o relatório com capturas de tela.

```
supabase/migrations/       banco: tabelas, regras, RLS, funções, tempo real
scripts/testar-sql.mjs     testes de segurança do banco
servidor-local/            Supabase local: banco real (PGlite) + Auth, REST (PostgREST) e Realtime simulados
src/lib/dados/             acesso a dados (sessão, empresas, catálogo, movimentos, tempo real)
src/lib/permissoes.ts      o que cada papel pode fazer na tela (espelho das regras do banco)
src/pdv/                   caixa: venda, balança, banco no aparelho (IndexedDB) e sincronizador
src/pages/pdv/             telas do caixa (venda, pagamento, cupom, menu, fechamento)
src/lib/estoque.ts         regras de alerta (vermelho/amarelo), FEFO e leitura de códigos
src/lib/gs1.ts             leitura de DataMatrix/GS1 (lote e validade)
src/lib/exportar/          geração de Excel e PDF
src/contexto/              sessão, empresa/loja ativa e dados em tempo real
src/pages/                 telas
src/components/            leitor de código, formulários, listas
```

Tecnologias: React 19, TypeScript, Vite, Tailwind CSS, Supabase (PostgreSQL + Auth + Realtime), PGlite, Dexie (IndexedDB), Workbox (aplicativo instalável), html5-qrcode, ExcelJS, jsPDF.
