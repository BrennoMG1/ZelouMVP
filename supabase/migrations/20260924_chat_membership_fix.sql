-- The old policy queried conversation_members from its own RLS predicate,
-- causing infinite recursion for both conversation lists and messages.
begin;
drop policy if exists "members can read conversation members" on public.conversation_members;
drop policy if exists "users read own conversation memberships" on public.conversation_members;
create policy "users read own conversation memberships" on public.conversation_members
  for select to authenticated using (user_id = auth.uid());
commit;
