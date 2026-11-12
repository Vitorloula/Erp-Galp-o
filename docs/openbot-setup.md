# Setup do OpenBot para o ERP Galpão

Guia para organizar o projeto no OpenBot (workspace multi-agente). Complementa `README.md` e `memoria/estado.json`.

## 1. Pré-requisitos
- OpenBot instalado (desktop): https://openbot.run/pt/download
- Node.js 22.12+ e npm (já exigidos pelo projeto).
- Repositório clonado em `D:\ErpGalpao` (ou equivalente).
- Provedor de IA configurado no OpenBot (OpenCode/Codex/Claude Code/Gemini) com o plano que você já paga.

## 2. Workspace
1. Abra o OpenBot → **New workspace**.
2. Aponte o diretório para a raiz do repositório (`D:\ErpGalpao`).
3. Nome sugerido: `erp-galpao`.
4. Confirme que `agents/`, `memoria/`, `src/`, `e2e/` aparecem no painel de arquivos.

## 3. Agentes (crie um por papel)
Para cada agente, use o prompt correspondente em `agents/openbot/` como instruções iniciais:

| Agente | Prompt base | Workspace sugerido |
|---|---|---|
| Arquiteto | `agents/openbot/01-arquiteto.md` | raiz do repo (leitura) |
| Designer | `agents/openbot/02-designer.md` | `src/`, `e2e/` + Doop |
| Programador | `agents/openbot/03-programador.md` | raiz do repo (escrita) |
| QA | `agents/openbot/04-qa.md` | `memoria/`, `docs/` |
| Product Owner | `agents/openbot/05-product-owner.md` | raiz do repo (leitura) |

Dica: mantenha os prompts curtos e referencie arquivos (`agents/regras_projeto.md`) em vez de duplicar conteúdo.

## 4. Plugins a ativar
- **GitHub** (via OpenCode/provedor) — branches `ia-autonoma/*`, PRs, revisão de diff.
- **Linear** (opcional) — espelhar backlog em tickets.
- **Figma / Canva** — importar/exportar designs (CorteNexo).
- **Obsidian / Notion** (opcional) — documentação viva.
- **Doop** — design multiplayer (canvas `jJXGeQKjbJ`).

## 5. Canal de coordenação
1. Crie o canal `#erp-galpao`.
2. Adicione os 4–5 agentes.
3. Use handoff explícito: Arquiteto → Designer → Programador → QA.
4. Decisões importantes ficam no canal; não em DM.

## 6. Workflow recomendado ("Ciclo de feature")
1. Arquiteto lê `memoria/estado.json` e persiste `plano_atual`.
2. Designer lê plano e propõe UI/estados/a11y + `.spec.ts` afetados.
3. Programador implementa e roda `npm run lint`, `npm test`, `npm run test:e2e`.
4. QA atualiza `GUIA_DE_TESTES.md`/`DOCUMENTACAO_ERP.md` e registra o ciclo.
5. Gate mecânico (fora do agente) aprova/reprova.

Adicione etapas de aprovação humana entre Programador e QA se quiser revisar diffs.

## 7. Memória e fonte de verdade
- `memoria/estado.json` = backlog + `plano_atual` (leia antes, atualize ao final).
- `memoria/historico.md` = append-only (nunca apague).
- `memoria/metricas.jsonl` = métricas de ciclo.
- IDs de frame Doop (CorteNexo) podem ser guardados em `docs/doop.md`.

## 8. Segurança e ambiente
- Nunca commitar `.env` ou service role.
- Testes: use servidor local (`npm run dev` sem `.env`) — banco PGlite real.
- Rode `npm run test:sql` antes de qualquer migration nova.
- Migrations/deploys em produção exigem revisão humana.

## 9. Passos para o primeiro ciclo
1. Instale o OpenBot e crie o workspace (passo 2).
2. Crie os agentes (passo 3) e ative plugins (passo 4).
3. Crie o canal (passo 5).
4. Escolha um item pequeno do backlog em `memoria/estado.json`.
5. Rode o workflow (passo 6) e valide com `npm run test:tudo`.

## 10. Quando NÃO usar OpenBot
- Mudança trivial (1 arquivo/1 linha): faça direto.
- Produção: sem revisão humana para migrations/deploy.
- Se o gate reprovar por ambiente (npx/npm ausente), não é bug de código — reporte.
