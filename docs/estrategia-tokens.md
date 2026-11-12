# Estratégia de economia de tokens — ERP Galpão

Objetivo: máxima qualidade de entrega com gasto mínimo. Cada regra abaixo custa pouco disciplina e economiza muito.

## 1. Roteamento de modelos (já aplicado)

| Agente | Modelo | Regra de uso |
|---|---|---|
| Arquiteto | GLM-5.3 (Go, high) | Só planejamento; nada de código ou revisão repetitiva |
| Designer | Nemotron 3.5 Super VL (Free) | Volume de UI sem custo |
| Programador | DeepSeek V4.1 Flash (Go, high) | Implementação; rodar off-peak quando possível |
| QA | MiniMax M3.1 Flash (Go, high) | Revisão e testes |
| PO | GPT-6 Luna (Go, low) | Backlog e docs |

- Se o custo apertar: Arquiteto → `opencode-go/glm-5.3-flash` e Programador/QA continuam (já são os mais baratos).
- Off-peak da DeepSeek: pico 01–04h e 06–10h UTC (seg–sex). Rodar à noite/fim de semana custa ~50% menos.

## 2. Esforço de raciocínio por fase (maior multiplicador de custo)

- Variantes de esforço custam exponencialmente mais tokens de raciocínio.
- Padrão: **low** para escrever código mecânico e docs; **high** só para planejamento e revisão final.
- Exceção consciente: Programador e QA em high — se o custo subir demais, baixar para medium nos tickets simples.

## 3. Contexto mínimo (a maior economia de todas)

Todo agente lê só o necessário:
- **Nunca ler o repositório inteiro.** Localizar com busca (nome de arquivo, componente, teste) e ler só o trecho.
- `memoria/estado.json` e `plano_atual` são os ponteiros oficiais — leia o plano, não o histórico da conversa.
- Resultados longos (planos, specs, relatórios) são **escritos em arquivo** e o handoff passa o caminho, não o conteúdo colado.
- Proibido colar arquivo de código em mensagem entre agentes: passar `path + linhas relevantes`.

## 4. Handoffs enxutos no ciclo de feature

Cada mensagem entre agentes contém no máximo:
1. Ticket/feature ID.
2. Caminho do plano ou spec (arquivo).
3. Critério de aceite em 1–2 frases.
4. Arquivos proibidos/alterados, se aplicável.

## 5. Gate mecânico antes de gastar tokens de agente

- Rodar `npm run lint` e `npm test` **localmente primeiro** (custa zero de LLM).
- Só acionar o Programador com o output do erro, nunca "tente e veja".
- QA recebe build verde: se lint/testes falharam, volta pro Programador com o log, sem QA inteiro rodar.

## 6. Limites de iteração (anti-loop)

- **Programador: até 5 ciclos de correção** por ticket (implementação tolera mais tentativas; cada ciclo precisa trazer mudança real de abordagem, não retry igual). Na 6ª falha: parar, escrever o diagnóstico em `memoria/historico.md` e escalar pra humano.
- Demais papéis (QA, Designer, etc.): máximo de **2 ciclos** por ticket; na 3ª falha, parar e escalar.
- Proibido reenviar a mesma tarefa sem mudança de contexto.
- Nenhum agente fica em polling/espera ativa; termina o turno e aguarda mensagem.

## 7. Agendamento e lotes

- Tarefas agrupadas no workflow "Ciclo de feature" — não acordar agente por micro-pergunta.
- Jobs pesados (sprints de implementação, e2e longos) via rotina noturna/fim de semana (off-peak).
- Perguntas de esclarecimento vão pro agente mais barato do papel (ou pro Teste, free) quando não precisam do especialista.

## 8. Medição

- Conferir semanalmente no console do OpenCode o gasto por modelo (Console → Usage).
- Se um modelo passar de ~40% do orçamento, reavaliar roteamento na tabela da seção 1.

## Checklist rápido antes de delegar

- [ ] A mensagem passou caminho de arquivo em vez de conteúdo?
- [ ] O esforço de raciocínio combina com a complexidade da tarefa?
- [ ] Lint/testes já rodaram localmente antes de chamar agente pago?
- [ ] É tarefa de volume que pode ir pra noite/fim de semana?
- [ ] É a 6ª tentativa do Programador (ou 3ª dos outros)? (então pare e escale)
