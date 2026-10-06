create extension if not exists "uuid-ossp";

create type public.user_role as enum ('client', 'caregiver', 'admin', 'super_admin');
create type public.verification_status as enum ('not_submitted', 'under_review', 'approved', 'rejected', 'needs_correction');
create type public.opportunity_status as enum ('draft', 'published', 'paused', 'filled', 'closed');
create type public.application_status as enum ('pending', 'shortlisted', 'accepted', 'rejected', 'withdrawn');
create type public.contract_status as enum ('draft', 'pending_signatures', 'active', 'completed', 'cancelled');
create type public.payment_status as enum ('pending', 'processing', 'paid', 'failed', 'refunded');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'client',
  full_name text not null,
  phone text,
  avatar_url text,
  city text,
  state text,
  accessible_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.caregiver_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  bio text,
  experience_years integer default 0,
  specialties text[] not null default '{}',
  availability jsonb not null default '{}',
  hourly_rate numeric(10,2),
  service_modes text[] not null default '{}',
  verification_status public.verification_status not null default 'not_submitted',
  verified_at timestamptz,
  rating numeric(2,1) default 0,
  completed_contracts integer not null default 0
);

create table public.elderly_profiles (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  display_name text not null,
  age_range text,
  care_needs text,
  routine_notes text,
  consent_sensitive_data boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default uuid_generate_v4(),
  caregiver_id uuid not null references public.profiles(id) on delete cascade,
  document_type text not null,
  storage_path text not null,
  status public.verification_status not null default 'not_submitted',
  reviewer_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.opportunities (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  elderly_id uuid references public.elderly_profiles(id) on delete set null,
  title text not null,
  description text not null,
  care_type text not null,
  approximate_region text not null,
  exact_address_encrypted text,
  schedule jsonb not null default '{}',
  requirements text,
  hourly_rate numeric(10,2) not null,
  estimated_monthly numeric(10,2),
  status public.opportunity_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.applications (
  id uuid primary key default uuid_generate_v4(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  caregiver_id uuid not null references public.profiles(id) on delete cascade,
  message text,
  status public.application_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique(opportunity_id, caregiver_id)
);

create table public.contracts (
  id uuid primary key default uuid_generate_v4(),
  opportunity_id uuid not null references public.opportunities(id),
  client_id uuid not null references public.profiles(id),
  caregiver_id uuid not null references public.profiles(id),
  gross_amount numeric(10,2) not null,
  platform_fee_rate numeric(5,4) not null default 0.10,
  platform_fee numeric(10,2) generated always as (gross_amount * platform_fee_rate) stored,
  caregiver_net_amount numeric(10,2) generated always as (gross_amount - (gross_amount * platform_fee_rate)) stored,
  starts_at timestamptz not null,
  ends_at timestamptz,
  terms jsonb not null default '{}',
  status public.contract_status not null default 'draft',
  client_signed_at timestamptz,
  caregiver_signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default uuid_generate_v4(),
  opportunity_id uuid references public.opportunities(id),
  created_at timestamptz not null default now()
);
create table public.conversation_members (
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  primary key (conversation_id, user_id)
);
create table public.messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null,
  attachment_path text,
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default uuid_generate_v4(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  week_start date not null,
  report_type text not null check (report_type in ('caregiver', 'client')),
  content jsonb not null default '{}',
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table public.consents (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  consent_type text not null,
  version text not null,
  granted boolean not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create table public.privacy_requests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null check (request_type in ('export', 'correction', 'deletion', 'consent_revocation')),
  status text not null default 'requested' check (status in ('requested', 'in_progress', 'completed', 'rejected')),
  details text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.profiles enable row level security;
alter table public.caregiver_profiles enable row level security;
alter table public.elderly_profiles enable row level security;
alter table public.documents enable row level security;
alter table public.opportunities enable row level security;
alter table public.applications enable row level security;
alter table public.contracts enable row level security;
alter table public.messages enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.consents enable row level security;
alter table public.privacy_requests enable row level security;

create policy "profiles are visible to signed in users" on public.profiles for select to authenticated using (true);
create policy "users edit own profile" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "caregivers discover published opportunities" on public.opportunities for select to authenticated using (client_id = auth.uid() or (status = 'published' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'caregiver')));
create policy "clients manage own opportunities" on public.opportunities for all to authenticated using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy "caregivers manage own applications" on public.applications for all to authenticated using (caregiver_id = auth.uid()) with check (caregiver_id = auth.uid());
create policy "contract parties can view contracts" on public.contracts for select to authenticated using (client_id = auth.uid() or caregiver_id = auth.uid());
create policy "conversation members can read messages" on public.messages for select to authenticated using (exists (select 1 from public.conversation_members m where m.conversation_id = messages.conversation_id and m.user_id = auth.uid()));
create policy "conversation members can send messages" on public.messages for insert to authenticated with check (sender_id = auth.uid() and exists (select 1 from public.conversation_members m where m.conversation_id = messages.conversation_id and m.user_id = auth.uid()));
create policy "members can read conversations" on public.conversations for select to authenticated using (exists (select 1 from public.conversation_members m where m.conversation_id = conversations.id and m.user_id = auth.uid()));
create policy "authenticated users can create conversations" on public.conversations for insert to authenticated with check (true);
create policy "members can read conversation members" on public.conversation_members for select to authenticated using (exists (select 1 from public.conversation_members own where own.conversation_id = conversation_members.conversation_id and own.user_id = auth.uid()));
create policy "users can add themselves to conversations" on public.conversation_members for insert to authenticated with check (user_id = auth.uid());
create policy "users see own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "users manage own consents" on public.consents for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users manage own privacy requests" on public.privacy_requests for select to authenticated using (user_id = auth.uid());
create policy "users create own privacy requests" on public.privacy_requests for insert to authenticated with check (user_id = auth.uid());
create policy "users see own reports or contract reports" on public.reports for select to authenticated using (author_id = auth.uid() or exists (select 1 from public.contracts c where c.id = reports.contract_id and (c.client_id = auth.uid() or c.caregiver_id = auth.uid())));
