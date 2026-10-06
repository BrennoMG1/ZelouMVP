begin;

-- Regions are populated only by the server after consulting IBGE/ViaCEP.
create table public.verified_regions (
  id uuid primary key default uuid_generate_v4(),
  municipality_id text not null check (municipality_id ~ '^\d{7}$'),
  city text not null, state text not null check (state in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  district text not null default '', label text not null,
  unique(municipality_id,district)
);
alter table public.verified_regions enable row level security;
create policy "authenticated read verified regions" on public.verified_regions for select to authenticated using (true);
grant select on public.verified_regions to authenticated;
revoke insert, update, delete on public.verified_regions from authenticated, anon;
grant all on public.verified_regions to service_role;
alter table public.opportunities add column region_id uuid references public.verified_regions(id);
alter table public.profiles add column region_id uuid references public.verified_regions(id);
-- Preserve legacy content for its owner, but require geographic validation
-- and a structured schedule before a vacancy becomes discoverable again.
update public.opportunities set status='paused' where status='published' and region_id is null;

create function public.care_occurrences(s jsonb) returns table(starts_at timestamptz, ends_at timestamptz)
language plpgsql stable set search_path = public as $$
declare first_day date; last_day date; start_time time; end_time time; zone text; day date; weekdays jsonb;
begin
  if s is null or jsonb_typeof(s) <> 'object' or coalesce(s->>'kind','') not in ('once','weekly')
    or coalesce(s->>'startDate','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(s->>'endDate','') !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(s->>'startTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(s->>'endTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or coalesce(s->>'timezone','') not in ('America/Sao_Paulo','America/Manaus','America/Rio_Branco','America/Noronha')
    or jsonb_typeof(s->'days') is distinct from 'array' then raise exception 'Escala inválida.' using errcode='22023'; end if;
  first_day := (s->>'startDate')::date; last_day := (s->>'endDate')::date;
  start_time := (s->>'startTime')::time; end_time := (s->>'endTime')::time; zone := s->>'timezone'; weekdays := s->'days';
  if last_day < first_day or last_day-first_day > 365 or start_time=end_time
    or (s->>'kind'='once' and last_day<>first_day) or jsonb_array_length(weekdays) not between 1 and 7
    or exists(select 1 from jsonb_array_elements(weekdays) v where v::text !~ '^[0-6]$')
    or (select count(distinct v) from jsonb_array_elements(weekdays) v) <> jsonb_array_length(weekdays)
    then raise exception 'Período ou dias da escala inválidos.' using errcode='22023'; end if;
  day := first_day;
  while day <= last_day loop
    if s->>'kind'='once' or weekdays @> to_jsonb(array[extract(dow from day)::integer]) then
      starts_at := (day+start_time) at time zone zone;
      ends_at := (day+end_time+case when end_time < start_time then interval '1 day' else interval '0' end) at time zone zone;
      return next;
    end if;
    day := day+1;
  end loop;
end $$;

create function public.save_care_opportunity(p_id uuid, p_data jsonb) returns public.opportunities
language plpgsql security definer set search_path=public as $$
declare o public.opportunities; r public.verified_regions;
begin
  if auth.uid() is null or public.current_profile_role()<>'client' then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_id is not null then
    select * into o from public.opportunities where id=p_id and client_id=auth.uid() for update;
    if not found then raise exception 'Acesso negado.' using errcode='42501'; end if;
    if o.status in ('filled','closed') or exists(select 1 from public.contracts where opportunity_id=p_id and status in ('draft','pending_signatures','active')) then raise exception 'A vaga possui contrato ou está encerrada.' using errcode='22023'; end if;
    if p_data ? 'status' then
      if p_data->>'status' not in ('published','paused','closed') then raise exception 'Estado inválido.' using errcode='22023'; end if;
      if p_data->>'status'='published' and o.region_id is null then raise exception 'Edite e valide a região antes de republicar.' using errcode='22023'; end if;
      update public.opportunities set status=(p_data->>'status')::public.opportunity_status where id=p_id returning * into o; return o;
    end if;
  end if;
  select * into r from public.verified_regions where id=(p_data->>'regionId')::uuid;
  if not found then raise exception 'Selecione uma região validada.' using errcode='22023'; end if;
  if coalesce(length(trim(p_data->>'title')),0) not between 5 and 120 or coalesce(length(trim(p_data->>'description')),0) not between 10 and 5000
    or coalesce(length(trim(p_data->>'careType')),0) not between 2 and 80 or coalesce((p_data->>'hourlyRate')::numeric,0) not between 0.01 and 10000
    or length(coalesce(p_data->>'requirements',''))>3000 then raise exception 'Dados da vaga inválidos.' using errcode='22023'; end if;
  if not exists(select 1 from public.care_occurrences(p_data->'schedule')) then raise exception 'Escala sem plantões.' using errcode='22023'; end if;
  if p_id is null then
    insert into public.opportunities(client_id,elderly_id,title,description,care_type,region_id,approximate_region,schedule,requirements,hourly_rate,status)
    values(auth.uid(),(p_data->>'elderlyId')::uuid,trim(p_data->>'title'),trim(p_data->>'description'),trim(p_data->>'careType'),r.id,r.label,p_data->'schedule',p_data->>'requirements',(p_data->>'hourlyRate')::numeric,'published') returning * into o;
  else
    update public.opportunities set title=trim(p_data->>'title'),description=trim(p_data->>'description'),care_type=trim(p_data->>'careType'),region_id=r.id,approximate_region=r.label,schedule=p_data->'schedule',requirements=p_data->>'requirements',hourly_rate=(p_data->>'hourlyRate')::numeric where id=p_id returning * into o;
  end if;
  return o;
end $$;
revoke insert,update,delete on public.opportunities from authenticated;
revoke all on function public.save_care_opportunity(uuid,jsonb) from public;
grant execute on function public.save_care_opportunity(uuid,jsonb) to authenticated;

create function public.validate_profile_region() returns trigger language plpgsql set search_path=public as $$
declare r public.verified_regions;
begin
  if new.region_id is distinct from old.region_id or new.city is distinct from old.city or new.state is distinct from old.state then
    select * into r from public.verified_regions where id=new.region_id;
    if not found then raise exception 'Selecione um município validado.' using errcode='22023'; end if;
    new.city:=r.city; new.state:=r.state;
  end if; return new;
end $$;
create trigger profile_region_valid before update on public.profiles for each row execute function public.validate_profile_region();

-- Scheduling and attendance. All writes are mediated by transactions below.
alter table public.appointments add column status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled','missed'));
alter table public.appointments add column checked_in_at timestamptz;
alter table public.appointments add column checked_out_at timestamptz;
alter table public.appointments add column reason text;
alter table public.appointments add column generated boolean not null default false;
update public.appointments set status='completed' where completed_at is not null;
revoke insert,update,delete on public.appointments from authenticated;

create function public.check_care_appointment() returns trigger language plpgsql security definer set search_path=public as $$
declare c public.contracts;
begin
  select * into c from public.contracts where id=new.contract_id;
  -- Lock the professional, not just the contract, to serialize competing bookings.
  perform 1 from public.profiles where id=c.caregiver_id for update;
  if new.status in ('scheduled','completed') then
    if c.status<>'active' or new.starts_at<c.starts_at or (c.ends_at is not null and new.ends_at>c.ends_at) then raise exception 'Compromisso fora do período de um contrato ativo.' using errcode='22023'; end if;
    if exists(select 1 from public.appointments a join public.contracts other on other.id=a.contract_id
      where other.caregiver_id=c.caregiver_id and a.id<>new.id and a.status in ('scheduled','completed')
      and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(new.starts_at,new.ends_at,'[)')) then raise exception 'O cuidador já possui atendimento neste horário.' using errcode='22023'; end if;
  end if;
  return new;
end $$;
create trigger appointment_bounds before insert or update on public.appointments for each row execute function public.check_care_appointment();

create function public.generate_care_appointments(p_contract uuid) returns void language plpgsql security definer set search_path=public as $$
declare c public.contracts;
begin
  select * into c from public.contracts where id=p_contract;
  insert into public.appointments(contract_id,created_by,title,starts_at,ends_at,generated)
  select c.id,c.client_id,coalesce(c.service_snapshot->>'title','Plantão'),s.starts_at,s.ends_at,true from public.care_occurrences(c.service_snapshot->'schedule') s
  where s.starts_at>=c.starts_at and (c.ends_at is null or s.ends_at<=c.ends_at)
  and not exists(select 1 from public.appointments a where a.contract_id=c.id and a.starts_at=s.starts_at and a.status<>'cancelled');
end $$;
revoke all on function public.generate_care_appointments(uuid) from public;

create function public.manage_care_appointment(p_id uuid, p_data jsonb) returns public.appointments language plpgsql security definer set search_path=public as $$
declare a public.appointments; c public.contracts; act text := p_data->>'action';
begin
  if p_id is not null then select * into a from public.appointments where id=p_id; end if;
  select * into c from public.contracts where id=coalesce(a.contract_id,(p_data->>'contractId')::uuid) for update;
  if p_id is not null then select * into a from public.appointments where id=p_id for update; end if;
  if auth.uid() is null or c.id is null or auth.uid() not in (c.client_id,c.caregiver_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if c.status<>'active' then raise exception 'Contrato inativo.' using errcode='22023'; end if;
  if p_id is null then
    insert into public.appointments(contract_id,created_by,title,description,starts_at,ends_at) values(c.id,auth.uid(),p_data->>'title',p_data->>'description',(p_data->>'startsAt')::timestamptz,(p_data->>'endsAt')::timestamptz) returning * into a;
  else
    if a.id is null or a.status<>'scheduled' then raise exception 'Compromisso indisponível.' using errcode='22023'; end if;
    if act='reschedule' then
      if a.checked_in_at is not null or length(trim(coalesce(p_data->>'reason','')))<3 then raise exception 'Informe o motivo; plantão iniciado não pode ser reagendado.' using errcode='22023'; end if;
      update public.appointments set starts_at=(p_data->>'startsAt')::timestamptz,ends_at=(p_data->>'endsAt')::timestamptz,reason=p_data->>'reason' where id=p_id returning * into a;
    elsif act in ('cancel','missed') then
      if length(trim(coalesce(p_data->>'reason','')))<3 or a.checked_in_at is not null or (act='missed' and now()<a.ends_at) then raise exception 'Justifique a alteração e confira o horário do plantão.' using errcode='22023'; end if;
      update public.appointments set status=case act when 'cancel' then 'cancelled' else 'missed' end,reason=p_data->>'reason' where id=p_id returning * into a;
    elsif act='checkin' then
      if auth.uid()<>c.caregiver_id or a.checked_in_at is not null or now()<a.starts_at-interval '30 minutes' or now()>a.ends_at then raise exception 'Entrada indisponível para este usuário ou horário.' using errcode='22023'; end if;
      update public.appointments set checked_in_at=now() where id=p_id returning * into a;
    elsif act='checkout' then
      if auth.uid()<>c.caregiver_id or a.checked_in_at is null then raise exception 'Registre a entrada primeiro.' using errcode='22023'; end if;
      update public.appointments set checked_out_at=now(),completed_at=now(),status='completed' where id=p_id returning * into a;
    else raise exception 'Ação inválida.' using errcode='22023'; end if;
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'appointment.'||coalesce(act,'create'),'appointment',a.id,jsonb_build_object('starts_at',a.starts_at,'ends_at',a.ends_at,'reason',a.reason));
  insert into public.notifications(user_id,title,body) values(case when auth.uid()=c.client_id then c.caregiver_id else c.client_id end,'Agenda atualizada','Confira o plantão na agenda.');
  return a;
end $$;
revoke all on function public.manage_care_appointment(uuid,jsonb) from public;
grant execute on function public.manage_care_appointment(uuid,jsonb) to authenticated;

create function public.manage_care_application(p_id uuid,p_status text) returns void language plpgsql security definer set search_path=public as $$
declare a public.applications; owner_id uuid;
begin
  select * into a from public.applications where id=p_id for update;
  select client_id into owner_id from public.opportunities where id=a.opportunity_id;
  if auth.uid() is null or a.id is null or not ((auth.uid()=a.caregiver_id and p_status='withdrawn') or (auth.uid()=owner_id and p_status in ('shortlisted','rejected'))) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if a.status not in ('pending','shortlisted') or exists(select 1 from public.contracts where opportunity_id=a.opportunity_id and caregiver_id=a.caregiver_id and status in ('pending_signatures','active')) then raise exception 'Candidatura vinculada a contrato ou encerrada.' using errcode='22023'; end if;
  update public.applications set status=p_status::public.application_status where id=p_id;
end $$;
revoke delete,update on public.applications from authenticated;
revoke all on function public.manage_care_application(uuid,text) from public;
grant execute on function public.manage_care_application(uuid,text) to authenticated;

commit;
