# Spec do dono — Painel Super Admin (T-039)

Origem: texto enviado pelo dono em 15/11/2026 (verbatim, sem edição). É a fonte da verdade para o plano `memoria/plano-super-admin.md`. Exigência do dono: analisar toda a arquitetura atual ANTES de implementar, reusar o que existe e não criar nada isolado/duplicado.

---

Preciso implementar um painel Super Admin completo, com acesso administrativo global e visibilidade sobre toda a operação da plataforma e de cada loja cadastrada.

O objetivo é ter controle, monitoramento e capacidade de diagnosticar e resolver problemas de forma independente, sem precisar acessar diretamente o banco de dados ou depender constantemente de outros desenvolvedores.

## 1. Acesso Super Admin

Criar um perfil exclusivo de Super Admin, com permissões administrativas globais, permitindo:

- Visualizar todas as lojas cadastradas na plataforma.
- Acompanhar o status, funcionamento e atividade de cada loja.
- Consultar informações gerais de usuários, clientes, pedidos, produtos e operações.
- Identificar lojas com erros, falhas ou comportamentos incomuns.
- Consultar indicadores gerais de utilização, desempenho e saúde da aplicação.
- Acessar o ambiente administrativo de uma loja específica para investigar problemas.

## 2. Acesso ao ambiente de cada loja

Quero ter a possibilidade de entrar no contexto de qualquer loja, como se estivesse visualizando o painel daquela loja, para entender exatamente o que está acontecendo.

Por exemplo, quando um cliente ou lojista relatar algum problema, preciso conseguir:

- Selecionar a loja correspondente.
- Visualizar o painel e as funcionalidades disponíveis para aquela loja.
- Consultar os dados e registros relacionados ao problema.
- Identificar possíveis erros em operações, cadastros, pedidos, pagamentos e outras funcionalidades.
- Reproduzir o cenário do problema, quando possível.
- Realizar intervenções administrativas para solucionar problemas, respeitando as permissões e os mecanismos de segurança.

Esse acesso deve ser controlado e auditável, registrando quem acessou a loja, quando acessou, quais informações consultou e quais ações realizou. Sempre preservar o isolamento entre os dados dos diferentes lojistas.

## 3. Central de observabilidade e monitoramento

Desenvolver uma central de observabilidade que permita acompanhar a saúde de toda a aplicação em tempo real ou próximo disso.

Quero monitorar:

- Erros no frontend e backend.
- Falhas nas requisições e respostas da API.
- Erros de autenticação e autorização.
- Problemas de conexão com o banco de dados.
- Falhas em integrações e serviços externos.
- Lentidão e problemas de desempenho.
- Falhas em processos automatizados e tarefas em segundo plano.
- Operações que não foram concluídas corretamente.
- Indisponibilidade de funcionalidades ou serviços.

Os problemas devem ser apresentados de maneira visual, com filtros por loja, usuário, funcionalidade, tipo de erro, gravidade e período.

## 4. Sistema de logs organizado e descritivo

Essa é uma das partes mais importantes.

Preciso que os logs sejam extremamente organizados, claros e úteis para diagnóstico. Não quero registros genéricos como apenas "Erro ao processar solicitação".

Cada registro deve apresentar, sempre que possível:

- Data e horário exatos.
- Identificador único do erro.
- Loja relacionada (tenant).
- Usuário ou operação responsável.
- Módulo e funcionalidade envolvidos.
- Tipo e nível de gravidade do erro.
- Descrição detalhada do que aconteceu.
- Dados técnicos relevantes para investigação.
- Endpoint e método HTTP envolvidos, quando aplicável.
- Código de resposta.
- Stack trace completo nos ambientes apropriados.
- Identificador de rastreamento da requisição (request ID / correlation ID).
- Possível causa do problema.
- Sugestão de solução ou procedimento de correção.
- Status do problema: novo, em análise, resolvido ou recorrente.

Também preciso de mecanismos de agrupamento de erros semelhantes, filtros avançados e histórico de ocorrências para facilitar a identificação de problemas recorrentes.

Os logs devem ser estruturados e padronizados, preferencialmente em formato JSON, evitando informações sensíveis, senhas, tokens e dados pessoais desnecessários.

## 5. Agente de IA para diagnóstico e resolução de problemas

Quero implementar um agente de IA especializado em observabilidade e suporte técnico da plataforma.

Esse agente será responsável por analisar continuamente os logs, identificar comportamentos anormais, interpretar erros e auxiliar na resolução dos problemas.

Suas principais responsabilidades serão:

- Monitorar os registros e eventos da aplicação.
- Identificar erros e possíveis falhas antes mesmo de serem relatados pelos usuários.
- Analisar os logs e correlacionar ocorrências relacionadas.
- Investigar em qual loja, usuário, módulo ou funcionalidade o problema aconteceu.
- Identificar possíveis causas-raiz.
- Explicar o problema em linguagem clara, sem depender exclusivamente de termos técnicos.
- Apresentar sugestões de solução e procedimentos para correção.
- Identificar problemas recorrentes e alertar sobre possíveis falhas estruturais.
- Acompanhar os problemas até que sejam solucionados.
- Manter um histórico das análises, recomendações e intervenções realizadas.

### Autonomia do agente

Quero que o agente tenha capacidade de investigar os problemas de forma independente, utilizando as ferramentas e informações disponibilizadas pela plataforma.

Entretanto, suas permissões devem ser bem definidas:

- Leitura e diagnóstico: pode executar autonomamente.
- Consultas e testes seguros: pode executar dentro de um ambiente controlado.
- Correções de baixo risco: podem ser automatizadas somente quando houver regras explícitas, validações e possibilidade de reversão.
- Alterações em dados, configurações críticas ou operações financeiras: exigem minha aprovação.
- Alterações no código-fonte: o agente pode identificar o problema, propor a alteração, preparar uma solução e apresentar o resultado para revisão, mas não deve modificar a produção sem autorização.

Quero que o agente apresente uma explicação objetiva, por exemplo:

> "Foi identificado um erro na finalização de pedidos da Loja X. A falha está relacionada a uma resposta inválida da integração de pagamento. O problema ocorreu 12 vezes nas últimas duas horas. A possível causa foi identificada e existe uma correção recomendada."

## 6. Gestão de incidentes

Criar uma área específica para acompanhar os problemas encontrados pela observabilidade e pelo agente de IA.

Cada incidente deve possuir:

- Identificação e descrição.
- Loja afetada.
- Nível de prioridade.
- Quantidade de usuários impactados.
- Data da primeira e da última ocorrência.
- Diagnóstico da IA.
- Possíveis causas.
- Solução recomendada.
- Histórico de ações realizadas.
- Responsável pela resolução.
- Situação atual.

Também quero receber alertas sobre problemas críticos e ter uma visão dos incidentes que ainda precisam de atenção.

## 7. Segurança e auditoria

Todo o sistema precisa respeitar boas práticas de segurança:

- Separação rigorosa dos dados de cada loja.
- Controle de acesso baseado em permissões.
- Autenticação segura para o Super Admin.
- Registro de todos os acessos administrativos.
- Auditoria de alterações e intervenções.
- Proteção de informações sensíveis nos logs.
- Registro das ações executadas pelo agente de IA.
- Possibilidade de reverter intervenções quando tecnicamente viável.

## 8. Experiência e organização da interface

Quero uma interface administrativa moderna, profissional e intuitiva, que funcione como uma verdadeira central de controle da plataforma.

O painel deve ter uma visão geral com indicadores importantes, lojas com problemas, incidentes recentes, alertas críticos, desempenho dos serviços e atividade do agente de IA.

A navegação deve permitir sair da visão global e aprofundar a investigação até chegar a uma loja, usuário, operação ou erro específico.

## Resultado esperado

Quero ter uma verdadeira central de administração, observabilidade e suporte inteligente da plataforma.

Como Super Admin, preciso conseguir identificar um problema, localizar a loja afetada, acessar o contexto em que ele ocorreu, entender o que aconteceu por meio de logs detalhados e contar com um agente de IA que faça a investigação técnica e apresente soluções.

O sistema deve ser pensado para que eu consiga administrar e dar suporte a todas as lojas de maneira independente, mesmo sem precisar acessar diretamente o código ou o banco de dados para investigar cada ocorrência.

**Importante:** antes de implementar, analise toda a arquitetura atual do projeto, incluindo frontend, backend, banco de dados, autenticação, multi-tenancy, integrações e infraestrutura. Não crie funcionalidades isoladas ou duplicadas. Aproveite os recursos existentes, identifique o que precisa ser adaptado e desenvolva essa estrutura de forma integrada, escalável, segura e preparada para o crescimento da plataforma.

Não quero apenas uma tela visual de Super Admin. Quero uma estrutura funcional, com dados reais, monitoramento efetivo, logs úteis, rastreabilidade completa e um agente de IA que realmente consiga investigar e auxiliar na resolução dos problemas.
