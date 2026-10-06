-- Run after the 20260922 migrations.
begin;
create table public.contract_medications (
  id uuid primary key default uuid_generate_v4(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  dosage text not null check (char_length(dosage) between 1 and 160),
  instructions text not null default '' check (char_length(instructions) <= 3000),
  interval_hours integer not null check (interval_hours between 1 and 720),
  next_due_at timestamptz not null,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= next_due_at)
);
create table public.medication_administrations (
  id uuid primary key default uuid_generate_v4(),
  medication_id uuid not null references public.contract_medications(id) on delete cascade,
  scheduled_at timestamptz not null,
  administered_at timestamptz not null,
  author_id uuid not null references public.profiles(id),
  outcome text not null check (outcome in ('given', 'skipped')),
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  unique (medication_id, scheduled_at)
);
create index on public.contract_medications(contract_id);
create index on public.medication_administrations(medication_id, scheduled_at desc);
alter table public.contract_medications enable row level security;
alter table public.medication_administrations enable row level security;
create policy "parties read medication plans" on public.contract_medications for select to authenticated using (
  exists(select 1 from public.contracts c where c.id = contract_id and auth.uid() in (c.client_id, c.caregiver_id))
);
create policy "client creates medication plans" on public.contract_medications for insert to authenticated with check (
  active and exists(select 1 from public.contracts c where c.id = contract_id and c.client_id = auth.uid() and c.status in ('draft', 'pending_signatures', 'active'))
);
create policy "parties read administrations" on public.medication_administrations for select to authenticated using (
  exists(select 1 from public.contract_medications m where m.id = medication_id)
);
revoke all on public.contract_medications, public.medication_administrations from anon, authenticated;
grant select, insert on public.contract_medications to authenticated;
grant select on public.medication_administrations to authenticated;

-- Lock the plan so retries or two open tabs cannot record the same dose twice.
create function public.record_medication_dose(p_medication_id uuid, p_scheduled_at timestamptz, p_administered_at timestamptz, p_outcome text, p_notes text)
returns void language plpgsql security definer set search_path = public as $$
declare m public.contract_medications; c public.contracts; next_time timestamptz;
begin
  select * into m from public.contract_medications where id = p_medication_id for update;
  select * into c from public.contracts where id = m.contract_id for share;
  if auth.uid() is null or c.caregiver_id is distinct from auth.uid() or c.status <> 'active' or not m.active or m.id is null
    or now() < c.starts_at or (c.ends_at is not null and now() > c.ends_at) then
    raise exception 'Medication access denied' using errcode = '42501';
  end if;
  if p_scheduled_at is distinct from m.next_due_at or m.next_due_at > now()
    or p_administered_at is null or p_administered_at > now() or p_administered_at < m.next_due_at
    or p_outcome is null or p_outcome not in ('given', 'skipped')
    or (p_outcome = 'skipped' and length(trim(coalesce(p_notes, ''))) = 0) then
    raise exception 'Invalid or already recorded dose' using errcode = '22023';
  end if;
  insert into public.medication_administrations(medication_id, scheduled_at, administered_at, author_id, outcome, notes)
    values(m.id, m.next_due_at, p_administered_at, auth.uid(), p_outcome, coalesce(p_notes, ''));
  next_time := m.next_due_at + make_interval(hours => m.interval_hours);
  update public.contract_medications set active = (ends_at is null or next_time <= ends_at),
    next_due_at = case when ends_at is not null and next_time > ends_at then next_due_at else next_time end where id = m.id;
end $$;
create function public.stop_contract_medication(p_medication_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.contract_medications m set active = false where m.id = p_medication_id and exists (
    select 1 from public.contracts c where c.id = m.contract_id and c.client_id = auth.uid()
  );
  if not found then raise exception 'Medication access denied' using errcode = '42501'; end if;
end $$;
revoke all on function public.record_medication_dose(uuid,timestamptz,timestamptz,text,text), public.stop_contract_medication(uuid) from public;
grant execute on function public.record_medication_dose(uuid,timestamptz,timestamptz,text,text), public.stop_contract_medication(uuid) to authenticated;
commit;
