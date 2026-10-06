begin;

create table public.care_tasks (
  id uuid primary key default uuid_generate_v4(), contract_id uuid not null references public.contracts(id),
  title text not null check(length(title) between 3 and 160), category text not null check(category in ('food','water','hygiene','mobility','other')),
  due_at timestamptz not null, assigned_to uuid not null references public.profiles(id),
  status text not null default 'pending' check(status in ('pending','done','skipped','cancelled')),
  notes text not null default '' check(length(notes)<=3000), recorded_by uuid references public.profiles(id), recorded_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.care_tasks enable row level security;
create policy "parties read care tasks" on public.care_tasks for select to authenticated using(exists(select 1 from public.contracts c where c.id=contract_id and auth.uid() in (c.client_id,c.caregiver_id)));
create function public.manage_care_task(p_id uuid,p_data jsonb) returns void language plpgsql security definer set search_path=public as $$
declare c public.contracts; task public.care_tasks; first_due timestamptz; repeat_days integer;
begin
  if p_id is not null then select * into task from public.care_tasks where id=p_id; end if;
  select * into c from public.contracts where id=coalesce(task.contract_id,(p_data->>'contractId')::uuid) for update;
  if p_id is not null then select * into task from public.care_tasks where id=p_id for update; end if;
  if auth.uid() is null or c.id is null or auth.uid() not in (c.client_id,c.caregiver_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if c.status<>'active' then raise exception 'Contrato inativo.' using errcode='22023'; end if;
  if p_id is null then
    first_due:=(p_data->>'dueAt')::timestamptz; repeat_days:=coalesce((p_data->>'repeatDays')::integer,1);
    if auth.uid()<>c.client_id then raise exception 'Somente o responsável define a rotina.' using errcode='42501'; end if;
    if repeat_days not between 1 and 90 or first_due<c.starts_at or first_due<now() or (c.ends_at is not null and first_due+(repeat_days-1)*interval '1 day'>c.ends_at) then raise exception 'Rotina fora do período contratado.' using errcode='22023'; end if;
    insert into public.care_tasks(contract_id,title,category,due_at,assigned_to)
      select c.id,p_data->>'title',p_data->>'category',first_due+i*interval '1 day',c.caregiver_id from generate_series(0,repeat_days-1) i;
  else
    if task.id is null or task.status<>'pending' then raise exception 'Tarefa já registrada.' using errcode='22023'; end if;
    if p_data->>'status'='cancelled' then
      if auth.uid()<>c.client_id then raise exception 'Somente o responsável cancela tarefas.' using errcode='42501'; end if;
    elsif p_data->>'status' in ('done','skipped') then
      if auth.uid()<>task.assigned_to or now()<task.due_at-interval '30 minutes' then raise exception 'Registro indisponível para este usuário ou horário.' using errcode='42501'; end if;
    else raise exception 'Resultado inválido.' using errcode='22023'; end if;
    if p_data->>'status' in ('skipped','cancelled') and length(trim(coalesce(p_data->>'notes','')))<3 then raise exception 'Informe a justificativa.' using errcode='22023'; end if;
    update public.care_tasks set status=p_data->>'status',notes=coalesce(p_data->>'notes',''),recorded_by=auth.uid(),recorded_at=now() where id=p_id;
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'routine.'||coalesce(p_data->>'status','create'),'contract',c.id);
end $$;
revoke all on function public.manage_care_task(uuid,jsonb) from public;
grant execute on function public.manage_care_task(uuid,jsonb) to authenticated;

create table public.care_reviews (
  id uuid primary key default uuid_generate_v4(), contract_id uuid not null references public.contracts(id),
  author_id uuid not null references public.profiles(id), subject_id uuid not null references public.profiles(id),
  rating integer not null check(rating between 1 and 5), comment text not null check(length(comment)<=2000),
  created_at timestamptz not null default now(), unique(contract_id,author_id)
);
alter table public.care_reviews enable row level security;
create policy "parties read reviews" on public.care_reviews for select to authenticated using(author_id=auth.uid() or subject_id=auth.uid());
create function public.submit_care_review(p_contract uuid,p_rating integer,p_comment text) returns void language plpgsql security definer set search_path=public as $$
declare c public.contracts;
begin
  select * into c from public.contracts where id=p_contract for share;
  if auth.uid() is null or c.id is null or auth.uid() not in (c.client_id,c.caregiver_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if c.status<>'completed' then raise exception 'Conclua o contrato antes de avaliar.' using errcode='22023'; end if;
  insert into public.care_reviews(contract_id,author_id,subject_id,rating,comment) values(c.id,auth.uid(),case when auth.uid()=c.client_id then c.caregiver_id else c.client_id end,p_rating,p_comment);
end $$;
revoke all on function public.submit_care_review(uuid,integer,text) from public;
grant execute on function public.submit_care_review(uuid,integer,text) to authenticated;

-- Contact details remain private; only professional fields are shared with
-- the family whose opportunity received this caregiver's application.
create function public.care_applicant_profile(p_caregiver uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if auth.uid() is null or not (auth.uid()=p_caregiver or exists(select 1 from public.applications a join public.opportunities o on o.id=a.opportunity_id where a.caregiver_id=p_caregiver and o.client_id=auth.uid())) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  select jsonb_build_object('name',p.full_name,'city',p.city,'state',p.state,'bio',cp.bio,'experienceYears',cp.experience_years,'specialties',cp.specialties,'availability',cp.availability,'hourlyRate',cp.hourly_rate,'verificationStatus',cp.verification_status,
    'rating',(select round(avg(rating),1) from public.care_reviews where subject_id=p_caregiver),'reviewCount',(select count(*) from public.care_reviews where subject_id=p_caregiver),
    'completedContracts',(select count(*) from public.contracts where caregiver_id=p_caregiver and status='completed')) into result from public.profiles p left join public.caregiver_profiles cp on cp.user_id=p.id where p.id=p_caregiver;
  return result;
end $$;
revoke all on function public.care_applicant_profile(uuid) from public;
grant execute on function public.care_applicant_profile(uuid) to authenticated;

alter table public.conversation_members add column last_read_at timestamptz;
alter table public.conversation_members add column blocked boolean not null default false;
alter table public.messages add column kind text not null default 'text' check(kind in ('text','system'));
revoke insert on public.messages from authenticated;
grant insert(conversation_id,sender_id,body) on public.messages to authenticated;
create table public.chat_reports (
  id uuid primary key default uuid_generate_v4(), conversation_id uuid not null references public.conversations(id),
  reporter_id uuid not null references public.profiles(id), reason text not null check(length(reason) between 10 and 3000),
  status text not null default 'open' check(status in ('open','reviewed')), created_at timestamptz not null default now()
);
alter table public.chat_reports enable row level security;
grant all on public.chat_reports to service_role;
create policy "reporter reads chat reports" on public.chat_reports for select to authenticated using(reporter_id=auth.uid());
create function public.manage_care_conversation(p_conversation uuid,p_action text,p_reason text default null) returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not exists(select 1 from public.conversation_members where conversation_id=p_conversation and user_id=auth.uid()) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_action='read' then
    if p_reason is null then return; end if;
    update public.conversation_members set last_read_at=greatest(coalesce(last_read_at,'-infinity'),(select created_at from public.messages where id=p_reason::uuid and conversation_id=p_conversation)) where conversation_id=p_conversation and user_id=auth.uid();
  elsif p_action in ('block','unblock') then update public.conversation_members set blocked=(p_action='block') where conversation_id=p_conversation and user_id=auth.uid();
  elsif p_action='report' then insert into public.chat_reports(conversation_id,reporter_id,reason) values(p_conversation,auth.uid(),p_reason);
  else raise exception 'Ação inválida.' using errcode='22023'; end if;
end $$;
revoke all on function public.manage_care_conversation(uuid,text,text) from public;
grant execute on function public.manage_care_conversation(uuid,text,text) to authenticated;

create function public.check_chat_block() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.kind='text' and exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and blocked) then raise exception 'Conversa bloqueada.' using errcode='42501'; end if;
  if new.attachment_path is not null then raise exception 'Anexos devem ser compartilhados na área privada do contrato.' using errcode='22023'; end if;
  return new;
end $$;
create trigger chat_block_guard before insert on public.messages for each row execute function public.check_chat_block();
create index chat_pagination_idx on public.messages(conversation_id,created_at desc,id desc);

create function public.care_chat_summaries() returns table(conversation_id uuid,unread bigint,last_body text,last_at timestamptz,blocked boolean,peer_read_at timestamptz)
language sql stable security definer set search_path=public as $$
  select own.conversation_id,(select count(*) from public.messages m where m.conversation_id=own.conversation_id and m.sender_id<>auth.uid() and m.created_at>coalesce(own.last_read_at,'-infinity')),
    latest.body,latest.created_at,own.blocked,(select max(peer.last_read_at) from public.conversation_members peer where peer.conversation_id=own.conversation_id and peer.user_id<>auth.uid())
  from public.conversation_members own left join lateral(select body,created_at from public.messages where conversation_id=own.conversation_id order by created_at desc,id desc limit 1) latest on true
  where own.user_id=auth.uid()
$$;
revoke all on function public.care_chat_summaries() from public;
grant execute on function public.care_chat_summaries() to authenticated;

create function public.contract_event_in_chat() returns trigger language plpgsql security definer set search_path=public as $$
declare c public.contracts; conversation uuid; label text;
begin
  if new.entity_type<>'contract' or new.action not like 'contract.%' or new.actor_id is null then return new; end if;
  select * into c from public.contracts where id=new.entity_id;
  select conversation_id into conversation from public.conversation_pairs where opportunity_id=c.opportunity_id and caregiver_id=c.caregiver_id;
  if conversation is null then return new; end if;
  label:=case new.action when 'contract.created' then 'Proposta de contrato enviada' when 'contract.sign' then 'Aceite de contrato registrado' when 'contract.propose_change' then 'Alteração de contrato proposta' when 'contract.accept_change' then 'Alteração de contrato aceita' when 'contract.reject_change' then 'Alteração de contrato recusada' when 'contract.withdraw_change' then 'Proposta de alteração retirada' when 'contract.terminate' then 'Contrato encerrado antecipadamente' when 'contract.complete' then 'Contrato concluído' when 'contract.cancel' then 'Proposta cancelada' else 'Contrato atualizado' end;
  insert into public.messages(conversation_id,sender_id,body,kind) values(conversation,new.actor_id,label||'. Confira os detalhes em Meus contratos. Versão '||c.document_version||'.','system');
  return new;
end $$;
create trigger care_contract_chat_event after insert on public.audit_logs for each row execute function public.contract_event_in_chat();

-- Keep future routine work from appearing actionable after contract closure.
create function public.close_contract_tasks() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status in ('completed','cancelled') and new.status is distinct from old.status then
    update public.care_tasks set status='cancelled',notes='Contrato encerrado',recorded_at=now(),recorded_by=auth.uid() where contract_id=new.id and status='pending';
  elsif new.ends_at is distinct from old.ends_at or new.starts_at is distinct from old.starts_at then
    update public.care_tasks set status='cancelled',notes='Fora do período da nova versão contratual',recorded_at=now(),recorded_by=auth.uid() where contract_id=new.id and status='pending' and (due_at<new.starts_at or (new.ends_at is not null and due_at>new.ends_at));
  end if; return new;
end $$;
create trigger close_contract_routine after update on public.contracts for each row execute function public.close_contract_tasks();

commit;
