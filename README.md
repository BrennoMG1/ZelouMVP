# Zelou!

Marketplace de cuidado entre famílias e cuidadores. Usa Next.js App Router e Supabase (Auth, Postgres e Storage).

## Estado real

- Backend implementado: cadastro, login, logout, sessão SSR, recuperação de senha, perfil, avatar privado, oportunidades, candidaturas, conversas/mensagens, documentos, contratos, agenda e relatórios.
- Pagamentos e recebimentos: **não implementados**. O sistema exibe valores contratuais, mas não armazena cartão, conta bancária, Pix nem confirma pagamento. As opções correspondentes do perfil ficam desabilitadas até uma integração PCI-compliant.
- A interface ainda contém indicadores MVP estáticos; não os interprete como transações reais.

## Desenvolvimento

```bash
npm install
npm run dev
npm run lint
npm run build
```

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` — somente servidor; nunca com prefixo `NEXT_PUBLIC_`.
- `SUPABASE_JWKS_URL`
- `NEXT_PUBLIC_APP_URL` — URL canônica, como `https://app.exemplo.com`.

Para recuperação de senha, adicione `https://seu-dominio/reset-password` às Redirect URLs do Supabase Auth.

## Banco e Storage

Em banco novo, execute no SQL Editor, nesta ordem:

1. `supabase/schema.sql`
2. `supabase/migrations/20260922_security_hardening.sql`
3. `supabase/migrations/20260922_product_persistence.sql`
4. `supabase/migrations/20260922_diary_and_notifications.sql`
5. `supabase/migrations/20260923_medications.sql`
6. `supabase/migrations/20260924_chat_membership_fix.sql`

A migração de chat corrige uma policy recursiva em `conversation_members`. Aplique também nos bancos existentes; ela preserva conversas e mensagens. A lista mostra o nome do contato e a oportunidade, atualiza a cada 5 segundos e busca mensagens a cada 3 segundos enquanto a aba Mensagens estiver aberta. Candidaturas já enviadas têm a ação de abrir a conversa novamente.

### Rotina de medicamentos

Em **Meus contratos**, o responsável cadastra medicamento, dose, orientações, intervalo em horas, primeiro horário e término opcional. Para alterar uma rotina, encerre a anterior e cadastre a nova; o histórico anterior permanece disponível. O cuidador do contrato ativo registra a administração e o horário ocorrido, ou informa o motivo de uma dose não administrada. O próximo horário segue o intervalo originalmente cadastrado, sem apagar pendências anteriores.

Os horários pendentes aparecem somente dentro do contrato aberto, para as duas partes, com atualização a cada 30 segundos. Clique em um cartão de Meus contratos para abrir os detalhes, as assinaturas e os medicamentos. O código REQ corresponde ao ID completo da oportunidade de origem e o código CTR ao ID do contrato; nenhuma migração adicional é necessária para exibir esses identificadores. Funcionam com o site aberto; não há push ou aviso com o navegador fechado. Os horários usam o fuso do dispositivo. A ficha registra as orientações informadas pelo responsável; não consulta bulas externas. A migração precisa ser aplicada antes de disponibilizar esta versão, inclusive para a exportação dos dados da conta.

`schema.sql` é um script de criação inicial e **não deve ser executado novamente** em um banco já inicializado: ele cria enums, tabelas e policies sem substituir objetos existentes. Em um banco existente, execute somente as migrations que ainda não foram aplicadas, uma única vez e na ordem indicada.

`seed.sql` é apenas demonstração e não deve ser aplicado em produção.

As migrations criam buckets privados `documents` e `avatars`. Uploads ocorrem por rotas server-side autenticadas. Avatares são disponibilizados por URL assinada curta; documentos não recebem URL pública.

## RLS e testes de segurança

RLS separa dados próprios, partes de contratos e membros de conversa. Criação validada de conversa/contrato e operações administrativas usam service role exclusivamente no servidor, após validar sessão, papel e relacionamento.

## Rate limiting

O limite atual é em memória por processo, suficiente apenas para desenvolvimento/instância única. Para deploy distribuído, implemente um adaptador Redis/Upstash usando as variáveis indicadas em `.env.example`; múltiplas instâncias não compartilham contadores hoje.

## Limitações

- Revisão jurídica de LGPD, termos, base legal, retenção e exclusão é obrigatória antes do lançamento.
- Não há KYC/verificação documental externa, assinatura eletrônica ou gateway de pagamentos.
- Testes reais de RLS, Auth, Storage e recuperação exigem projeto Supabase e credenciais de teste; build local não substitui esses testes.
