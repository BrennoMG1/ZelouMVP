begin;
alter table public.appointments add column replacement_requested_at timestamptz;
alter table public.appointments add column replacement_reason text;
alter table public.opportunities add column replaces_appointment_id uuid references public.appointments(id);
create unique index one_open_replacement on public.opportunities(replaces_appointment_id) where replaces_appointment_id is not null and status in ('draft','published','paused','filled');
create function public.request_care_replacement(p_appointment uuid,p_reason text,p_publish boolean default false) returns uuid language plpgsql security definer set search_path=public as $$
declare a public.appointments; c public.contracts; o public.opportunities; replacement uuid; s jsonb; zone text;
begin
  select * into a from public.appointments where id=p_appointment;
  select * into c from public.contracts where id=a.contract_id for update;
  select * into a from public.appointments where id=p_appointment for update;
  if auth.uid() is null or c.id is null or auth.uid() not in (c.client_id,c.caregiver_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if c.status<>'active' or a.status<>'scheduled' or a.checked_in_at is not null or a.starts_at<=now() or length(trim(coalesce(p_reason,''))) not between 10 and 3000 then raise exception 'Informe o motivo e selecione um plantão futuro não iniciado.' using errcode='22023'; end if;
  if p_publish then
    if auth.uid()<>c.client_id then raise exception 'Somente o responsável publica a substituição.' using errcode='42501'; end if;
    select * into o from public.opportunities where id=c.opportunity_id;
    if o.region_id is null or a.ends_at-a.starts_at>=interval '24 hours' then raise exception 'A substituição exige região validada e plantão com menos de 24 horas.' using errcode='22023'; end if;
    zone:=coalesce(c.service_snapshot->'schedule'->>'timezone','America/Sao_Paulo');
    s:=jsonb_build_object('kind','once','startDate',to_char(a.starts_at at time zone zone,'YYYY-MM-DD'),'endDate',to_char(a.starts_at at time zone zone,'YYYY-MM-DD'),'days',jsonb_build_array(extract(dow from a.starts_at at time zone zone)::integer),'startTime',to_char(a.starts_at at time zone zone,'HH24:MI'),'endTime',to_char(a.ends_at at time zone zone,'HH24:MI'),'timezone',zone);
    insert into public.opportunities(client_id,title,description,care_type,region_id,approximate_region,schedule,requirements,hourly_rate,status,replaces_appointment_id)
      values(c.client_id,left('Substituição: '||o.title,120),o.description,o.care_type,o.region_id,o.approximate_region,s,o.requirements,o.hourly_rate,'published',a.id) returning id into replacement;
  end if;
  update public.appointments set replacement_requested_at=now(),replacement_reason=p_reason where id=a.id;
  insert into public.notifications(user_id,title,body) values(case when auth.uid()=c.client_id then c.caregiver_id else c.client_id end,'Substituição de plantão solicitada','Confira a agenda. O plantão original permanece agendado até a assinatura do contrato de substituição.');
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'appointment.replacement','appointment',a.id,jsonb_build_object('reason',p_reason,'opportunity_id',replacement));
  return replacement;
end $$;
revoke all on function public.request_care_replacement(uuid,text,boolean) from public;
grant execute on function public.request_care_replacement(uuid,text,boolean) to authenticated;

alter function public.transition_contract(uuid,text) rename to transition_contract_planned;
revoke all on function public.transition_contract_planned(uuid,text) from public,authenticated;
create function public.transition_contract(p_contract uuid,p_action text) returns public.contracts language plpgsql security definer set search_path=public as $$
declare c public.contracts; a public.appointments; original public.contracts; replacement_id uuid; previous_status public.contract_status;
begin
  select * into c from public.contracts where id=p_contract;
  if auth.uid() is null or c.id is null or auth.uid() not in (c.client_id,c.caregiver_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  select replaces_appointment_id into replacement_id from public.opportunities where id=c.opportunity_id;
  if replacement_id is not null and p_action='sign' and c.status='pending_signatures' then
    select * into a from public.appointments where id=replacement_id;
    select * into original from public.contracts where id=a.contract_id for update;
    select * into a from public.appointments where id=replacement_id for update;
    if original.status<>'active' or a.status<>'scheduled' or a.checked_in_at is not null or a.starts_at<=now() or original.caregiver_id=c.caregiver_id or c.starts_at<>a.starts_at or c.ends_at<>a.ends_at then raise exception 'O plantão original mudou ou o cuidador é o mesmo. Revise a substituição.' using errcode='22023'; end if;
  end if;
  select status into previous_status from public.contracts where id=p_contract for update;
  c:=public.transition_contract_planned(p_contract,p_action);
  if replacement_id is not null and c.status='active' and previous_status<>'active' then
    update public.appointments set status='cancelled',reason='Substituição confirmada no contrato '||c.id where id=replacement_id;
    insert into public.notifications(user_id,title,body) values(original.caregiver_id,'Substituição confirmada','O plantão foi transferido a outro contrato. Confira a agenda e combine eventuais ajustes de valores com o responsável.');
  end if;
  return c;
end $$;
revoke all on function public.transition_contract(uuid,text) from public;
grant execute on function public.transition_contract(uuid,text) to authenticated;
commit;
