# Revisão QA e PO — Zelou!

## Escopo e evidência

Revisão do código local de oportunidades, candidaturas, chat, contratos, medicamentos, verificação e testes. Não é uma homologação do site publicado nem uma auditoria completa de segurança.

Executado nesta revisão: `npm.cmd test` (13 aprovados; 3 de integração ignorados) e `npm.cmd run lint` (aprovado). Não foram executados testes de navegador ou chamadas ao banco real. As conclusões abaixo vêm da implementação; os riscos de concorrência precisam de reprodução controlada. O estado das migrations no Supabase publicado não foi verificado.

P1: corrigir antes de considerar o fluxo principal pronto. P2: próxima etapa de qualidade. Não foram alteradas regras de produto nesta revisão.

## Achados e backlog prioritário

### QA-01 — P1 — Status de cuidador pode ser definido na inserção direta

Evidência: `supabase/migrations/20260922_security_hardening.sql`, policy `caregivers manage own professional profile`, permite ALL sobre a própria linha. Em `20260922_product_persistence.sql`, o trigger `caregiver_managed_fields_protected` protege somente UPDATE.

Consequência: conforme essas migrations, um usuário autenticado pode inserir seu perfil profissional com `verification_status = approved` e campos administrados arbitrários; a policy também permite apagar a própria linha e recriá-la. O endpoint de upload não é a única entrada para o banco. Exploração não executada no ambiente publicado.

Correção: restringir INSERT/DELETE e campos administrados no banco; criar o perfil pelo servidor com valores controlados. Preservar a edição dos campos profissionais permitidos. Testar tanto REST direto quanto API do site.

Aceite: criar ou recriar o próprio perfil nunca permite autoaprovação; apenas o fluxo administrativo autorizado muda verificação, avaliação e contadores.

### QA-02 — P1 — Jornada não oferece criação de contrato

Evidência: existe POST em `src/app/api/contracts/route.ts`, mas as telas consultadas não o chamam. `ApplicationsViewReal` oferece Conversar; `ContractsView` lista contratos e permite assinar/cancelar os existentes.

Consequência: um usuário novo pode publicar, candidatar-se e conversar, mas não concluir a contratação pela interface.

História: como responsável, quero selecionar uma candidatura e enviar uma proposta vinculada à requisição, informando período, valor e condições.

Aceite: proposta aparece para as duas partes; o cuidador precisa ter candidatura naquela requisição; validações impedem valores/datas inválidos e contratos abertos duplicados; existe uma mensagem de confirmação e um próximo passo claro.

### QA-03 — P1 — Assinaturas simultâneas podem se sobrescrever

Evidência: `src/app/api/contracts/[contractId]/route.ts` lê ambas as assinaturas, calcula o estado em memória e grava ambas novamente, filtrando UPDATE somente pelo ID.

Cenário: as duas partes leem as assinaturas vazias; a segunda gravação pode apagar a assinatura da primeira. Uma assinatura em andamento também pode sobrescrever um cancelamento concorrente. Uma nova chamada sign sobre contrato ativo altera a data de assinatura.

Correção: executar a transição em operação transacional com bloqueio ou controle de versão, validar o estado no momento da escrita e tornar a assinatura repetida idempotente.

Aceite: duas assinaturas concorrentes produzem contrato ativo com ambas preservadas; contrato cancelado não é reativado por requisição antiga; repetição não muda a assinatura original.

### QA-04 — P1 — Contrato não preserva uma cópia do serviço acordado

Evidência: `src/app/api/contracts/route.ts` retorna descrição, horários e requisitos via relacionamento com a oportunidade atual. A criação guarda `terms`, mas não congela esses dados. A policy de oportunidades permite UPDATE pelo proprietário.

Consequência: alterações posteriores na oportunidade podem mudar o conteúdo mostrado no contrato já assinado.

Correção: gravar uma versão do serviço e das condições no momento da proposta; vincular as assinaturas à versão. Tratar alterações posteriores por uma nova versão aceita pelas partes.

Aceite: editar a oportunidade não altera o documento assinado. O contrato identifica sua versão e a requisição de origem.

### QA-05 — P1 — Verificação documental não é exigida nas APIs de contratação

Evidência: a tela inicial faz um bloqueio por `verificationStatus`, mas as rotas de candidatura/contrato verificam papel e relacionamento, sem exigir o status documental. A interface permite acesso a `under_review`.

Decisão de PO: definir quais ações são permitidas durante análise e após rejeição. Não presumir que envio de documento equivale a aprovação.

Aceite: regras escolhidas são iguais na interface, API e banco; chamada direta não contorna o bloqueio. Conta rejeitada não mantém privilégios apenas porque a tela estava aberta.

### QA-06 — P2 — Criação concorrente do chat pode duplicar conversas

Evidência: `src/app/api/conversations/route.ts` procura conversa e depois insere conversa e participantes em operações separadas; o schema não define unicidade por oportunidade e dupla de participantes.

Correção: criação transacional e chave única para a combinação, com retorno da conversa existente em tentativas repetidas. Tratar falha de associação sem deixar conversa órfã.

Aceite: cliente e cuidador abrindo simultaneamente obtêm o mesmo ID e o mesmo histórico.

### QA-07 — P2 — Ciclo de vida e notificações incompletos

Evidência: a rota de contrato aceita sign/cancel; não foi encontrado fluxo para concluir contrato ou atualizar automaticamente vaga/candidatura. Há leitura e marcação de notificações, mas não foi encontrado produtor desses avisos no código revisado.

Decisões: definir quando vaga fica preenchida, candidatura é aceita e contrato é concluído; quais eventos geram avisos e para quem. A API permite cancelar contrato ativo, enquanto a interface só oferece cancelamento antes da ativação.

Aceite: tabela de transições aprovada; API e UI consistentes; eventos geram um único aviso; erros não deixam vaga, candidatura e contrato em estados contraditórios.

### QA-08 — P2 — Tratamento de erros e carregamento pode ocultar a causa

Evidência: várias rotas chamam `request.json()` sem tratamento para JSON inválido; outras capturam qualquer falha como erro de requisição/configuração. Em `src/app/medications.tsx`, o refresh bem-sucedido não limpa um erro anterior de carregamento. Listagem de medicamentos e histórico falham juntas quando a segunda consulta falha.

Correção: separar erro de validação, sessão, permissão e indisponibilidade; registrar código técnico no servidor com identificador da requisição, sem conteúdo sensível. Separar estado de erro de leitura do erro de salvamento; permitir nova tentativa.

Aceite: queda temporária se recupera visualmente; payload inválido recebe resposta JSON de erro; falha do histórico não impede visualizar uma rotina já carregada.

## Matriz de testes a desenvolver

| ID | Prioridade | Nível | Cenário e resultado esperado |
|---|---|---|---|
| T01 | P1 | E2E | Responsável publica → cuidador se candidata → ambos conversam → responsável propõe → ambos assinam → contrato ativo. Duas sessões independentes. Hoje revela a lacuna QA-02. |
| T02 | P1 | Banco/RLS | Cliente A, cliente B, cuidador A e cuidador B: leitura e escrita cruzadas de contratos, chats, medicamentos e histórico são negadas. Usar dados existentes, não apenas UUID inexistente. |
| T03 | P1 | Banco/RLS | INSERT/DELETE/recriação de perfil profissional não permitem autoaprovação nem alteração de campos administrados. |
| T04 | P1 | Integração concorrente | Duas assinaturas simultâneas, assinatura repetida e cancelamento concorrente mantêm estados e datas corretos. |
| T05 | P1 | Integração | Modificar oportunidade depois da assinatura não muda conteúdo do contrato assinado. |
| T06 | P1 | E2E/API | Usuário sem documento, em análise, aprovado e rejeitado obedecem à matriz de permissões aprovada pelo PO. |
| T07 | P1 | Banco/RPC | Duas chamadas da mesma dose geram exatamente um registro; transação com falha não avança horário; cliente/terceiro não registra dose como cuidador. |
| T08 | P1 | Integração/E2E | Aplicar migrations em banco descartável; abrir chat e trocar mensagens nas duas direções; nenhuma recursão de RLS; terceiros não veem nomes/contatos. |
| T09 | P2 | Concorrência | Abrir chat simultaneamente, falhar após candidatura e tentar novamente: uma conversa, candidatura preservada e recuperação possível. |
| T10 | P2 | E2E | Modal: teclado, Tab, Shift+Tab, Escape, retorno do foco, rolagem, tela pequena e zoom; medicamentos não fazem consultas nas outras abas. |
| T11 | P2 | Integração | Horário futuro, dose atrasada, motivo obrigatório de não administração, término da rotina, contrato encerrado e fusos distintos. Definir antes a política de registro retroativo após encerramento. |
| T12 | P2 | E2E | Chat com rede lenta: mudar contato durante fetch/envio não mistura mensagens; sessão expirada e erro de envio preservam rascunho e oferecem recuperação. |
| T13 | P2 | API | JSON inválido, IDs inválidos, limites de texto, valores monetários decimais, ausência de sessão e origem inválida retornam status e mensagens coerentes. |
| T14 | P2 | Integração/E2E | Histórico com mais de 100 doses e chat extenso têm paginação; nenhum registro antigo fica definitivamente inacessível. |
| T15 | P2 | Integração | Cadastro interrompido e upload parcialmente concluído permitem recuperação sem duplicatas nem arquivos órfãos; testar falhas nas compensações. |
| T16 | P2 | Integração | Notificação nasce do evento, pertence ao destinatário, não duplica em repetição e pode ser marcada como lida somente por ele. |

Para medicamentos, testar apenas regras de registro e agenda definidas pelo produto; não inferir dose ou recomendação clínica em testes.

## Qualidade do código e operação

- Substituir testes que apenas procuram palavras em arquivos por testes de comportamento. Eles não provam que a autorização acontece antes de uma escrita.
- Os testes atuais que transpilem rotas com `new Function` e substituem o banco são úteis para respostas HTTP, mas não exercitam cookies, runtime do framework, SQL nem políticas reais. Complementar com integração e E2E, sem tratar mocks como homologação.
- Adicionar execução de integração obrigatória no ambiente de homologação. Um teste ignorado precisa ficar visível no resultado da entrega.
- Centralizar transições de contrato e verificações de papel/relacionamento para reduzir divergência entre API, UI e RLS.
- Gerar tipos a partir do schema e compartilhar schemas de entrada e contratos de resposta; evitar tipos manuais divergentes e JSON livre para condições que tenham estrutura definida.
- Separar JSX muito extenso em formulário, cartão e ações com responsabilidades claras; padronizar carregamento, erro e sucesso.
- Paginar mensagens e histórico; evitar buscar todo o chat a cada três segundos. Suspender polling em aba oculta e medir chamadas antes de trocar a estratégia de atualização.
- O rate limiter atual usa Map local e declara ser fallback. Não coordena instâncias; definir armazenamento compartilhado e política para operações sujeitas a abuso. Variáveis de ambiente, sozinhas, não implementam isso.
- Criar verificação de migrations no processo de entrega. A presença do SQL no repositório não comprova sua aplicação no banco.

## Proposta de sequência como PO

1. **Confiabilidade e acesso:** QA-01, QA-03, QA-05, RLS real e regressão do chat. Resultado: permissões coerentes e operações concorrentes seguras.
2. **Contratação completa:** QA-02 e QA-04; proposta, versão do documento, aceite das duas partes, cancelamento e conclusão definidos. Resultado: contratação feita inteiramente pela interface.
3. **Acompanhamento:** medicamentos com recuperação de erro e histórico navegável; notificações de eventos; status alinhados entre oportunidade, candidatura e contrato.
4. **Usabilidade e escala:** busca por requisição, botão copiar código, códigos públicos mais curtos com unicidade garantida, paginação, acessibilidade e redução de chamadas.

Métricas propostas, ainda não instrumentadas: proporção de interesses que geram conversa, falhas de envio, tempo até a primeira resposta, propostas que recebem ambas as assinaturas, registros de dose rejeitados por conflito e falhas de API por fluxo. Coletar eventos técnicos sem texto de mensagens ou nomes de medicamentos.

## Critério de pronto sugerido

Fluxo principal testado com duas contas, P1 resolvidos, isolamento validado no banco de homologação, migrations aplicadas e verificadas, UI navegável por teclado e celular, erros recuperáveis e evidência anexada à entrega. Build/lint e testes com mocks são necessários, mas não bastam para esse aceite.
