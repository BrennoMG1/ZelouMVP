# Experiência de cuidado

## Cuidador

O início mostra o próximo plantão agendado (priorizando um atendimento com entrada registrada), período, nome da outra parte e região. Os botões levam à agenda e ao contrato correspondente, onde estão as tarefas e os dados privados. Plantões cancelados, concluídos e com término no passado são excluídos desse resumo; ele atualiza a cada minuto.

“Planejar deslocamento” abre a região aproximada no Google Maps, somente após clique. Não transmite o endereço privado nem calcula distância/trânsito. As orientações de cancelamento explicam as ações existentes, suas limitações e a diferença entre cancelar um plantão e encerrar um contrato. Nenhuma multa ou política comercial nova foi imposta.

## Família

Publicação e edição de vagas seguem três etapas: necessidade, local/agenda/valor e revisão. Voltar preserva os campos. A publicação só ocorre após a revisão. A contratação continua dependendo de conversa e aceite do contrato pelas partes.

O perfil profissional explica o alcance da análise documental e separa essa informação de experiência declarada e avaliações. Estados que não são aprovados nem estão em análise não aparecem como “Em análise”.

## Idoso

O botão “Usar modo simples” oferece fonte ampliada, oculta os menus extensos e apresenta cinco atalhos: Meu cuidador, Próximo atendimento, Conversar, Pedir ajuda e Voltar ao início. “Usar painel completo” restaura a navegação. A escolha vale para a sessão atual da página. Agenda, contratos e conversa reutilizam os fluxos existentes; não houve uma reformulação completa dessas telas.

## Suporte e publicação

O botão de suporte abre o aplicativo de e-mail para `contato.suporte@zeloucuidados.com`. Não envia automaticamente nem cria ticket. A existência e a entrega da caixa postal não foram verificadas; o responsável deve manter esse e-mail operacional. É possível substituir o endereço com `NEXT_PUBLIC_SUPPORT_EMAIL` no build do Netlify.

Estas melhorias não exigem migration adicional. Dependem das migrations já informadas anteriormente e de um novo deploy do aplicativo. Os pagamentos continuam exclusivamente em sandbox, conforme a orientação de não realizar cobranças reais.

Validação: TypeScript, lint e build aprovados. Os 15 cenários de navegador registraram sucesso. Após os resultados, o processo ficou aguardando o encerramento do servidor no Windows e foi interrompido. Os testes usam respostas simuladas das APIs e não substituem a validação no ambiente publicado.
