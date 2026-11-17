# Decisão do dono — emissor de notas via NotaaS

Registro: 15/11/2026. Pedido do dono (verbatim): "Depois para emissão de notas de cada loja, pretendo usar o https://www.notaas.com.br/ tem um limite gratuito grande". Aplicável ao **T-034** (Integrações reais de NFC-e e cobrança Asaas) — implementação fica DEPOIS do T-038 (Módulo Serviços) e do piloto, como o T-034 já determina.

## Fatos verificados no site (15/11/2026 — não reinventar depois)

- **API REST JSON** (`platform.notaas.com.br`, header `x-api-key: ntaas_...`) emitindo **NFS-e** (Nacional SNNFSE + 26 engines municipais, 4.782 cidades, inclui CPF/CAEPF), **NF-e Mod 55**, **NFC-e Mod 65**, CT-e e MDF-e. Webhooks assinados HMAC-SHA256 (`X-Notaas-Signature`: `nfse.issued`, `nfe.issued`, `nfse.cancelled`). DANFSe/DANFE gerados localmente pela API.
- **Plano Free**: 20 notas/mês em **produção** (1 CNPJ) + **até 5 CNPJs grátis em HOMOLOGAÇÃO** via Org API; nota extra R$ 0,50. Dev R$ 99/mês: 500 notas, até 3 CNPJs em produção. SaaS Pro R$ 249/mês: 2.000 notas e CNPJs ilimitados. Sem prazo de validade, sem cartão.
- **Org API multi-CNPJ** (`ntaas_org_...`): cria projeto isolado **por CNPJ** (`POST /api/v1/org/projects`) com API key própria, sincroniza numeração/série do ERP legado, grava defaults de IBS/CBS por CNPJ (`defaultNbs`, `defaultCstIbscbs`, `defaultClassificacaoTributaria`), e promove homologação→produção com 1 PATCH (`{"ambiente": 1}`) sem trocar chaves nem código.
- **Certificado**: A1 (.pfx) por emissor, ou **Procuração Eletrônica RFB** (motor SNNFSE / cert We Digi) sem .pfx. Pronto para IBS/CBS (LC 214/2025) e CNPJ Alfanumérico 2026. Contingência SVC-AN/RS e emissão em lote (50 notas/chamada).

## Por que encaixa no ERP Galpão

- **Cada loja = 1 projeto Org API** (1 CNPJ → 1 API key própria) — bate com o modelo multi-loja do ERP (empresa → lojas). Chaves ficam **server-side** (Edge Function/Worker), nunca `VITE_*` (regra já no T-034).
- **Seams que já existem no código**: o stub `EmissorNFCe` do T-026 (`src/lib/nfce.ts` + toggle em EmpresaConfig) é o ponto de encaixe da NFC-e; a fila de NFC-e já existe (migration `20261111090000_nfce_fila_gestao`, tela de gestão). NFS-e **do Serviço (OS entregue)** seria nova interface análoga — a entrega da OS é o evento natural de emissão.
- **IBS/CBS**: o repo já tem migration `20261022010000_ibs_cbs.sql` — os defaults por CNPJ na Org API conversam com isso (revisar no momento da implementação).
- **Números/séries**: Org API aceita sincronizar numeração do ERP legado — a fila do ERP deve seguir mandando o número certo (padrão de idempotência do T-034).

## Pré-requisitos por loja (realidade fiscal, não depende do NotaaS)

- CNPJ ativo da loja + certificado A1 (.pfx) OU procuração RFB (SNNFSE); inscrição municipal da loja; conferir **cobertura da cidade** (o site lista 4.782 cidades ativas — validar a cidade de cada loja piloto antes de prometer emissão).
- Homologação grátis (5 CNPJs) serve para integrar sem custo antes do piloto real.

## Pontos em aberto (decidir na fase fiscal)

1. Limite do Free (20 notas/mês em produção) serve para piloto? Lojas reais provavelmente precisam do **Dev (R$ 99/mês, 500 notas, 3 CNPJs)** — expor o custo pro dono.
2. NFC-e offline no PDV: fila já é offline-first; NotaaS tem contingência SVC — mapear fluxo "nota sai quando a rede volta" contra a fila existente.
3. NFS-e da OS: criar ticket próprio quando o módulo Serviços estiver em produção (evento = entrega da OS; dados = itens de serviço/peças).
4. Asaas (cobrança da assinatura) continua fora do NotaaS — segue como está no T-034.

## Varredura de alternativas (15/11/2026) — NotaaS segue como escolha

Comparação com preços públicos oficiais (sites dos fornecedores), foco no que o ERP precisa: NFC-e (varejo) + NFS-e (OS) + multi-CNPJ por loja + custo.

| Fornecedor | Multi-CNPJ | NFC-e + NFS-e + NF-e | Preço base verificado | Veredicto |
|---|---|---|---|---|
| **NotaaS** | Org API self-service; ilimitado no SaaS Pro | ✓ (4.782+ cidades NFS-e; contingência SVC NFC-e) | Free R$ 0 (20 notas) · Dev R$ 99 · SaaS Pro R$ 249 | **Escolha mantida** |
| **Focus NFe** | Plano Start 3 CNPJs (+R$ 39,90/CNPJ); Growth R$ 572 ilimitado | ✓ (3.500 municípios; município novo = R$ 199) | Solo R$ 94,90 · Start R$ 119,90 · Retail NFC-e R$ 62,90 · Retail+ R$ 657,90 · Growth R$ 572 | Coerente e maduro, mas escala multi-loja mais cara; plano Retail é melhor que o Dev da NotaaS só para 1 loja de NFC-e em alto volume |
| **PlugNotas (TecnoSpeed)** | Licença por CNPJ ativo, comercial sob consulta | ✓ (NeverStop contingência offline; NFS-e 2.200 municípios; sandbox público) | Sob consulta (implantação assistida, possível fidelidade anual) | Tecnicamente forte (20 anos, 4.100 SHs); alternativa enterprise quando a operação for grande |
| **NFe.io** | Limitado por plano (2 CNPJs nos iniciais) | ✓ | Planos SEPARADOS por tipo: NF-e R$ 190 + NFS-e R$ 190 + NFC-e R$ 220/mês | Excluído — cobre o kit completo 3× |
| **eNotas** | 1 CNPJ por assinatura (FAQ oficial) | NFS-e/NF-e (site agora focado em Hotmart/produto digital) | Por CNPJ | Excluído — feito para infoproduto, não para multi-loja |
| **Nuvem Fiscal** | Sub-contas | ✓ (API moderna, OAuth2) | Site não abriu (3 tentativas) — preços não confirmados | Não avaliável hoje; revisar se NotaaS/Focus falharem |

Conclusão: caminho Free → Dev → SaaS Pro da NotaaS é o mais barato e o único 100% self-service para o modelo 1 loja = 1 CNPJ. Reavaliar Focus NFe Retail (R$ 62,90/500 NFC-e) só se UMA loja emitir volume muito alto; PlugNotas se precisar de suporte comercial/enterprise.
