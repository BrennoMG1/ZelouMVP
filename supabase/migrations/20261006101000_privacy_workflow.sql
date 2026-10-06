begin;
alter table public.privacy_requests add column response_note text;
alter table public.privacy_requests add column reviewed_by uuid references public.profiles(id);
-- Users may submit/read, but cannot mark their own request completed.
revoke update,delete,insert on public.privacy_requests from authenticated;
grant insert(user_id,request_type,details) on public.privacy_requests to authenticated;
create table public.account_closures (
  user_id uuid primary key references public.profiles(id),
  request_id uuid not null unique references public.privacy_requests(id),
  actor_id uuid not null references public.profiles(id),
  retention_note text not null,
  state text not null default 'processing' check(state in ('processing','completed')),
  created_at timestamptz not null default now(), completed_at timestamptz
);
alter table public.account_closures enable row level security;
revoke all on public.account_closures from public,anon,authenticated;
grant all on public.account_closures to service_role;
create function public.active_account_uid() returns uuid language sql stable security definer set search_path=public as $$
  select auth.uid() where not exists(select 1 from public.account_closures where user_id=auth.uid())
$$;
revoke all on function public.active_account_uid() from public;
grant execute on function public.active_account_uid() to authenticated,service_role;

-- A previously issued JWT must not keep working against PostgREST or RPCs
-- while account closure is being retried across Storage and Auth.
do $$ declare t record; f record; begin
  for t in select tablename from pg_tables where schemaname='public' and tablename not in ('account_closures','request_limits') loop
    execute format('create policy "open account required" on public.%I as restrictive for all to authenticated using (public.active_account_uid() is not null) with check (public.active_account_uid() is not null)',t.tablename);
  end loop;
  -- Keep original signatures and permissions. Rebind the caller identity in
  -- existing public functions; the new helper itself must keep auth.uid().
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname<>'active_account_uid' and p.prosrc like '%auth.uid()%' loop
    execute replace(pg_get_functiondef(f.oid),'auth.uid()','public.active_account_uid()');
  end loop;
end $$;

-- Storage uses a separate schema; old tokens must lose its permissions too.
create policy "open account required" on storage.objects as restrictive
for all to authenticated
using (public.active_account_uid() is not null)
with check (public.active_account_uid() is not null);

create function public.review_privacy_request(p_id uuid,p_status text,p_note text) returns void
language plpgsql security definer set search_path=public as $$
declare r public.privacy_requests; actor uuid:=public.active_account_uid();
begin
  if actor is null or not exists(select 1 from profiles where id=actor and role in ('admin','super_admin')) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  select * into r from privacy_requests where id=p_id for update;
  if r.id is null or r.status in ('completed','rejected') or p_status not in ('in_progress','completed','rejected') or length(trim(p_note)) not between 10 and 3000 then raise exception 'Confira a solicitação, o estado e a resposta.' using errcode='22023'; end if;
  if exists(select 1 from account_closures where request_id=p_id) or (r.request_type='deletion' and p_status='completed') then raise exception 'Use o processamento de encerramento para concluir este pedido.' using errcode='22023'; end if;
  update privacy_requests set status=p_status,response_note=p_note,reviewed_by=actor,completed_at=case when p_status in ('completed','rejected') then now() end where id=p_id;
  insert into audit_logs(actor_id,action,entity_type,entity_id) values(actor,'privacy.'||p_status,'privacy_request',p_id);
  insert into notifications(user_id,title,body) values(r.user_id,'Solicitação de privacidade atualizada','Consulte a resposta em Configurações.');
end $$;
revoke all on function public.review_privacy_request(uuid,text,text) from public;
grant execute on function public.review_privacy_request(uuid,text,text) to authenticated;

create function public.prepare_account_closure(p_id uuid,p_actor uuid,p_note text) returns uuid
language plpgsql security definer set search_path=public as $$
declare r public.privacy_requests;
begin
  if not exists(select 1 from profiles where id=p_actor and role in ('admin','super_admin')) or exists(select 1 from account_closures where user_id=p_actor) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  select * into r from privacy_requests where id=p_id for update;
  if r.id is null or r.request_type<>'deletion' or r.status not in ('requested','in_progress') or coalesce(length(trim(p_note)),0) not between 10 and 3000 then raise exception 'Solicitação inválida.' using errcode='22023'; end if;
  perform 1 from profiles where id=r.user_id for update;
  if r.user_id=p_actor or exists(select 1 from profiles where id=r.user_id and role in ('admin','super_admin')) then raise exception 'Não é permitido encerrar administradores por este fluxo.' using errcode='22023'; end if;
  if exists(select 1 from contracts where r.user_id in (client_id,caregiver_id) and status in ('draft','pending_signatures','active')) then raise exception 'Resolva os contratos em andamento antes de encerrar a conta.' using errcode='22023'; end if;
  if exists(select 1 from stripe_test_payments where r.user_id in (client_id,caregiver_id) and status not in ('expired','refunded')) then raise exception 'Encerre ou reembolse os pagamentos de teste pendentes.' using errcode='22023'; end if;
  insert into account_closures(user_id,request_id,actor_id,retention_note) values(r.user_id,r.id,p_actor,p_note) on conflict(user_id) do nothing;
  if not exists(select 1 from account_closures where user_id=r.user_id and request_id=r.id) then raise exception 'Outro pedido de encerramento está em andamento.' using errcode='22023'; end if;
  update privacy_requests set status='in_progress',response_note=p_note,reviewed_by=p_actor where id=r.id;
  update opportunities set status='closed' where client_id=r.user_id;
  return r.user_id;
end $$;
revoke all on function public.prepare_account_closure(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_account_closure(uuid,uuid,text) to service_role;

create function public.finish_account_closure(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare c public.account_closures;
begin
  select * into c from account_closures where request_id=p_id for update;
  if c.user_id is null then raise exception 'Encerramento não preparado.'; end if;
  if c.state='completed' then return; end if;
  update profiles set full_name='Conta encerrada',phone=null,avatar_url=null,city=null,state=null,region_id=null where id=c.user_id;
  update caregiver_profiles set bio=null,availability='{}',specialties='{}',service_modes='{}' where user_id=c.user_id;
  delete from documents where caregiver_id=c.user_id;
  delete from push_subscriptions where user_id=c.user_id;
  delete from notifications where user_id=c.user_id;
  delete from messages where sender_id=c.user_id and kind='text';
  delete from elderly_profiles where client_id=c.user_id;
  update opportunities set title='Vaga encerrada',description='Conta encerrada.',requirements=null,exact_address_encrypted=null where client_id=c.user_id;
  update applications set message=null where caregiver_id=c.user_id;
  update privacy_requests set status='completed',completed_at=now() where id=p_id;
  update account_closures set state='completed',completed_at=now() where request_id=p_id;
  insert into audit_logs(actor_id,action,entity_type,entity_id) values(c.actor_id,'privacy.account_closed_with_retention','privacy_request',p_id);
end $$;
revoke all on function public.finish_account_closure(uuid) from public,anon,authenticated;
grant execute on function public.finish_account_closure(uuid) to service_role;

-- Serialize new commitments with closure preparation, including service-role writes.
create function public.guard_closing_account_commitment() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  perform 1 from profiles where id in (new.client_id,new.caregiver_id) order by id for update;
  if exists(select 1 from account_closures where user_id in (new.client_id,new.caregiver_id)) then
    raise exception 'Uma das contas está em encerramento.' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_closing_account_commitment() from public,anon,authenticated;
create trigger guard_closing_contract before insert or update on public.contracts
for each row when (new.status in ('draft','pending_signatures','active'))
execute function public.guard_closing_account_commitment();
create trigger guard_closing_payment before insert or update on public.stripe_test_payments
for each row when (new.status not in ('expired','refunded'))
execute function public.guard_closing_account_commitment();
commit;
