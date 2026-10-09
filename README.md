# Sistema Web de Controle de Estoque e Fluxo de Galpão

Controle de entradas, saídas e baixas de **defensivos agrícolas e fertilizantes**, com leitura de código de barras pela câmera do celular, alertas de validade e relatórios em Excel/PDF. Funciona no computador e no celular, 100% online, com custo mensal zero (Supabase + hospedagem estática gratuita).

## O que o sistema faz

| Proposta | Onde está |
|---|---|
| Interface responsiva (PC, tablet, Android, iOS) | Menu lateral no computador, barra inferior no celular; pode ser "instalado" na tela inicial |
| 🟥 Linha vermelha: estoque zerado ou validade vencida | Telas **Painel**, **Estoque**, **Produto** e relatórios Excel/PDF |
| 🟨 Linha amarela: vence nos próximos 30 dias | Idem |
| Leitor de código de barras pela câmera | **Movimentar → Escanear** (EAN-13/8, UPC, Code 128/39, ITF, QR e DataMatrix). Lê também o código GS1 das embalagens e já preenche **lote e validade** |
| Busca e baixa manual (sem código de barras) | Busca por nome, código interno ou código de barras. Leitor USB/Bluetooth também funciona (digita + Enter) |
| Unidades técnicas (L, ml, kg, g, t, sc, gl, cx, un) | Cadastro do produto; lançamento na unidade ou **por embalagem** (ex.: 3 galões de 20 L = 60 L) |
| Validade em data real, exibida como `jun./26` | Banco guarda `date`; tela e relatórios mostram `jun./26` (no Excel é uma data de verdade, filtrável) |
| Estoque recalculado em tempo real | Saldo = soma das movimentações; todos os aparelhos se atualizam sozinhos (Supabase Realtime) |
| Relatórios semanais/mensais em Excel e PDF | **Relatórios**: últimos 7 dias, mês atual, mês anterior ou período personalizado |
| Histórico imutável (RLS) e correções auditáveis | Ninguém altera ou apaga movimentações — nem o administrador. Erros são corrigidos com **Corrigir** (gera um lançamento de correção vinculado) |

Extras: saída sugere sempre o lote que vence primeiro (FEFO), bloqueio de saída maior que o saldo, ajuste de inventário (contagem física), tela de usuários para liberar a equipe, aviso de "sem internet".

---

## Testar agora (modo demonstração)

Requer [Node.js](https://nodejs.org) 22.12 ou superior.

```bash
npm install
npm run dev
```

Abra http://localhost:5173. Sem configurar o Supabase, o sistema abre em **modo demonstração** com produtos de exemplo (vencidos, vencendo e zerados), e os dados ficam só no navegador.

Para testar a câmera no celular pela rede local (o navegador exige HTTPS):

```bash
npm run dev:celular
```

Acesse pelo celular o endereço `https://<ip-do-computador>:5173` mostrado no terminal e aceite o aviso de certificado.

### Servidor local de teste (celular + computador com os mesmos dados)

Para testar com vários aparelhos antes de criar o Supabase na nuvem:

```bash
npm run dev:servidor
```

O computador vira o "servidor": abra o endereço `Network` mostrado no terminal (ex.: `http://192.168.0.110:5173`) no celular, no mesmo Wi-Fi. Os dados ficam em `servidor-local/dados.json` (com os produtos de exemplo) e as telas se atualizam sozinhas entre os aparelhos. A primeira conta criada em **Solicitar acesso** vira administradora; as demais são liberadas na tela **Usuários**. Para usar a câmera no celular, rode `npm run dev:servidor:celular` e acesse pelo endereço `https://`.

> É só para testes: só funciona com o PC ligado e não tem a segurança do banco real. Para recomeçar do zero, pare o servidor e apague `servidor-local/dados.json`.

---

## Colocar no ar (custo zero)

### 1. Banco de dados — Supabase

1. Crie uma conta em [supabase.com](https://supabase.com) e um projeto novo (plano **Free**). Região sugerida: **South America (São Paulo)**.
2. No projeto, abra **SQL Editor → New query**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
3. Em **Authentication → URL Configuration**, preencha **Site URL** com o endereço final do sistema (passo 3), para os links de confirmação de e-mail funcionarem.
4. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public** (ou "publishable").

### 2. Primeiro acesso (administrador)

**O primeiro usuário criado vira administrador automaticamente.** Crie o seu logo depois de rodar o script:

- pela tela do sistema, em **Solicitar acesso**; ou
- no Supabase, em **Authentication → Users → Add user → Create new user** (marque *Auto Confirm User*).

Os demais usuários entram como **"Sem acesso"** e o administrador libera cada um em **Usuários** (menu lateral, ou **Mais → Usuários** no celular). Assim, mesmo com o cadastro aberto, ninguém de fora consegue ver ou lançar nada.

> Se preferir que ninguém se cadastre sozinho, desligue **Authentication → Sign In / Providers → Allow new users to sign up** e crie as contas pelo painel do Supabase.

### 3. Hospedagem do site

O site é estático (pasta `dist`), então qualquer hospedagem estática serve. **Não use o plano gratuito da Vercel**: ele é só para uso pessoal, não comercial.

**Cloudflare Pages (recomendado, gratuito, uso comercial liberado):**

1. Suba este projeto para um repositório no GitHub.
2. Em [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → Create → Pages → Connect to Git**.
3. Build command: `npm run build` · Build output directory: `dist`.
4. Em **Environment variables**, adicione:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = chave anon/publishable
   - `VITE_NOME_EMPRESA` = nome que aparece no sistema e nos relatórios
5. Deploy. O endereço `https://<projeto>.pages.dev` já vem com HTTPS (necessário para a câmera).

**Netlify** também funciona: mesmo comando e pasta; o arquivo `public/_redirects` já está pronto.

> A chave anon pode ficar pública no site: quem protege os dados são as regras de segurança do banco (RLS), testadas em `npm run test:sql`.

### 4. Nos celulares do galpão

Abra o endereço no Chrome (Android) ou Safari (iPhone), entre uma vez e use **Adicionar à tela inicial**. O login fica salvo no aparelho, sem pedir senha a cada uso.

---

## Segurança (aplicada no próprio banco)

| Ação | Sem acesso | Operador | Administrador |
|---|:-:|:-:|:-:|
| Consultar estoque, histórico e relatórios | — | ✅ | ✅ |
| Lançar entrada, saída, ajuste e correção | — | ✅ | ✅ |
| Cadastrar produto | — | ✅ | ✅ |
| Editar produto / corrigir número ou validade de lote | — | — | ✅ |
| Liberar usuários e definir administradores | — | — | ✅ (exceto o próprio acesso) |
| **Alterar ou excluir movimentações** | — | ❌ | ❌ |

Além disso:
- data/hora e usuário de cada lançamento são carimbados pelo servidor (não dá para "voltar no tempo" nem lançar em nome de outro);
- o saldo nunca fica negativo, inclusive com dois celulares lançando ao mesmo tempo;
- correções exigem motivo e ficam ligadas ao lançamento original (`corrige #34`).

## Limites do plano gratuito (importante)

- **Supabase Free:** 500 MB de banco, o que comporta centenas de milhares de movimentações. O projeto é **pausado após 7 dias seguidos sem nenhum acesso** (ex.: férias coletivas). Os dados não se perdem; basta clicar em **Restore project** no painel do Supabase.
- O plano gratuito não tem backup automático para download. Recomendação: baixar o relatório mensal em Excel (ele traz movimentações e posição de estoque), que serve como cópia de segurança.
- Confira os limites atuais em [supabase.com/pricing](https://supabase.com/pricing).

---

## Desenvolvimento

```bash
npm run dev        # servidor local (modo demonstração se não houver .env)
npm test           # testes das regras (alertas, validade, GS1, demonstração, Excel/PDF)
npm run test:sql   # testa supabase/schema.sql num PostgreSQL embutido (RLS, imutabilidade, saldo)
npm run test:e2e   # testes de ponta a ponta das telas no navegador (Playwright + Microsoft Edge)
npm run test:tudo  # build + todos os testes acima
npm run build      # gera a pasta dist para publicação
```

### Testes de ponta a ponta (`e2e/`)

Rodam no build de produção, no Microsoft Edge já instalado no Windows (em outro sistema, instale com `npx playwright install msedge`). São 4 cenários:

| Projeto | O que cobre |
|---|---|
| `demo-computador` e `demo-celular` | Todos os fluxos de tela em 1366 px e 390 px: painel, estoque e alertas, entrada/saída/ajuste, leitor USB, códigos GS1, cadastro rápido, histórico e correções, produtos e lotes, relatórios (abre e confere o Excel e o PDF baixados), usuários, sincronização entre abas, aviso sem internet, sem rolagem lateral e sem erros no console |
| `camera` e `camera-sem-codigo` | Leitura **real** pela câmera: o navegador recebe um vídeo com um EAN-13 gerado pelo teste; também verifica que a câmera desliga ao fechar o leitor |
| `supabase` | Modo produção contra um Supabase simulado (`e2e/supabase/falso.ts`): login, cadastro, conta pendente, permissões do operador, parâmetros enviados à API, recusa de saldo pelo servidor, tempo real via WebSocket e abertura sem internet |

Depois de rodar, `npm run test:e2e:relatorio` abre o relatório com capturas de tela.

Para apontar o ambiente local para o Supabase, copie `.env.example` para `.env` e preencha.

```
supabase/schema.sql        banco: tabelas, regras, RLS, tempo real
scripts/testar-sql.mjs     testes de segurança do banco
src/lib/dados/             acesso a dados (Supabase e demonstração)
src/lib/estoque.ts         regras de alerta (vermelho/amarelo) e FEFO
src/lib/gs1.ts             leitura de DataMatrix/GS1 (lote e validade)
src/lib/exportar/          geração de Excel e PDF
src/pages/                 telas
src/components/            leitor de código, formulários, listas
```

Tecnologias: React 19, TypeScript, Vite, Tailwind CSS, Supabase (PostgreSQL + Auth + Realtime), html5-qrcode, ExcelJS, jsPDF.
