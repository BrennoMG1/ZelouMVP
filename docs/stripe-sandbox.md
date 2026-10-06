# Stripe no Zelou — somente ambiente de teste

A integração usa Checkout hospedado, Connect Accounts v2 com configuração `recipient` e Dashboard Express. A família testa o pagamento integral da versão assinada do contrato; a comissão armazenada no contrato fica com a plataforma e o restante vai para o saldo Stripe de teste do cuidador. Não existe cobrança real, Pix, boleto, parcelamento, assinatura recorrente ou liberação de saldo condicionada ao fim do plantão nesta implementação.

Chaves `sk_live_` e eventos/objetos com `livemode=true` são rejeitados. Não há opção para habilitar pagamentos reais. O modo de teste não realiza cobranças ou repasses reais; consulte a [documentação de testes da Stripe](https://docs.stripe.com/testing). O checkout recolhe os dados do cartão diretamente na Stripe, sem passar pelo servidor do Zelou.

## Ativação local

1. Aplique as migrações anteriores descritas em [ativação do fluxo de cuidado](ativacao-fluxo-cuidado.md) e depois `supabase/migrations/20260930110000_stripe_sandbox.sql`. A migração cria tabelas separadas de teste, RLS, reserva de pagamento, sincronização e proteção de contratos. **Ela não foi aplicada automaticamente no Supabase remoto.**
2. Crie/accesse sua conta Stripe, selecione um sandbox e configure Connect para marketplace no Brasil. Habilite Accounts v2 e o cadastro hospedado. Plataforma e cuidadores deste fluxo usam Brasil/BRL. Siga a [configuração oficial para marketplace](https://docs.stripe.com/connect/marketplace/tasks/create).
3. Copie a chave secreta **do sandbox** para `.env.local`, sem compartilhá-la em chat ou versioná-la. Configure no servidor:

   ```dotenv
   STRIPE_SANDBOX_ENABLED=true
   STRIPE_SECRET_KEY=sk_test_SUBSTITUA_PELA_CHAVE_DO_SANDBOX
   STRIPE_WEBHOOK_SECRET=whsec_SUBSTITUA_PELO_SEGREDO_DO_ENDPOINT
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

   Supabase também precisa das configurações já existentes de URL, chave pública e chave administrativa. Checkout hospedado dispensa chave pública Stripe no navegador. As chaves do exemplo são marcadores, não credenciais funcionais.
4. Instale/autentique a [Stripe CLI](https://docs.stripe.com/stripe-cli) usando a conta/sandbox correspondente. Encaminhe os eventos da **plataforma**, onde o checkout é criado:

   ```powershell
   stripe listen --events checkout.session.completed,checkout.session.expired,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,charge.refunded,refund.created,refund.updated,refund.failed --forward-to localhost:3000/api/stripe/webhook
   ```

   Use o `whsec_...` exibido pelo comando em `STRIPE_WEBHOOK_SECRET`. O segredo da CLI difere do segredo de um endpoint registrado no Dashboard. Não use `--live`.
5. Reinicie `npm run dev` após configurar as variáveis. Na hospedagem de teste, cadastre `https://SEU-DOMINIO/api/stripe/webhook` no sandbox e use o segredo desse endpoint. `NEXT_PUBLIC_APP_URL` deve ser a origem pública confiável do Zelou, nunca a URL da Stripe.

## Fluxo de teste

1. Entre como cuidador e abra **Financeiro → Recebimentos de teste → Configurar recebimentos de teste**. Preencha o onboarding usando os [dados de teste Connect](https://docs.stripe.com/connect/testing). Ao voltar, use **Atualizar cadastro**. Entrar e sair do formulário não significa aprovação; o servidor consulta a capacidade de receber transferências.
2. Crie e assine um contrato com as duas partes. Entre como família, abra **Meus contratos → contrato → Pagamento do contrato · Teste** e clique em **Testar pagamento com cartão**. O cuidador precisa ter concluído o cadastro de teste.
3. No Checkout, use `4242 4242 4242 4242`, validade futura e CVC de teste para aprovação; `4000 0000 0000 0002` permite testar recusa. Use apenas dados de teste. Mais cenários estão na [lista oficial de cartões de teste](https://docs.stripe.com/testing#cards).
4. Ao voltar, aguarde o webhook ou clique em **Atualizar pagamento**. Acrescentar `?stripe=return` à URL **não** confirma pagamento. A assinatura, moeda, valor, contrato, versão, comissão, destinatário e modo de teste são conferidos no servidor.
5. **Encerrar checkout de teste** expira uma sessão ainda aberta e permite alterar o contrato ou iniciar outra tentativa. Apenas voltar/cancelar a navegação não expira a sessão: é possível retomá-la. Uma recusa de cartão permite tentar outro cartão na mesma sessão.
6. **Reembolsar teste** solicita o reembolso integral restante, incluindo reversão da transferência e devolução da comissão. Reembolso pendente não é mostrado como concluído; atualize para acompanhar. Reembolso parcial feito pelo Dashboard também é reconhecido. Encerrar o contrato não reembolsa automaticamente pagamentos.

O financeiro geral continua exibindo compromissos contratuais, sem somar testes a recebimentos reais. O histórico de teste está no contrato. Transferência ao saldo Stripe não representa depósito em conta bancária; o sistema não declara payout bancário confirmado.

## Integridade e operação

- Uma reserva por contrato impede checkouts simultâneos. A Stripe recebe uma chave de idempotência derivada da reserva; recarregar ou repetir requisições não cria outra cobrança.
- Valores usam centavos inteiros. A taxa vem do contrato, sem ser aceita do navegador. O líquido é calculado subtraindo a taxa já arredondada; isso corrige diferenças de um centavo em novos contratos e novas versões. Documentos antigos são preservados; se houver diferença, o teste exige uma nova versão aceita pelas partes.
- Enquanto houver checkout aberto ou pagamento não integralmente reembolsado, aceitar alteração da versão/valor do contrato é bloqueado. Isso evita pagar condições diferentes das assinadas. Pode-se encerrar um contrato pago, mas o reembolso é uma operação separada.
- O ledger usa `stripe_test_accounts`, `stripe_test_payments` e `stripe_test_events`. Apenas os participantes leem pagamentos, apenas o cuidador lê sua conta e somente o servidor grava estados. A família inicia, encerra e reembolsa; ambos consultam o status. As notificações internas dizem explicitamente “teste”.
- Webhooks têm assinatura verificada sobre o corpo bruto. O processamento consulta o estado atual na Stripe, tolera duplicatas e não regride pagamento confirmado para “aberto” devido a eventos atrasados. Falhas retornam erro para permitir reentrega. Dados de cartão, dados bancários e informações de saúde não são armazenados no ledger nem enviados nos metadados Stripe.
- Cadastro e checkout usam identificadores persistentes. Se a resposta Stripe se perder, repita a operação: ela reaproveita a mesma chave. Depois da expiração de um checkout sem ID local, o servidor procura a sessão na Stripe antes de liberar a reserva; a busca é limitada a 1.000 sessões, falhando de forma conservadora se excedida. Uma tentativa de criação ainda sem sessão pode ficar bloqueada até expirar caso a primeira chamada falhe definitivamente.
- Contas cuja criação ficou sem ID por mais de 23 horas exigem conciliação administrativa: procure no sandbox por `metadata.zelou_caregiver_id`, confirme o vínculo e preencha `stripe_test_accounts.stripe_account_id` usando acesso administrativo. Não apague reservas nem crie contas repetidas às cegas. A chave de idempotência Stripe pode expirar após 24 horas. O mesmo cuidado vale para uma sessão cujo estado não pôde ser conciliado automaticamente.
- Não troque de sandbox/chave de conta usando o mesmo ledger: IDs pertencem à conta original. Use outro ambiente Supabase para um sandbox diferente. Não altere a origem pública durante um checkout em criação, pois ela participa dos parâmetros idempotentes.
- A integração trata o custo do provedor como custo da plataforma, separado da comissão contratual. Essa é a mecânica de [destination charges](https://docs.stripe.com/connect/destination-charges?platform=web&ui=stripe-hosted); ela não fixa tarifas futuras. Operação real exigirá trabalho separado sobre precificação, disputas, conciliação e repasses, além de remover deliberadamente o bloqueio de produção.

## Verificações

```powershell
npm test
npm run lint
npm run build
npm run test:browser
```

Os testes locais exercitam SQL real em PGlite, RLS, reserva única, arredondamento, estados fora de ordem, assinatura de webhook, acesso indevido, bloqueio de chaves reais e telas com APIs controladas. Não substituem um checkout real **no sandbox**, após a configuração das credenciais e a aplicação das migrações no projeto de destino.
