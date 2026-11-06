# QA e melhorias — Ponto / ERP Galpão

> Este arquivo substitui um relatório legado que descrevia uma arquitetura Express/Sequelize inexistente neste repositório. A arquitetura real usa React/Vite, Supabase/Postgres/RLS e RPCs; as fontes de status e backlog são `DOCUMENTACAO_ERP.md` e `memoria/estado.json`.

## Verificações executadas nesta atualização

- `npm run lint` — TypeScript sem erros.
- `npm test` — 117 testes passando em 12 arquivos.
- `npm run test:sql` — 243 verificações de migrações, regras e isolamento passando.
- E2E direcionados — configurações da empresa, custo de entrada e transferência entre lojas passaram em desktop e celular.
- A suíte E2E smoke completa começou e os primeiros 30 cenários passaram, mas o comando excedeu o limite de execução do ambiente antes de terminar. A estabilidade completa ainda precisa ser confirmada no CI.

## Entregas implementadas

- Cadastro de empresa voltou a oferecer o segmento Galpão; a descrição de eletrônicos não promete mais rastreio por série/IMEI ainda não disponível.
- Empresa agora permite configurar a política de venda sem saldo, janela de alerta de vencimento e formato de etiqueta da balança. Dados de loja incluem CNPJ, IE, endereço e UF.
- O custo unitário opcional é salvo junto com a entrada; o histórico conserva o custo e `produtos.custo_ultimo` é atualizado na mesma transação.
- Transferência entre lojas via `public.transferir_estoque`: valida os dois acessos, bloqueia retirada acima do saldo, grava saída e entrada no mesmo lote atomicamente e é idempotente.
- Paginação na lista de estoque, histórico, vendas e abas de prévia dos relatórios; relatórios mostram contagem de linhas por seção e busca de produto limitada a correspondências relevantes.
- Melhorias na navegação, indicadores do painel, atalhos de caixa, seleção em tela e confirmação de exclusão de categoria.
- Modais comuns movem o foco ao abrir, mantêm navegação por teclado dentro do modal e devolvem foco ao controle de origem.
- Removida leitura de segredos fiscais/Asaas via `VITE_*`; as integrações ficam explicitamente desligadas até serem implementadas no servidor.

## Pendências externas / de produto

1. **T-028 — Piloto real:** validar operação em loja e ensaiar restauração de backup de produção em staging.
2. **T-034 — NFC-e e Asaas:** requer homologação fiscal/contábil/jurídica, credenciais server-side, webhook, idempotência e rollback. Não é seguro habilitar sem esses pré-requisitos.
3. **T-035 — Série/IMEI:** falta desenhar e implementar ciclo completo de recebimento, venda, devolução, cancelamento, inventário e trilha de auditoria.
4. Acompanhar a suíte E2E completa no CI; o smoke local expirou por tempo de execução.
