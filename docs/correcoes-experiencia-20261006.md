# Correções e ativação — 6 de outubro de 2026

## Publicação

Com as migrations anteriores já aplicadas, execute os arquivos novos nesta ordem no Supabase:

1. `supabase/migrations/20261006100000_shared_rate_limit.sql`
2. `supabase/migrations/20261006101000_privacy_workflow.sql`
3. Publique a versão atualizada no Netlify.

Não sobrescreva as migrations antigas. Aplique as duas novas antes do deploy: autenticação e limites de requisições dependem das funções criadas por elas. O contador usa o próprio Supabase; não exige contratar Redis. As migrations e o deploy não foram executados remotamente nesta revisão.

## Comportamentos corrigidos

- Menu Mais no celular dá acesso a todas as seções de cada perfil.
- Entrada restaura foto e preferência de acessibilidade. Saída limpa o estado da conta somente quando o servidor confirma o logout.
- Navegação entre seções e conversas pede confirmação se houver formulário ou mensagem não salva; recarregar/fechar a página também solicita confirmação nos navegadores compatíveis. Rascunhos não são gravados no armazenamento local.
- Troca automática de conversa limpa mensagens, rascunho e paginação; respostas atrasadas da conversa anterior são ignoradas.
- Dados cadastrais, e-mail e senha são operações separadas. Mudanças de e-mail pendentes são apresentadas como pendentes.
- Solicitações de privacidade têm acompanhamento e resposta; a administração tem ações de análise e encerramento.
- Limites por minuto são atômicos e compartilhados no banco entre instâncias. Se o contador falhar, a operação protegida é recusada.
- A página inicial explica os próximos passos para família e cuidador, com atalhos para agenda e conversas.

## Encerramento de conta

O usuário solicita em Configurações. Um administrador analisa, registra a resposta e os motivos de retenção, comunica o resultado e confirma a conta antes de processar o encerramento. Contas administrativas, contratos em andamento e pagamentos de teste não encerrados impedem essa operação.

O processamento bloqueia a conta inclusive para tokens antigos, remove arquivos cadastrais pelos serviços de Storage, usa exclusão lógica no Auth e limpa dados cadastrais e mensagens de texto enviadas. Contratos, registros de cuidado, anexos compartilhados, auditoria e registros financeiros permanecem. Isso é encerramento com retenção explícita, não uma promessa de eliminação integral de todos os dados. Registros externos da Stripe não são apagados por esse fluxo.

Falhas em Storage/Auth deixam o pedido em processamento e permitem repetir a mesma ação. Não se marca conclusão antes de finalizar as etapas. Nenhuma conta real foi encerrada durante os testes. A integração real com Storage/Auth ainda deve ser validada com uma conta descartável no ambiente de teste.

## Avaliação de experiência

Validação local: build e lint aprovados; 24 testes de regras/banco aprovados e três testes externos sem execução. Os 13 cenários de navegador registraram sucesso. O processo de testes de navegador ficou aguardando o encerramento do servidor no Windows e foi interrompido depois dos resultados; isso não valida o ambiente publicado.

Esta avaliação é uma inspeção do produto e dos fluxos, não uma pesquisa com cuidadores ou idosos.

Como cuidador, a proposta atende a busca de vagas, conversa, contrato e organização. Para depender dela diariamente, priorizaria: resumo do próximo plantão com tarefas e contato; regras claras para cancelamento, atrasos e substituição; melhor indicação de deslocamento sem expor endereço privado; e suporte humano acessível. O financeiro ainda é sandbox, sem recebimento real.

Como familiar, o caminho publicar → conversar → contratar → acompanhar é compreensível, mas a quantidade de seções ainda exige aprendizado. Um assistente de contratação em etapas e explicações objetivas sobre o alcance da verificação de cada profissional aumentariam a confiança.

Para um idoso usando sozinho, recomendaria testar uma página inicial simplificada com poucas ações grandes, linguagem cotidiana e apoio de uma pessoa de confiança. Fonte maior e gestos ajudam, mas não demonstram por si só que a interface é acessível ou intuitiva. Validar com pessoas reais continua necessário.
