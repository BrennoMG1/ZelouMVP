begin;

-- Round the fee once, then subtract it. Rounding both fee and net separately
-- can make a R$123.45 contract add up to R$123.46. Preserve already signed
-- documents until an explicit new version is accepted by the parties.
alter table public.contracts alter column caregiver_net_amount drop expression;
create function public.calculate_contract_net() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='INSERT' or new.document_version is distinct from old.document_version then
    new.caregiver_net_amount:=new.gross_amount-round(new.gross_amount*new.platform_fee_rate,2);
  else new.caregiver_net_amount:=old.caregiver_net_amount;
  end if;
  return new;
end $$;
create trigger calculate_contract_net before insert or update on public.contracts for each row execute function public.calculate_contract_net();

-- Isolated test ledger: these rows must never be treated as real receipts.
create table public.stripe_test_accounts (
  caregiver_id uuid primary key references public.profiles(id),
  stripe_account_id text unique,
  ready boolean not null default false,
  livemode boolean not null default false check (livemode = false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.stripe_test_payments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id),
  contract_version integer not null,
  client_id uuid not null references public.profiles(id),
  caregiver_id uuid not null references public.profiles(id),
  destination text not null,
  amount_cents integer not null check (amount_cents between 50 and 100000000),
  fee_cents integer not null check (fee_cents >= 0 and fee_cents < amount_cents),
  currency text not null default 'brl' check (currency = 'brl'),
  status text not null default 'creating' check (status in ('creating','open','paid','expired','partially_refunded','refunded')),
  stripe_session_id text unique,
  stripe_payment_intent_id text unique,
  refunded_cents integer not null default 0 check (refunded_cents between 0 and amount_cents),
  livemode boolean not null default false check (livemode = false),
  expires_at timestamptz not null default (now() + interval '1 hour'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_unsettled_test_payment on public.stripe_test_payments(contract_id)
  where status not in ('expired','refunded');
create index stripe_test_payments_parties on public.stripe_test_payments(client_id,caregiver_id);
create table public.stripe_test_events (
  id text primary key, event_type text not null, processed_at timestamptz not null default now()
);

alter table public.stripe_test_accounts enable row level security;
alter table public.stripe_test_payments enable row level security;
alter table public.stripe_test_events enable row level security;
revoke all on public.stripe_test_accounts,public.stripe_test_payments,public.stripe_test_events from anon,authenticated;
grant select on public.stripe_test_accounts,public.stripe_test_payments to authenticated;
grant all on public.stripe_test_accounts,public.stripe_test_payments,public.stripe_test_events to service_role;
create policy "own test connect account" on public.stripe_test_accounts for select to authenticated using(caregiver_id=auth.uid());
create policy "parties read test payments" on public.stripe_test_payments for select to authenticated using(auth.uid() in (client_id,caregiver_id));

create function public.reserve_stripe_test_payment(p_contract uuid) returns public.stripe_test_payments
language plpgsql security definer set search_path=public as $$
declare c public.contracts; p public.stripe_test_payments; a public.stripe_test_accounts;
begin
  select * into c from public.contracts where id=p_contract for update;
  if auth.uid() is null or c.client_id is distinct from auth.uid() then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if c.status not in ('active','completed') or c.client_signed_at is null or c.caregiver_signed_at is null then
    raise exception 'O contrato precisa estar assinado pelas duas partes.' using errcode='22023';
  end if;
  select * into p from public.stripe_test_payments where contract_id=c.id and status not in ('expired','refunded');
  if found then return p; end if;
  if exists(select 1 from public.contract_changes where contract_id=c.id and status='pending') then
    raise exception 'Resolva a alteração contratual antes de testar o pagamento.' using errcode='22023';
  end if;
  select * into a from public.stripe_test_accounts where caregiver_id=c.caregiver_id;
  if a.stripe_account_id is null or not a.ready then raise exception 'O cuidador precisa concluir o cadastro de recebimento de teste.' using errcode='22023'; end if;
  if c.gross_amount<0.50 then raise exception 'O teste com cartão exige pelo menos R$ 0,50.' using errcode='22023'; end if;
  if c.gross_amount<>c.platform_fee+c.caregiver_net_amount then
    raise exception 'Este contrato antigo tem diferença de arredondamento. Aceitem uma nova versão antes de testar o pagamento.' using errcode='22023';
  end if;
  insert into public.stripe_test_payments(contract_id,contract_version,client_id,caregiver_id,destination,amount_cents,fee_cents)
    values(c.id,c.document_version,c.client_id,c.caregiver_id,a.stripe_account_id,round(c.gross_amount*100)::integer,round(c.platform_fee*100)::integer)
    returning * into p;
  return p;
end $$;
revoke all on function public.reserve_stripe_test_payment(uuid) from public;
grant execute on function public.reserve_stripe_test_payment(uuid) to authenticated;

-- Only the server may apply a state retrieved directly from Stripe. Lock order
-- matches reservation/contract transitions; duplicate and old events are safe.
create function public.apply_stripe_test_payment(p_id uuid,p_session text,p_intent text,p_status text,p_refunded integer)
returns public.stripe_test_payments language plpgsql security definer set search_path=public as $$
declare p public.stripe_test_payments; cid uuid; previous text;
begin
  select contract_id into cid from public.stripe_test_payments where id=p_id;
  perform 1 from public.contracts where id=cid for update;
  select * into p from public.stripe_test_payments where id=p_id for update;
  if p.id is null or p_session is null or p_session not like 'cs_test_%'
    or (p.stripe_session_id is not null and p.stripe_session_id<>p_session)
    or (p.stripe_payment_intent_id is not null and p.stripe_payment_intent_id is distinct from p_intent)
    or p_status not in ('open','paid','expired','partially_refunded','refunded')
    or p_refunded is null or p_refunded<0 or p_refunded>p.amount_cents
    or (p_status in ('paid','partially_refunded','refunded') and p_intent is null)
    or (p_status='refunded' and p_refunded<>p.amount_cents)
    or (p_status='partially_refunded' and (p_refunded=0 or p_refunded=p.amount_cents))
    or (p_status in ('open','expired','paid') and p_refunded<>0) then
    raise exception 'Inconsistent test payment.' using errcode='22023';
  end if;
  if p.status='refunded' or p_refunded<p.refunded_cents
    or (p.status in ('paid','partially_refunded') and p_status in ('open','expired'))
    or (p.status='expired' and p_status='open') then return p; end if;
  previous:=p.status;
  update public.stripe_test_payments set stripe_session_id=p_session,
    stripe_payment_intent_id=coalesce(p_intent,stripe_payment_intent_id),status=p_status,
    refunded_cents=p_refunded,updated_at=now() where id=p.id returning * into p;
  if previous is distinct from p.status then
    insert into public.audit_logs(action,entity_type,entity_id,metadata)
      values('payment.test.'||p.status,'contract',p.contract_id,jsonb_build_object('payment_id',p.id,'livemode',false));
    if p.status in ('paid','refunded','partially_refunded') then
      insert into public.notifications(user_id,title,body) values
        (p.client_id,'Pagamento de teste atualizado','Consulte o contrato. Nenhum dinheiro real foi movimentado.'),
        (p.caregiver_id,'Pagamento de teste atualizado','Consulte o contrato. Nenhum dinheiro real foi movimentado.');
    end if;
  end if;
  return p;
end $$;
revoke all on function public.apply_stripe_test_payment(uuid,text,text,text,integer) from public,authenticated,anon;
grant execute on function public.apply_stripe_test_payment(uuid,text,text,text,integer) to service_role;

-- Called only after the server exhaustively checks Stripe for a lost session.
create function public.release_missing_stripe_test_session(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare cid uuid;
begin
  select contract_id into cid from public.stripe_test_payments where id=p_id;
  perform 1 from public.contracts where id=cid for update;
  update public.stripe_test_payments set status='expired',updated_at=now()
    where id=p_id and status='creating' and stripe_session_id is null and expires_at<now();
end $$;
revoke all on function public.release_missing_stripe_test_session(uuid) from public,authenticated,anon;
grant execute on function public.release_missing_stripe_test_session(uuid) to service_role;

create function public.guard_contract_test_payment() returns trigger language plpgsql set search_path=public as $$
begin
  if (new.document_version is distinct from old.document_version or new.gross_amount is distinct from old.gross_amount
    or new.platform_fee_rate is distinct from old.platform_fee_rate) and exists(select 1 from public.stripe_test_payments
      where contract_id=old.id and status not in ('expired','refunded')) then
    raise exception 'Encerre o checkout ou reembolse o pagamento de teste antes de aceitar uma alteração.' using errcode='22023';
  end if;
  if new.status is distinct from old.status and new.status in ('cancelled','completed') and exists(select 1 from public.stripe_test_payments
    where contract_id=old.id and status in ('creating','open')) then
    raise exception 'Encerre o checkout de teste antes de encerrar o contrato.' using errcode='22023';
  end if;
  return new;
end $$;
create trigger guard_contract_test_payment before update on public.contracts for each row execute function public.guard_contract_test_payment();
commit;
