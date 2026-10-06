begin;
create table public.push_subscriptions (
  endpoint text primary key, user_id uuid not null references public.profiles(id) on delete cascade,
  keys jsonb not null, created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "users read push subscriptions" on public.push_subscriptions for select to authenticated using(user_id=auth.uid());
create policy "users delete push subscriptions" on public.push_subscriptions for delete to authenticated using(user_id=auth.uid());
-- Registration goes through the API so arbitrary outbound URLs cannot be stored.
revoke insert,update on public.push_subscriptions from authenticated;
create table public.push_outbox (
  id uuid primary key default uuid_generate_v4(), notification_id uuid not null references public.notifications(id) on delete cascade,
  endpoint text not null references public.push_subscriptions(endpoint) on delete cascade,
  attempts integer not null default 0, available_at timestamptz not null default now(), delivered_at timestamptz,
  unique(notification_id,endpoint)
);
alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from anon,authenticated;
create table public.care_reminder_keys (key text primary key, created_at timestamptz not null default now());
alter table public.care_reminder_keys enable row level security;
revoke all on public.care_reminder_keys from anon,authenticated;
create function public.enqueue_notification_push() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.push_outbox(notification_id,endpoint) select new.id,endpoint from public.push_subscriptions where user_id=new.user_id;
  return new;
end $$;
create trigger notification_push after insert on public.notifications for each row execute function public.enqueue_notification_push();
create function public.enqueue_care_reminders() returns void language plpgsql security definer set search_path=public as $$
declare r record; claimed text;
begin
  for r in
    select 'appointment:'||a.id||':'||a.starts_at as key,c.caregiver_id as user_id from public.appointments a join public.contracts c on c.id=a.contract_id
      where a.status='scheduled' and c.status='active' and a.starts_at between now()-interval '10 minutes' and now()+interval '30 minutes'
    union all select 'task:'||t.id,t.assigned_to from public.care_tasks t join public.contracts c on c.id=t.contract_id
      where t.status='pending' and c.status='active' and t.due_at between now()-interval '10 minutes' and now()+interval '5 minutes'
    union all select 'medication:'||m.id||':'||m.next_due_at,c.caregiver_id from public.contract_medications m join public.contracts c on c.id=m.contract_id
      where m.active and c.status='active' and now()>=c.starts_at and (c.ends_at is null or now()<=c.ends_at)
      and m.next_due_at between now()-interval '10 minutes' and now()+interval '5 minutes' and (m.ends_at is null or m.next_due_at<=m.ends_at)
  loop
    claimed:=null;
    insert into public.care_reminder_keys(key) values(r.key) on conflict do nothing returning key into claimed;
    if claimed is not null then insert into public.notifications(user_id,title,body) values(r.user_id,'Lembrete de atendimento','Há um horário próximo ou pendente. Confira sua agenda e rotina no Zelou!.'); end if;
  end loop;
end $$;
create function public.claim_care_push() returns table(id uuid,endpoint text,keys jsonb) language sql security definer set search_path=public as $$
  with batch as (select o.id from public.push_outbox o where delivered_at is null and attempts<5 and available_at<=now() order by available_at for update skip locked limit 40),
  claimed as (update public.push_outbox o set attempts=attempts+1,available_at=now()+interval '5 minutes' from batch where o.id=batch.id returning o.id,o.endpoint)
  select c.id,c.endpoint,s.keys from claimed c join public.push_subscriptions s on s.endpoint=c.endpoint
$$;
revoke all on function public.enqueue_care_reminders(),public.claim_care_push() from public;
grant execute on function public.enqueue_care_reminders(),public.claim_care_push() to service_role;
grant all on public.push_subscriptions,public.push_outbox,public.care_reminder_keys to service_role;
commit;
