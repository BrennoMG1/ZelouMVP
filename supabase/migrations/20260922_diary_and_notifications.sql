create table if not exists public.care_diary_entries (
  id uuid primary key default uuid_generate_v4(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 3000),
  created_at timestamptz not null default now()
);

create index if not exists care_diary_entries_contract_created_idx on public.care_diary_entries(contract_id, created_at desc);
alter table public.care_diary_entries enable row level security;

create policy "contract parties read diary entries" on public.care_diary_entries
  for select to authenticated using (
    exists (select 1 from public.contracts c where c.id = contract_id and (c.client_id = auth.uid() or c.caregiver_id = auth.uid()))
  );

create policy "contract parties create diary entries" on public.care_diary_entries
  for insert to authenticated with check (
    author_id = auth.uid() and exists (select 1 from public.contracts c where c.id = contract_id and c.status = 'active' and (c.client_id = auth.uid() or c.caregiver_id = auth.uid()))
  );
