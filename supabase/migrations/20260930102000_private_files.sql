begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('care-files','care-files',false,5242880,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['application/pdf','image/jpeg','image/png'];
create table public.care_files (
  id uuid primary key default uuid_generate_v4(), contract_id uuid not null references public.contracts(id),
  uploaded_by uuid not null references public.profiles(id), name text not null, path text not null unique,
  mime_type text not null, size_bytes integer not null check(size_bytes between 1 and 5242880), created_at timestamptz not null default now()
);
alter table public.care_files enable row level security;
create policy "authorized parties read care files" on public.care_files for select to authenticated using(exists(select 1 from public.contracts c where c.id=contract_id and (c.client_id=auth.uid() or (c.caregiver_id=auth.uid() and c.status='active'))));
revoke insert,update,delete on public.care_files from authenticated;
grant all on public.care_files to service_role;
commit;
