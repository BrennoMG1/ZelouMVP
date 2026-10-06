-- Apply after 20260922_security_hardening.sql.

create table if not exists public.appointments (
  id uuid primary key default uuid_generate_v4(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  title text not null check (char_length(title) between 3 and 160),
  description text check (char_length(description) <= 3000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

alter table public.appointments enable row level security;

create index if not exists opportunities_client_created_idx on public.opportunities (client_id, created_at desc);
create index if not exists applications_caregiver_created_idx on public.applications (caregiver_id, created_at desc);
create index if not exists applications_opportunity_idx on public.applications (opportunity_id);
create index if not exists contracts_client_idx on public.contracts (client_id, created_at desc);
create index if not exists contracts_caregiver_idx on public.contracts (caregiver_id, created_at desc);
create unique index if not exists one_open_contract_per_opportunity_idx on public.contracts (opportunity_id)
  where status in ('draft', 'pending_signatures', 'active');
create index if not exists messages_conversation_created_idx on public.messages (conversation_id, created_at);
create index if not exists reports_contract_created_idx on public.reports (contract_id, created_at desc);
create index if not exists appointments_contract_starts_idx on public.appointments (contract_id, starts_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.assert_opportunity_elderly_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.elderly_id is not null and not exists (
    select 1 from public.elderly_profiles where id = new.elderly_id and client_id = new.client_id
  ) then
    raise exception 'elderly profile must belong to opportunity client';
  end if;
  return new;
end;
$$;

create or replace function public.current_profile_role()
returns public.user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.protect_caregiver_managed_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and (
    new.verification_status is distinct from old.verification_status
    or new.verified_at is distinct from old.verified_at
    or new.rating is distinct from old.rating
    or new.completed_contracts is distinct from old.completed_contracts
  ) then
    raise exception 'managed caregiver fields cannot be changed by the user';
  end if;
  return new;
end;
$$;

create or replace function public.assert_contract_parties()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.opportunities where id = new.opportunity_id and client_id = new.client_id) then
    raise exception 'contract client must own the opportunity';
  end if;
  if not exists (select 1 from public.profiles where id = new.caregiver_id and role = 'caregiver') then
    raise exception 'contract caregiver must have caregiver role';
  end if;
  return new;
end;
$$;

drop trigger if exists opportunities_elderly_owner on public.opportunities;
create trigger opportunities_elderly_owner before insert or update on public.opportunities
  for each row execute function public.assert_opportunity_elderly_owner();
drop trigger if exists contracts_parties_valid on public.contracts;
create trigger contracts_parties_valid before insert or update on public.contracts
  for each row execute function public.assert_contract_parties();
drop trigger if exists appointments_updated_at on public.appointments;
create trigger appointments_updated_at before update on public.appointments
  for each row execute function public.set_updated_at();
drop trigger if exists caregiver_managed_fields_protected on public.caregiver_profiles;
create trigger caregiver_managed_fields_protected before update on public.caregiver_profiles
  for each row execute function public.protect_caregiver_managed_fields();

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own non-role profile" on public.profiles
  for update to authenticated using (auth.uid() = id)
  with check (auth.uid() = id and role = public.current_profile_role());

drop policy if exists "clients manage own opportunities" on public.opportunities;
create policy "clients manage own opportunities" on public.opportunities
  for all to authenticated using (client_id = auth.uid()) with check (client_id = auth.uid());

drop policy if exists "caregivers manage own applications" on public.applications;
create policy "caregivers read own applications" on public.applications
  for select to authenticated using (caregiver_id = auth.uid());
create policy "caregivers create own applications" on public.applications
  for insert to authenticated with check (caregiver_id = auth.uid());
create policy "caregivers withdraw own applications" on public.applications
  for delete to authenticated using (caregiver_id = auth.uid());

create policy "contract parties read appointments" on public.appointments
  for select to authenticated using (exists (
    select 1 from public.contracts c where c.id = appointments.contract_id
      and (c.client_id = auth.uid() or c.caregiver_id = auth.uid())
  ));
create policy "contract parties create appointments" on public.appointments
  for insert to authenticated with check (created_by = auth.uid() and exists (
    select 1 from public.contracts c where c.id = appointments.contract_id
      and (c.client_id = auth.uid() or c.caregiver_id = auth.uid())
  ));
create policy "appointment creator updates appointments" on public.appointments
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "appointment creator deletes appointments" on public.appointments
  for delete to authenticated using (created_by = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
