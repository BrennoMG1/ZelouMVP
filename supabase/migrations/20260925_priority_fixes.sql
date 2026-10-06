begin;

-- Professional fields stay editable; verification and counters are server-owned.
drop policy if exists "caregivers manage own professional profile" on public.caregiver_profiles;
create policy "caregivers read professional profile" on public.caregiver_profiles for select to authenticated using (user_id = auth.uid());
create policy "caregivers update professional profile" on public.caregiver_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, delete on public.caregiver_profiles from authenticated;

create or replace function public.can_apply_for_care(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.caregiver_profiles cp join public.profiles p on p.id = cp.user_id
    where cp.user_id = p_user and p.role = 'caregiver' and cp.verification_status in ('under_review', 'approved'))
$$;
revoke all on function public.can_apply_for_care(uuid) from public;
grant execute on function public.can_apply_for_care(uuid) to authenticated;
drop policy if exists "caregivers create own applications" on public.applications;
create policy "caregivers create own applications" on public.applications for insert to authenticated with check (
  caregiver_id = auth.uid() and status = 'pending' and public.can_apply_for_care(auth.uid())
  and exists(select 1 from public.opportunities o where o.id = opportunity_id and o.status = 'published')
);

alter table public.contracts add column service_snapshot jsonb;
alter table public.contracts add column snapshot_legacy boolean not null default false;
alter table public.contracts add column document_version integer not null default 1;
-- Legacy contracts can only capture current data; do not claim historical accuracy.
update public.contracts c set service_snapshot = jsonb_build_object('title',o.title,'description',o.description,'care_type',o.care_type,'approximate_region',o.approximate_region,'schedule',o.schedule,'requirements',o.requirements), snapshot_legacy = true
from public.opportunities o where o.id = c.opportunity_id;
alter table public.contracts alter column service_snapshot set not null;

create function public.freeze_contract_document() returns trigger language plpgsql set search_path = public as $$
begin
  if new.service_snapshot is distinct from old.service_snapshot or new.terms is distinct from old.terms
    or new.gross_amount is distinct from old.gross_amount or new.platform_fee_rate is distinct from old.platform_fee_rate
    or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
    or new.client_id is distinct from old.client_id or new.caregiver_id is distinct from old.caregiver_id
    or new.opportunity_id is distinct from old.opportunity_id or new.document_version is distinct from old.document_version
    or new.snapshot_legacy is distinct from old.snapshot_legacy then
    raise exception 'Documento imutável. Cancele a proposta e crie outra.' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger contract_document_immutable before update on public.contracts for each row execute function public.freeze_contract_document();

create function public.propose_contract(p_opportunity uuid, p_caregiver uuid, p_amount numeric, p_start timestamptz, p_end timestamptz, p_terms jsonb)
returns public.contracts language plpgsql security definer set search_path = public as $$
declare o public.opportunities; c public.contracts;
begin
  select * into o from public.opportunities where id = p_opportunity for update;
  if auth.uid() is null or o.client_id is distinct from auth.uid() then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  if o.status <> 'published' then raise exception 'A oportunidade não está publicada.' using errcode = '22023'; end if;
  if not exists(select 1 from public.applications where opportunity_id = o.id and caregiver_id = p_caregiver and status in ('pending','shortlisted')) then
    raise exception 'Candidatura indisponível.' using errcode = '22023'; end if;
  perform 1 from public.caregiver_profiles where user_id = p_caregiver and verification_status = 'approved' for share;
  if not found then raise exception 'O cuidador precisa ter documentação aprovada.' using errcode = '42501'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 or p_start is null or (p_end is not null and p_end <= p_start)
    or p_terms is null or jsonb_typeof(p_terms) <> 'object' or length(p_terms::text) > 10000 then
    raise exception 'Dados da proposta inválidos.' using errcode = '22023'; end if;
  insert into public.contracts(opportunity_id,client_id,caregiver_id,gross_amount,starts_at,ends_at,terms,status,service_snapshot)
  values(o.id,auth.uid(),p_caregiver,p_amount,p_start,p_end,p_terms,'pending_signatures',jsonb_build_object('title',o.title,'description',o.description,'care_type',o.care_type,'approximate_region',o.approximate_region,'schedule',o.schedule,'requirements',o.requirements)) returning * into c;
  insert into public.notifications(user_id,title,body) values(p_caregiver,'Nova proposta de contrato','Confira a proposta em Meus contratos. Requisição ' || o.id::text);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'contract.created','contract',c.id);
  return c;
end $$;

create function public.transition_contract(p_contract uuid, p_action text) returns public.contracts
language plpgsql security definer set search_path = public as $$
declare c public.contracts; previous_status public.contract_status; previous_client timestamptz; previous_caregiver timestamptz;
begin
  -- All competing transitions serialize on this row.
  select * into c from public.contracts where id = p_contract for update;
  if auth.uid() is null or c.id is null or auth.uid() not in (c.client_id,c.caregiver_id) then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  previous_status := c.status; previous_client := c.client_signed_at; previous_caregiver := c.caregiver_signed_at;
  if p_action = 'sign' then
    if c.status not in ('draft','pending_signatures','active') then raise exception 'Contrato encerrado.' using errcode = '22023'; end if;
    if (auth.uid() = c.client_id and c.client_signed_at is not null) or (auth.uid() = c.caregiver_id and c.caregiver_signed_at is not null) then return c; end if;
    perform 1 from public.caregiver_profiles where user_id = c.caregiver_id and verification_status = 'approved' for share;
    if not found then raise exception 'O cuidador precisa ter documentação aprovada.' using errcode = '42501'; end if;
    if auth.uid() = c.client_id then c.client_signed_at := now(); else c.caregiver_signed_at := now(); end if;
    c.status := case when c.client_signed_at is not null and c.caregiver_signed_at is not null then 'active'::public.contract_status else 'pending_signatures'::public.contract_status end;
  elsif p_action = 'cancel' then
    if c.status = 'cancelled' then return c; end if;
    if c.status not in ('draft','pending_signatures') then raise exception 'Somente propostas pendentes podem ser canceladas.' using errcode = '22023'; end if;
    c.status := 'cancelled';
  elsif p_action = 'complete' then
    if auth.uid() <> c.client_id then raise exception 'Somente o responsável conclui o contrato.' using errcode = '42501'; end if;
    if c.status = 'completed' then return c; end if;
    if c.status <> 'active' or now() < c.starts_at then raise exception 'Contrato indisponível para conclusão.' using errcode = '22023'; end if;
    c.status := 'completed';
  else raise exception 'Ação inválida.' using errcode = '22023'; end if;
  update public.contracts set status=c.status,client_signed_at=c.client_signed_at,caregiver_signed_at=c.caregiver_signed_at,updated_at=now() where id=c.id;
  if c.status = 'active' and previous_status <> 'active' then
    update public.opportunities set status='filled' where id=c.opportunity_id;
    update public.applications set status='accepted' where opportunity_id=c.opportunity_id and caregiver_id=c.caregiver_id;
  elsif c.status = 'completed' and previous_status <> 'completed' then
    update public.opportunities set status='closed' where id=c.opportunity_id;

  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'contract.' || p_action,'contract',c.id);
  insert into public.notifications(user_id,title,body) values(case when auth.uid()=c.client_id then c.caregiver_id else c.client_id end,
    case p_action when 'sign' then 'Contrato assinado' when 'cancel' then 'Proposta cancelada' else 'Contrato concluído' end,'Confira o contrato em Meus contratos. Requisição ' || c.opportunity_id::text);
  return c;
end $$;
revoke all on function public.propose_contract(uuid,uuid,numeric,timestamptz,timestamptz,jsonb), public.transition_contract(uuid,text) from public;
grant execute on function public.propose_contract(uuid,uuid,numeric,timestamptz,timestamptz,jsonb), public.transition_contract(uuid,text) to authenticated;
commit;
