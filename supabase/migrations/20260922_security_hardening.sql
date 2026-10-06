-- Apply after schema.sql. This migration removes overly broad policies and
-- makes all sensitive records reachable only by their owner/contract party.

drop policy if exists "profiles are visible to signed in users" on public.profiles;
drop policy if exists "users edit own profile" on public.profiles;
drop policy if exists "authenticated users can create conversations" on public.conversations;
drop policy if exists "users can add themselves to conversations" on public.conversation_members;

create policy "users read own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy "users update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "caregivers manage own professional profile" on public.caregiver_profiles
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "clients manage own elderly profiles" on public.elderly_profiles
  for all to authenticated using (auth.uid() = client_id) with check (auth.uid() = client_id);
create policy "caregivers read own documents" on public.documents
  for select to authenticated using (auth.uid() = caregiver_id);

create policy "clients read applications to their opportunities" on public.applications
  for select to authenticated using (
    exists (select 1 from public.opportunities o where o.id = applications.opportunity_id and o.client_id = auth.uid())
  );

create policy "contract parties create reports" on public.reports
  for insert to authenticated with check (
    author_id = auth.uid() and exists (
      select 1 from public.contracts c
      where c.id = reports.contract_id and (c.client_id = auth.uid() or c.caregiver_id = auth.uid())
    )
  );
create policy "authors update own reports" on public.reports
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy "users update own notifications" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users update own privacy requests" on public.privacy_requests
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users delete own privacy requests" on public.privacy_requests
  for delete to authenticated using (user_id = auth.uid());

-- Conversation creation and membership are deliberately service-only. The API
-- validates both parties and the related opportunity before using the admin key.

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do update set public = false;
