# Backlog de features — evidências no código (2026-11-11)

Ordem: valor/custo estimado; os cinco primeiros de cada seção são prioritários.

## Features novas

1. **Ativar emissão real de NFC-e** — Evidência: `src/lib/nfce.ts:11,124` (“stub desligado”; integração não configurada); `memoria/historico.md` (T-034: integrações reais abertas). Impacto alto; esforço L.
2. **Ativar cobrança de assinatura (Asaas)** — Evidência: `src/lib/cobranca.ts:2,25` (integração e serviço stub desligado); `memoria/historico.md` (T-034 aberto). Impacto alto; esforço L.
3. **Piloto em loja real com restauração de produção** — Evidência: `memoria/historico.md` (T-028 permanece aberto; piloto e restauração ainda pendentes). Impacto alto; esforço L.
4. **Fila operacional para resolver vendas NFC-e pendentes/erro** — Evidência: `src/lib/dados/vendas.ts:166-184` lista pendentes; `src/lib/emissao.ts:44-50` emite fila ao reconectar; `src/pages/Vendas.tsx` sem fluxo identificado de gestão dessa fila. Impacto alto; esforço M.
5. **Reimpressão/consulta de NFC-e emitida** — Evidência: `src/lib/dados/vendas.ts:146-162` persiste chave/estado; `src/lib/nfce.ts` modela emissão, mas não foi localizado fluxo/tela de consulta ou impressão do documento fiscal. Impacto médio; esforço M.
6. **Custo no cadastro + faturamento bruto e lucro automáticos** — Pedido direto do usuário (T-036, prioridade 1 no estado.json). Evidência: `produtos.custo_ultimo` já existe e é gravado por `salvar_produto` e a cada entrada com custo (`supabase/migrations/20261010130000_cadastro_para_pdv.sql:16-37`; `20261106120000_transferencias_custo_entrada.sql:67-70`), mas `ProdutoDados`/`ProdutoForm.tsx` não expõem o campo e não há tela de faturamento/lucro. Impacto alto; esforço M.
7. **Ajuda/SAC com contato do suporte e FAQ "como resolver"** — Pedido direto do usuário (T-037). Evidência: `src/pages/Mais.tsx` sem entrada de Ajuda; `BoasVindas.tsx` sem link no primeiro acesso; padrão de páginas públicas em `public/privacidade.html`/`public/termos.html`; `DOCUMENTACAO_ERP.md:90-100`. Contato por WhatsApp + e-mail — dados reais pendentes do dono (placeholder marcado até lá). Impacto médio; esforço S/M.

Outras candidatas: painel de monitoramento de erros (há coleta, `src/lib/monitoramento.ts`, e tabela em migrations); exportação/relatórios de operação offline.

## Melhorias

1. **Cobertura E2E completa em CI do fluxo crítico** — Evidência: `memoria/historico.md` (T-033: suíte completa local ainda não declarada estável com workers padrão; CI executa E2E com retries). Impacto alto; esforço M.
2. **UX de reconciliação da fila de NFC-e** — Evidência: `src/lib/emissao.ts:34-50` mantém venda pendente sem emissor e percorre pendentes ao reconectar; `src/pages/Vendas.tsx` sem interface de acompanhamento confirmada. Impacto alto; esforço M.
3. **Teste de componente/acessibilidade para telas e formulários** — Evidência: `memoria/historico.md` (registros anteriores apontam ausência de testes de componente; T-033 acrescenta testes unitários/SQL/E2E, não registra camada de componente). Impacto médio; esforço M.
4. **Documentar operação de migrações entre instalações** — Evidência: `src/lib/dados/catalogo.ts:58` contém fallback para coluna de estoque mínimo ausente; migração correspondente existe em `supabase/migrations/20261021120000_estoque_minimo.sql`. Impacto médio; esforço S.
5. **Aprimorar diagnóstico de monitoramento** — Evidência: `memoria/historico.md` (T-030 implementa monitoramento silencioso e diagnóstico copiável); melhorar triagem/visibilidade operacional. Impacto médio; esforço M.

## Incompletos

1. **NFC-e real não homologada/configurada** — Evidência: `src/lib/nfce.ts:11,124,127` declara stub e retorna `nao_configurado`; `memoria/historico.md` T-034 aberta. Impacto alto; esforço L.
2. **Cobrança real não integrada** — Evidência: `src/lib/cobranca.ts:2,25` integração desligada/stub; T-034 em `memoria/historico.md`. Impacto alto; esforço L.
3. **Piloto/restore de produção não concluído** — Evidência: `memoria/historico.md` T-028 permanece aberto. Impacto alto; esforço L.
4. **PDV ainda imprime cupom não fiscal** — Evidência: `src/pages/pdv/Cupom.tsx:30` (“Não é documento fiscal: a NFC-e vem na fase fiscal”); dependente de integração real. Impacto alto; esforço L.
5. **Sem evidência de estabilidade da suíte E2E completa local** — Evidência: `memoria/historico.md` T-033 registra que execução completa local com workers padrão não foi declarada estável. Impacto médio; esforço M.

Outros incompletos verificados: não encontrei marcadores TODO/FIXME explícitos em `src/`. Migrações presentes em `supabase/migrations/` incluem base multiempresa, PDV, NFC-e, IBS/CBS, importação, monitoramento e transferências; sem evidência conclusiva de migração órfã, não classifiquei nenhuma como sem uso.
