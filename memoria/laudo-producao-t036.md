# Laudo de teste autenticado em produção — T-036 (custo + resultado)

**Data:** 13/11/2026, 19:20–21:20 (horário de Brasília) · **Ambiente:** https://erp-galp-o.pages.dev (deploy `e17d8b9`) · **Supabase:** produção `erp_jd` (`vaihnxmwuouztvdojnyv`)
**Execução:** agente de coordenação (Teste), via navegador autenticado real. Conta criada a pedido do usuário ("cria uma conta teste e faça todos os testes por completo").

## Conta de teste
- **Usuário (dono):** `teste-qa@example.com` / senha definida pelo agente — id `3d8e5d4f-fcbf-423f-8f08-23555f0105c3`, perfil "Teste QA Agente".
- **Empresa:** "TESTE QA (conta de teste automatizado)", segmento Galpão/distribuidora, loja "Loja principal", Caixa 01, trial 14 dias (até 27/11/2026).
- **Criação:** SQL direto em `auth.users` + `auth.identities` (senha bcrypt, e-mail confirmado) porque o **cadastro pela UI recusa e-mails válidos** (ver achado A-1). Perfil criado pelo gatilho `ao_criar_usuario`. Login pela UI funcionou normalmente.
- **Outros perfis** (mesma senha): `teste-gerente@example.com` "Teste Gerente", `teste-estoquista@example.com` "Teste Estoquista", `teste-caixa@example.com` "Teste Caixa" — criados por SQL e **entraram via convite pela UI real** (link colado na BoasVindas → tela do convite → "Aceitar convite").

## Fluxo testado (dono)
| Passo | Resultado |
|---|---|
| Painel recém-criado | "Resultado de hoje" com Faturamento/Lucro R$ 0,00 e Margem 0% + "Sem vendas concluídas hoje" ✅ |
| Cadastro produto com custo | "Glifosato 480 SL" P0001, preço 20,00, **Custo 10,00** (campo novo com dica "Atualizado sozinho…"), mínimo 5 L ✅ |
| Detalhe do produto | "Último custo de entrada R$ 10,00" ✅ |
| Entrada 10 L custo 10,00 (NF 1001) | Saldo 10 L, "Em dia" ✅ |
| **Entrada 5 L custo 12,00** | Saldo 15 L; detalhe passou a mostrar **"Último custo de entrada R$ 12,00"** ✅ (atualização automática) |
| PDV (Caixa 01, troco 100,00) | Venda 01-000001: 2 L × 20,00 = R$ 40,00, Dinheiro, concluída ✅ |
| Painel após venda | Faturamento 40,00 / **CMV 24,00 / Lucro 16,00 / Margem 40%** ✅ (custo = snapshot do último custo; FEFO/CMV por lote fora do escopo da spec — comportamento correto) |
| Relatórios, aba Lucro | KPIs 40/24/16/40% + tabela por produto idêntica ✅ |
| Exportações Excel/PDF | Geração concluída sem erro, botões reabilitam; conteúdo já validado pelo QA ✅ |
| Fila NFC-e | "1 pendentes · 0 com erro" (emissor desligado) → "Marcar como resolvida" com **motivo obrigatório** → fila limpa "Todas as notas estão em dia" ✅ |
| Equipe (dono) | Texto dos 4 papéis idêntico à matriz do usuário; 3 convites criados (links 7 dias, uso único) ✅ |

## Matriz de perfis em produção (via convite real)
| Perfil | O que viu na interface |
|---|---|
| **Gerente** | Mesmo Painel (inclui Resultado). Empresa: **tudo somente leitura** ("Somente o dono altera os dados da empresa"). Equipe: **"Convidar pessoa" presente**, vê convites aguardando com Cancelar; **não altera papel de ninguém** (combos desabilitados) ✅ |
| **Estoquista** | Menu sem Equipe e sem Divergências ✅. **Cadastrou produto com sucesso** ("Adubo NPK 20-05-20" P0002, preço 35,00, custo 22,50) ✅. Movimentar com abas Entrada/Saída/Ajuste ✅. Painel inclui Resultado ⚠ (A-2) |
| **Caixa** | Menu sem Movimentar/Inventário/Divergências/Equipe ✅. Relatórios completos **com aba Lucro** (40/24/16/40%) ⚠ (A-2). **Vendeu de fato**: venda 01-000002, 1 L × 20,00 = R$ 20,00 concluída ✅ |
| Todos | Painel após a 2ª venda: Faturamento R$ 60,00 / Lucro R$ 24,00 / Margem 40% (aritmética exata: CMV 36 = 24+12) ✅ |

## Achados
- **A-1 (produto, a reportar ao usuário):** o cadastro pela UI (Supabase auth) recusa e-mails de formato válido — 400 "Email address is invalid" para `…@erp-ponto-teste.com` e `…@example.com`. Contorno: criação do usuário por SQL. Novo usuário real não consegue criar conta pela interface até a config de e-mail do projeto ser ajustada.
- **A-2 (decisão de produto, pendente do usuário):** o Painel "Resultado de hoje" (lucro/margem) fica visível para **gerente, estoquista e caixa** (a QA tinha apontado para o caixa; produção confirma nos três). Não é defeito da spec atual — é decisão: limitar por papel ou manter.
- Sem defeitos de funcionamento: nenhuma falha de fluxo, cálculo ou permissão nas telas testadas.

## Dados remanescentes em produção
Tenant de teste completo: 4 usuários de auth, empresa + loja + Caixa 01, 2 produtos (P0001 com saldo 13 L, P0002 zerado), 2 vendas (R$ 60,00 total), 3 movimentações, 3 convites consumidos, fila NFC-e resolvida. **Decisão de limpeza pendente do usuário:** manter (identificado como TESTE QA, trial até 27/11) ou apagar via SQL.
