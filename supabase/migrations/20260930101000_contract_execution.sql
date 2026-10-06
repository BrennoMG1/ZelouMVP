begin;
revoke insert,update,delete on public.contracts from authenticated;

create table public.contract_versions (
  contract_id uuid not null references public.contracts(id), version integer not null,
  document jsonb not null, archived_at timestamptz not null default now(), primary key(contract_id,version)
);
alter table public.contract_versions enable row level security;
create policy "parties read document history" on public.contract_versions for select to authenticated using(exists(select 1 from public.contracts c where c.id=contract_id and auth.uid() in (c.client_id,c.caregiver_id)));
create table public.contract_changes (
  id uuid primary key default uuid_generate_v4(), contract_id uuid not null references public.contracts(id),
  proposed_by uuid not null references public.profiles(id), base_version integer not null,
  schedule jsonb not null, gross_amount numeric(10,2) not null check(gross_amount>0 and gross_amount<=1000000),
  conditions text not null check(length(conditions) between 10 and 5000),
  status text not null default 'pending' check(status in ('pending','accepted','rejected','cancelled')),
  created_at timestamptz not null default now(), resolved_at timestamptz
);
create unique index one_pending_contract_change on public.contract_changes(contract_id) where status='pending';
alter table public.contract_changes enable row level security;
create policy "parties read proposed changes" on public.contract_changes for select to authenticated using(exists(select 1 from public.contracts c where c.id=contract_id and auth.uid() in (c.client_id,c.caregiver_id)));
revoke insert,update,delete on public.contract_versions,public.contract_changes from authenticated;

-- Authenticated users cannot mutate signed documents directly. Only the
-- transaction below, owned by the migration role, may advance their version.
create or replace function public.freeze_contract_document() returns trigger language plpgsql set search_path=public as $$
begin
  if new.service_snapshot is distinct from old.service_snapshot or new.terms is distinct from old.terms
    or new.gross_amount is distinct from old.gross_amount or new.platform_fee_rate is distinct from old.platform_fee_rate
    or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
    or new.client_id is distinct from old.client_id or new.caregiver_id is distinct from old.caregiver_id
    or new.opportunity_id is distinct from old.opportunity_id or new.document_version is distinct from old.document_version
    or new.snapshot_legacy is distinct from old.snapshot_legacy then
    if current_user in ('authenticated','anon','authenticator') or new.document_version<>old.document_version+1
      or new.client_id<>old.client_id or new.caregiver_id<>old.caregiver_id or new.opportunity_id<>old.opportunity_id then
      raise exception 'Documento imutável. Proponha uma alteração para aceite das partes.' using errcode='22023';
    end if;
    insert into public.contract_versions(contract_id,version,document) values(old.id,old.document_version,to_jsonb(old));
  end if; return new;
end $$;

create or replace function public.propose_contract(p_opportunity uuid,p_caregiver uuid,p_amount numeric,p_start timestamptz,p_end timestamptz,p_terms jsonb)
returns public.contracts language plpgsql security definer set search_path=public as $$
declare o public.opportunities; c public.contracts; s jsonb; first_start timestamptz; last_end timestamptz;
begin
  select * into o from public.opportunities where id=p_opportunity for update;
  if auth.uid() is null or o.client_id is distinct from auth.uid() then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if o.status<>'published' or o.region_id is null then raise exception 'Atualize a localização da vaga antes de contratar.' using errcode='22023'; end if;
  if not exists(select 1 from public.applications where opportunity_id=o.id and caregiver_id=p_caregiver and status in ('pending','shortlisted')) then raise exception 'Candidatura indisponível.' using errcode='22023'; end if;
  perform 1 from public.caregiver_profiles where user_id=p_caregiver and verification_status='approved' for share;
  if not found then raise exception 'Documentação não aprovada.' using errcode='42501'; end if;
  s:=coalesce(p_terms->'schedule',o.schedule);
  select min(starts_at),max(ends_at) into first_start,last_end from public.care_occurrences(s);
  if first_start is null or first_start<now() or p_amount is null or p_amount<=0 or p_amount>1000000
    or coalesce(length(trim(p_terms->>'conditions')),0) not between 10 and 5000 then raise exception 'Confira a escala futura, valor e condições.' using errcode='22023'; end if;
  insert into public.contracts(opportunity_id,client_id,caregiver_id,gross_amount,starts_at,ends_at,terms,status,service_snapshot)
  values(o.id,auth.uid(),p_caregiver,p_amount,first_start,last_end,jsonb_build_object('conditions',p_terms->>'conditions'),'pending_signatures',
    jsonb_build_object('title',o.title,'description',o.description,'care_type',o.care_type,'approximate_region',o.approximate_region,'schedule',s,'requirements',o.requirements)) returning * into c;
  insert into public.notifications(user_id,title,body) values(p_caregiver,'Nova proposta de contrato','Confira os valores, escala e condições em Meus contratos.');
  insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'contract.created','contract',c.id);
  return c;
end $$;

alter function public.transition_contract(uuid,text) rename to transition_contract_original;
revoke all on function public.transition_contract_original(uuid,text) from public,authenticated;
create function public.transition_contract(p_contract uuid,p_action text) returns public.contracts language plpgsql security definer set search_path=public as $$
declare c public.contracts; old_status public.contract_status;
begin
  select * into c from public.contracts where id=p_contract for update;
  if auth.uid() is null or c.id is null or auth.uid() not in (c.client_id,c.caregiver_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  old_status:=c.status;
  if p_action='sign' and c.status in ('draft','pending_signatures') then
    if c.starts_at<now() then raise exception 'Atualize a proposta: o início já passou.' using errcode='22023'; end if;
    if exists(select 1 from public.contract_changes where contract_id=c.id and status='pending') then raise exception 'Resolva a contraproposta antes de assinar.' using errcode='22023'; end if;
    if not exists(select 1 from public.care_occurrences(c.service_snapshot->'schedule')) then raise exception 'Proponha uma escala antes de assinar.' using errcode='22023'; end if;
  end if;
  c:=public.transition_contract_original(p_contract,p_action);
  if c.status='active' and old_status<>'active' then perform public.generate_care_appointments(c.id); end if;
  if c.status in ('completed','cancelled') then
    if exists(select 1 from public.appointments where contract_id=c.id and checked_in_at is not null and checked_out_at is null and status='scheduled') then raise exception 'Encerre o plantão em andamento antes de concluir.' using errcode='22023'; end if;
    update public.appointments set status='cancelled',reason='Contrato encerrado' where contract_id=c.id and status='scheduled';
    update public.contract_changes set status='cancelled',resolved_at=now() where contract_id=c.id and status='pending';
  end if;
  return c;
end $$;
revoke all on function public.transition_contract(uuid,text) from public;
grant execute on function public.transition_contract(uuid,text) to authenticated;

create function public.change_care_contract(p_contract uuid,p_data jsonb) returns public.contracts language plpgsql security definer set search_path=public as $$
declare c public.contracts; change public.contract_changes; act text:=p_data->>'action'; first_start timestamptz; last_end timestamptz;
begin
  select * into c from public.contracts where id=p_contract for update;
  if auth.uid() is null or c.id is null or auth.uid() not in (c.client_id,c.caregiver_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if c.status not in ('pending_signatures','active') then raise exception 'Contrato encerrado.' using errcode='22023'; end if;
  if act='terminate' then
    if length(trim(coalesce(p_data->>'reason','')))<10 then raise exception 'Explique o motivo do encerramento.' using errcode='22023'; end if;
    if exists(select 1 from public.appointments where contract_id=c.id and status='scheduled' and checked_in_at is not null) then raise exception 'Encerre o plantão em andamento primeiro.' using errcode='22023'; end if;
    update public.appointments set status='cancelled',reason='Encerramento antecipado: '||(p_data->>'reason') where contract_id=c.id and status='scheduled';
    update public.contracts set status='cancelled' where id=c.id returning * into c;
    update public.contract_changes set status='cancelled',resolved_at=now() where contract_id=c.id and status='pending';
    update public.opportunities set status='closed' where id=c.opportunity_id;
  elsif act='propose_change' then
    select min(starts_at),max(ends_at) into first_start,last_end from public.care_occurrences(p_data->'schedule');
    if first_start is null or first_start<now() then raise exception 'A nova escala deve começar no futuro.' using errcode='22023'; end if;
    insert into public.contract_changes(contract_id,proposed_by,base_version,schedule,gross_amount,conditions)
    values(c.id,auth.uid(),c.document_version,p_data->'schedule',(p_data->>'grossAmount')::numeric,p_data->>'conditions');
  elsif act in ('accept_change','reject_change','withdraw_change') then
    select * into change from public.contract_changes where contract_id=c.id and id=(p_data->>'changeId')::uuid and status='pending' for update;
    if not found or change.base_version<>c.document_version then raise exception 'Proposta desatualizada.' using errcode='22023'; end if;
    if (act='withdraw_change' and change.proposed_by<>auth.uid()) or (act<>'withdraw_change' and change.proposed_by=auth.uid()) then raise exception 'A outra parte deve responder à proposta.' using errcode='42501'; end if;
    if act='accept_change' then
      select min(starts_at),max(ends_at) into first_start,last_end from public.care_occurrences(change.schedule);
      if first_start<now() then raise exception 'A proposta precisa de novas datas.' using errcode='22023'; end if;
      if exists(select 1 from public.appointments where contract_id=c.id and status='scheduled' and checked_in_at is not null) then raise exception 'Plantão em andamento.' using errcode='22023'; end if;
      update public.appointments set status='cancelled',reason='Substituído pela escala da nova versão' where contract_id=c.id and status='scheduled' and starts_at>=now();
      update public.contracts set service_snapshot=jsonb_set(service_snapshot,'{schedule}',change.schedule),terms=jsonb_build_object('conditions',change.conditions),gross_amount=change.gross_amount,
        starts_at=case when c.status='active' then least(c.starts_at,first_start) else first_start end,ends_at=last_end,document_version=document_version+1,
        client_signed_at=case when c.status='active' then now() else null end,caregiver_signed_at=case when c.status='active' then now() else null end
        where id=c.id returning * into c;
      if c.status='active' then perform public.generate_care_appointments(c.id); end if;
    end if;
    update public.contract_changes set status=case act when 'accept_change' then 'accepted' when 'reject_change' then 'rejected' else 'cancelled' end,resolved_at=now() where id=change.id;
  else raise exception 'Ação inválida.' using errcode='22023'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'contract.'||act,'contract',c.id,jsonb_build_object('reason',p_data->>'reason','version',c.document_version,'changeId',change.id));
  insert into public.notifications(user_id,title,body) values(case when auth.uid()=c.client_id then c.caregiver_id else c.client_id end,'Contrato atualizado','Confira a proposta ou encerramento em Meus contratos.');
  return c;
end $$;
revoke all on function public.change_care_contract(uuid,jsonb) from public;
grant execute on function public.change_care_contract(uuid,jsonb) to authenticated;

-- Private operational information is never part of a public vacancy or chat.
create table public.contract_care_details (
  contract_id uuid primary key references public.contracts(id), address text not null default '' check(length(address)<=1000),
  care_notes text not null default '' check(length(care_notes)<=5000), emergency_contact text not null default '' check(length(emergency_contact)<=500),
  consented_by uuid not null default auth.uid() references public.profiles(id), consented_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.contract_care_details enable row level security;
create policy "authorized parties read care details" on public.contract_care_details for select to authenticated using(exists(select 1 from public.contracts c where c.id=contract_id and (c.client_id=auth.uid() or (c.caregiver_id=auth.uid() and c.status='active'))));
create policy "responsible writes care details" on public.contract_care_details for insert to authenticated with check(exists(select 1 from public.contracts c where c.id=contract_id and c.client_id=auth.uid() and c.status in ('pending_signatures','active')));
create policy "responsible updates care details" on public.contract_care_details for update to authenticated using(exists(select 1 from public.contracts c where c.id=contract_id and c.client_id=auth.uid() and c.status in ('pending_signatures','active'))) with check(exists(select 1 from public.contracts c where c.id=contract_id and c.client_id=auth.uid() and c.status in ('pending_signatures','active')));

commit;
