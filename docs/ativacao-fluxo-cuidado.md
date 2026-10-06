# Ativação do fluxo de cuidado

As alterações estão no código e foram exercitadas em PostgreSQL local de testes (PGlite). Esses testes não aplicam migrações nem alteram dados no projeto Supabase publicado.

## Migrações

Com o schema e as migrações anteriores até `20260926_chat_transactions.sql` já aplicados, execute as novas migrações nesta ordem, antes de publicar o novo frontend:

1. `supabase/migrations/20260930100000_care_workflow.sql`
2. `supabase/migrations/20260930101000_contract_execution.sql`
3. `supabase/migrations/20260930102000_private_files.sql`
4. `supabase/migrations/20260930103000_routines_chat.sql`
5. `supabase/migrations/20260930104000_substitutions.sql`
6. `supabase/migrations/20260930105000_web_push.sql`

Cada arquivo tem sua própria transação. Não reaplique arquivos já executados. O histórico antigo do repositório contém arquivos com o mesmo prefixo de data; em projetos mantidos pelo SQL Editor, siga a ordem explicitamente, sem presumir que o histórico da CLI esteja sincronizado.

**Efeito sobre dados antigos:** vagas publicadas sem região validada serão pausadas. A família deverá editar a localização e a escala e depois republicar. Contratos e históricos existentes não são excluídos. Propostas antigas precisam de uma escala estruturada antes de assinar; uma contraproposta permite definir essa escala. Contratos ativos antigos não recebem plantões retroativos: podem receber compromissos manuais ou uma nova escala por alteração aceita pelas partes.

Os novos fluxos dependem das migrações. Se o banco não for atualizado, as rotas mostrarão erro; não há fallback para publicar regiões livres ou ignorar conflitos.

## Localização e vagas

- Município e UF vêm da [API de localidades do IBGE](https://servicodados.ibge.gov.br/api/docs/localidades). A consulta opcional de [CEP](https://viacep.com.br/) preenche o bairro e confirma o município pelo código IBGE.
- Sem bairro retornado, a vaga exibe apenas município/UF. Não existe entrada livre de bairro; “banana” não é aceito como região.
- `verified_regions` armazena identificador municipal e rótulo aproximado, sem CEP, rua ou coordenada residencial. Apenas o servidor pode inserir nessa tabela. Publicação e edição usam uma função transacional que consulta esse cadastro.
- Se a consulta externa falhar, o formulário preserva os demais dados e permite tentar novamente; uma região não validada não é aceita.
- A localização é uma seleção geográfica válida; não é comprovação de residência. Não há estimativa de distância sem coordenadas verificadas.
- A escala define frequência, datas, dias, horários e fuso brasileiro. Plantões noturnos terminam no dia seguinte. O período máximo é de 366 dias, incluindo a primeira e a última data.
- A estimativa da vaga cobre os turnos do período inteiro. O valor final pode ser negociado na proposta.
- Vagas podem ser editadas, pausadas e encerradas enquanto não houver contrato aberto. Candidaturas podem ser retiradas ou recusadas antes do contrato.

## Contratos, agenda e substituição

- As duas assinaturas ativam o contrato e geram os plantões na mesma transação. Conflitos de agenda impedem a ativação; não são gravados plantões parciais.
- Propostas usam o período da escala, sem valor total associado a prazo indefinido. Tarefas/requisitos, condições, valor e localização acompanham o documento.
- Contrapropostas pendentes preservam a versão anterior. A outra parte aceita ou recusa; o proponente pode retirar. Em contrato ativo, o aceite cria nova versão, arquiva a anterior e substitui os plantões futuros. O valor informado é o **total revisado do contrato**, incluindo atendimentos anteriores, não um acréscimo automático.
- Encerramento antecipado exige motivo, cancela compromissos/tarefas pendentes e notifica a outra parte. Plantões com entrada registrada precisam de saída antes do encerramento.
- A agenda permite compromissos extras, reagendamento, cancelamento, faltas, entrada e saída. A validação no banco impede sobreposição para o mesmo cuidador e horários fora do contrato. A entrada abre 30 minutos antes do início; falta só pode ser registrada após o término previsto.
- O cuidador solicita substituição; a família publica uma vaga pontual a partir do plantão. O plantão original permanece agendado até o novo cuidador e a família assinarem o contrato substituto. Só então ele é cancelado e a cobertura passa ao novo contrato. A substituição exige plantão futuro com menos de 24 horas e região validada. Os valores do contrato original não são abatidos automaticamente: eventual acerto deve ser formalizado em alteração contratual.
- O download do contrato é um arquivo TXT com texto e registro completo; versões anteriores permanecem acessíveis às partes. Não foi integrado um serviço externo de assinatura ou geração de PDF.

## Rotina, arquivos e conversa

- Tarefas de alimentação, hidratação, higiene, mobilidade e outras atividades têm responsável, horário, resultado e justificativa. A criação pode repetir a tarefa diariamente por até 90 dias, dentro do contrato. A lista permite filtrar pendências e paginar o histórico.
- O diário identifica o contrato de cada anotação e permite filtrar por atendimento.
- Endereço, orientações e contato de emergência ficam em área privada. O responsável mantém acesso; o cuidador só tem acesso enquanto o contrato estiver ativo.
- Arquivos PDF/JPEG/PNG de até 5 MB ficam no bucket privado `care-files`. O servidor verifica tipo e assinatura inicial do arquivo, e o download usa URL assinada por 60 segundos. Arquivos ficam na área privada do contrato, não em anexos públicos do chat.
- O chat usa páginas de 50 mensagens, mostra última mensagem, contagem de não lidas e leitura até a mensagem efetivamente carregada. Propostas, aceites e alterações deixam eventos do sistema na conversa. Há acesso à vaga e ao contrato correspondente.
- Bloquear impede novas mensagens de texto de ambas as partes. Eventos de contrato continuam registrados. Denúncias aparecem na administração, com consulta de contexto auditada. O chat continua atualizando por polling de 3/5 segundos; não depende de Supabase Realtime.
- Perfil profissional inclui apresentação, experiência, especialidades, disponibilidade declarada e valor/hora. A família vê os dados profissionais dos candidatos às próprias vagas; não recebe acesso geral a perfis privados.
- Cada parte pode avaliar uma vez após a conclusão. A média do cuidador é calculada a partir das avaliações reais, não de um campo editável pelo usuário.

## Notificações externas

As notificações internas são gravadas no banco. Para avisos com a página fechada, a aplicação inclui Web Push, service worker, inscrições por dispositivo, fila com tentativas e uma rota protegida para processamento.

Configure **no servidor**:

```dotenv
VAPID_PUBLIC_KEY=<chave pública>
VAPID_PRIVATE_KEY=<chave privada>
VAPID_SUBJECT=mailto:contato@seu-dominio.example
CRON_SECRET=<segredo aleatório longo>
```

Gere as chaves uma única vez com `npx web-push generate-vapid-keys --json` e guarde a chave privada no gerenciador de segredos da hospedagem. O servidor disponibiliza apenas a chave pública ao navegador. A biblioteca utilizada documenta o protocolo e as opções em [web-push](https://github.com/web-push-libs/web-push).

Configure o agendador da hospedagem para chamar, a cada minuto:

```text
GET https://SEU-DOMINIO/api/cron/reminders
Authorization: Bearer <CRON_SECRET>
```

Sem VAPID, essa rota ainda gera lembretes internos, mas não envia push. O usuário ativa o dispositivo na tela Notificações e concede a permissão do navegador. São aceitos endpoints dos serviços de push Google, Mozilla, Apple e Windows. HTTPS e suporte do navegador/sistema são necessários. O payload da notificação é genérico e não contém endereço nem dados de saúde.

A fila processa até 40 entregas por execução, com lease de 5 minutos e até 5 tentativas. Inscrições expiradas são removidas. O mesmo horário não gera lembretes duplicados; um reagendamento gera uma nova chave. Se o volume aumentar, ajuste o lote e a frequência do agendador. A entrega depende do navegador e do serviço de push e não substitui o acompanhamento humano da rotina.

## Pagamentos: Stripe em ambiente de teste

A integração Stripe agora inclui cadastro Connect, Checkout, comissão, confirmação por webhook e reembolso **somente de teste**. A migração adicional `20260930110000_stripe_sandbox.sql` deve ser aplicada depois das seis migrações deste guia. Consulte [ativação da Stripe no sandbox](stripe-sandbox.md) para configurar credenciais, endpoint e cartões de teste. Pagamentos reais continuam bloqueados; o financeiro geral não contabiliza testes como receitas reais.

## Verificação

```text
npm test
npm run lint
npm run build
npm run test:browser
```

`npm test` executa as migrações em PGlite e testa permissões/RLS, região inválida, assinaturas idempotentes, plantões noturnos, sobreposição, alteração de versão, substituição, encerramento, entrada/saída, avaliações, arquivos privados e fila de lembretes. Testes de integração remota preexistentes só executam quando suas variáveis específicas são configuradas.

Os testes Playwright usam a build de produção local na porta 3100 e respostas de API controladas, sem alterar contas reais. O navegador padrão é Microsoft Edge; defina `PLAYWRIGHT_CHANNEL=chrome` para Chrome. Eles verificam o formulário de vaga, rotina/contrato, agenda, navegação do chat e a exibição móvel do valor e do botão de interesse. Para um ambiente sem Edge/Chrome, ajuste o canal e instale o navegador de teste correspondente.

Os testes locais não substituem a validação de conectividade com IBGE/ViaCEP, Storage, Web Push e permissões do projeto Supabase de destino após a implantação.
