# Piloto controlado — operação do ERP Galpão

Este roteiro é para acompanhar uma loja real durante o piloto. Ele não substitui o
manual do sistema nem o contrato com o cliente. O escopo do piloto é **uma loja por
empresa, PDV não fiscal, sem NFC-e/NF-e e sem cobrança automática (Asaas)**.

## 1. Antes de colocar o cliente no ar

- [ ] Criar o projeto no Supabase de produção (região próxima da loja).
- [ ] Aplicar todas as migrations de `supabase/migrations/` em ordem.
- [ ] Configurar as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no
      ambiente de hospedagem.
- [ ] Publicar a versão aprovada (`npm run build` sem erros).
- [ ] Criar a empresa pela tela de cadastro (o dono vira o primeiro usuário).
- [ ] Colocar a assinatura em **cortesia** durante o piloto:
      `npm run piloto -- cortesia <empresa_id>`.
- [ ] Conferir se a loja principal foi criada e se o caixa está disponível.
- [ ] Enviar o convite para o dono, gerente e operadores pelos papéis corretos.
- [ ] Fazer um treino de 20 minutos: abrir caixa, vender, fechar caixa, consultar
      estoque e fazer uma contagem de inventário.
- [ ] Combinar o canal de suporte e o horário de atendimento por escrito.
- [ ] Revisar com o jurídico/DPO o e-mail, o encarregado de dados e o canal de
      atendimento citados em `public/privacidade.html` e `public/termos.html`
      (o endereço atual é um exemplo e precisa ser confirmado).

O comando `piloto` usa a **service role** e ignora a RLS. Rode somente no computador
do suporte, nunca no navegador nem em build do frontend.

```powershell
$env:SUPABASE_URL="https://SEU-PROJETO.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."
npm run piloto -- listar
npm run piloto -- status <empresa_id>
npm run piloto -- cortesia <empresa_id>
npm run piloto -- trial <empresa_id> 60
```

## 2. Catálogo e saldo inicial

O onboarding pode ser feito por planilha. O modelo está na própria tela de produtos
(ícone **Importar → Baixar modelo**). São aceitos CSV (separado por `;`, `,` ou tab)
e XLSX.

Colunas reconhecidas (nomes alternativos também funcionam):

| Coluna | Obrigatória | Observação |
| --- | --- | --- |
| `nome` | sim | Nome do produto. |
| `codigo_interno` | não | Se vazio, o sistema gera um código. |
| `codigo_barras` | não | Pode haver mais de um; separe por ponto e vírgula (no Excel, vírgula também funciona). |
| `categoria` | não | Criada automaticamente se não existir. |
| `unidade` | não | `un`, `kg`, `g`, `L`, `ml`, `m`, `cx`, etc. Padrão `un`. |
| `preco_venda` | não | Aceita `19,90` ou `19.90`. |
| `estoque_minimo` | não | Ponto de pedido; vazio desliga o alerta. |
| `quantidade` | não | Saldo inicial. `0` ou vazio não cria lote. |
| `lote` | não | Preencha quando o produto controla lote e há saldo inicial. |
| `validade` | não | `31/12/2027`, `2027-12-31` ou data do Excel. |
| `controla_estoque` | não | `sim`/`não`; padrão `sim`. |
| `rastreio` | não | `lote` ou `nenhum`; padrão `nenhum`. |
| `fabricante`, `observacao` | não | Texto livre. |

Fluxo recomendado:

1. Exportar o catálogo atual do cliente (ou montar o modelo).
2. Importar primeiro 5–10 linhas de teste e conferir produtos, preços e saldos.
3. Importar o arquivo completo. O resultado mostra produtos criados, saldos
   lançados e erros por linha.
4. Corrigir as linhas com erro e importar somente essas linhas em um novo arquivo.
5. Conferir fisicamente alguns lotes e o ponto de pedido antes de liberar o PDV.

A importação roda cada linha em uma subtransação: uma linha inválida não impede as
demais. O saldo inicial entra como movimentação `ENTRADA` com documento
“Saldo inicial importado”, mantendo o histórico auditável.

## 3. Inventário por lote

O inventário é **cego e por lote**. Cada lote aparece em uma linha; a diferença é
lançada no lote contado, nunca no “primeiro lote” do produto.

- A contagem fica salva como rascunho no aparelho até finalizar.
- Produto sem lote pode receber um lote novo na própria contagem (quando o rastreio
  é por lote).
- O botão **Revisar** mostra o saldo do sistema e a diferença antes de lançar.
- **Gerar ajustes** grava um `AJUSTE` por lote divergente. Se a internet cair no
  meio, o que já foi gravado permanece e sai do rascunho; confira o resultado e
  repita somente o que faltou.

## 4. Rotina do piloto

### Diário (abertura)

- [ ] Conferir internet e carregar a tela inicial.
- [ ] Abrir o caixa com o valor inicial correto.
- [ ] Testar uma venda de R$ 1,00 e cancelar (se o fluxo permitir).
- [ ] Conferir se o painel mostra o caixa aberto.

### Diário (fechamento)

- [ ] Fechar o caixa e conferir a diferença de dinheiro.
- [ ] Conferir vendas pendentes de sincronização (ícone de nuvem).
- [ ] Conferir o painel de divergências.
- [ ] Exportar/guardar o fechamento do dia.
- [ ] Registrar no canal de suporte qualquer erro ou dúvida.

### Semanal

- [ ] Conferir produtos em “Repor” e estoque mínimo.
- [ ] Fazer uma contagem amostral de 5–10 lotes.
- [ ] Revisar erros do cliente (seção 6).
- [ ] Fazer backup do banco de produção pelo painel do Supabase.
- [ ] Revisar com o cliente o que funcionou e o que precisa de ajuste.

## 5. Offline e sincronização

O PDV foi desenhado para continuar vendendo sem internet: a venda fica no aparelho
e é sincronizada quando a conexão volta. Durante o piloto:

- Não limpe dados do navegador nem desinstale o PWA com vendas pendentes.
- Se o ícone de sincronização não sumir, não abra outro caixa no mesmo aparelho;
  envie o diagnóstico ao suporte.
- O cupom é um comprovante interno e sempre exibe
  **“DOCUMENTO SEM VALOR FISCAL”**.

## 6. Monitoramento de erros

O app grava falhas de JavaScript/React na tabela `public.erros_cliente` e guarda as
últimas 20 no aparelho. O suporte consulta com a service role:

```sql
select criado_em, empresa_id, loja_id, mensagem, url, stack
from public.erros_cliente
order by criado_em desc
limit 50;
```

Para limpar registros antigos (somente após analisar):

```sql
delete from public.erros_cliente where criado_em < now() - interval '90 days';
```

A tela de erro do app tem o botão **Copiar diagnóstico**, com URL, navegador, tela e
os últimos erros. Oriente o cliente a enviar esse texto pelo canal de suporte.

## 7. LGPD e dados do cliente

- O dono exporta os dados da empresa em **Empresa → Privacidade e seus dados →
  Baixar dados (JSON)**.
- A exportação inclui catálogo, estoque, movimentações, vendas, equipe e
  configurações, sem token de convite e sem senhas.
- Pedidos de correção ou exclusão devem ser tratados pelo suporte, com registro de
  data, solicitante e providência. Não apague histórico sem avaliar obrigação legal.
- A Política de Privacidade e os Termos de Uso ficam em `/privacidade.html` e
  `/termos.html`; revise-os com o jurídico do cliente antes de ampliar o piloto.

## 8. Backup e restauração

### Ambiente local de desenvolvimento

```powershell
npm run backup
# Restaurar (pare o servidor local antes):
node scripts/backup.mjs --restore servidor-local/backup/backup-AAAA-MM-DD....tar
```

### Produção (Supabase)

- Ativar o backup automático no plano contratado.
- Antes de uma migration arriscada, criar um backup manual pelo painel.
- Testar a restauração em um projeto de staging, nunca direto em produção.
- **Pendência conhecida:** a restauração do ambiente de produção ainda não foi
  ensaiada neste piloto. Não prometa recuperação point-in-time ao cliente antes de
  validar com o provedor.

## 9. Incidentes

| Situação | Ação imediata |
| --- | --- |
| Venda não sincroniza | Não limpar o navegador; copiar diagnóstico; verificar conexão; abrir chamado. |
| Saldo errado em um lote | Fazer contagem do lote e usar **Inventário**; não editar o banco direto. |
| Caixa travado | Fechar/reabrir o app; se persistir, coletar diagnóstico e verificar sessão no painel. |
| Erro em tela | Recarregar; se voltar, copiar diagnóstico e consultar `erros_cliente`. |
| Acesso indevido | Remover o membro, trocar a senha do dono e revisar convites. |
| Suspeita de perda de dados | Suspender vendas, exportar JSON, acionar backup do Supabase. |

## 10. Rollback e saída do piloto

1. Avisar o cliente e suspender novas vendas.
2. Exportar os dados em JSON e guardar os fechamentos.
3. Corrigir ou reverter a versão publicada.
4. Se o problema for no banco, restaurar o backup validado.
5. Registrar o ocorrido, o horário e o que foi aprendido.

Ao encerrar o piloto, combine por escrito o prazo de exportação e exclusão dos dados,
respeitando obrigações legais de retenção.

## 11. Critérios de go/no-go para ampliar

- [ ] Uma semana de operação sem perda de venda.
- [ ] Importação de catálogo e contagem de inventário validadas com o cliente.
- [ ] Nenhum erro crítico em `erros_cliente` sem explicação.
- [ ] Backup de produção testado em staging.
- [ ] Política de Privacidade e Termos revisados pelo jurídico.
- [ ] Escopo fiscal e de cobrança comunicado por escrito (ainda não integrados).
