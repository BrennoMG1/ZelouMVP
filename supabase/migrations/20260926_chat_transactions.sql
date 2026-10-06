begin;
-- Pair registry prevents duplicate chats without deleting legacy histories.
create table public.conversation_pairs (
  opportunity_id uuid not null references public.opportunities(id),
  caregiver_id uuid not null references public.profiles(id),
  conversation_id uuid not null references public.conversations(id),
  primary key(opportunity_id,caregiver_id)
);
alter table public.conversation_pairs enable row level security;
revoke all on public.conversation_pairs from anon,authenticated;
create function public.open_care_conversation(p_opportunity uuid,p_caregiver uuid default null) returns public.conversations
language plpgsql security definer set search_path = public as $$
declare o public.opportunities; c public.conversations; caregiver uuid; role_name public.user_role;
begin
  select role into role_name from public.profiles where id=auth.uid();
  select * into o from public.opportunities where id=p_opportunity;
  caregiver := case when role_name='caregiver' then auth.uid() else p_caregiver end;
  if auth.uid() is null or o.id is null or caregiver is null or not (role_name='caregiver' or (role_name='client' and o.client_id=auth.uid()))
    or not exists(select 1 from public.applications where opportunity_id=o.id and caregiver_id=caregiver)
    then raise exception 'Conversa não autorizada para esta candidatura.' using errcode='42501'; end if;
  -- Serializes calls for this requisition/participant, including first creation.
  perform pg_advisory_xact_lock(hashtextextended(o.id::text || caregiver::text,0));
  select cv.* into c from public.conversation_pairs cp join public.conversations cv on cv.id=cp.conversation_id where cp.opportunity_id=o.id and cp.caregiver_id=caregiver;
  if c.id is not null then return c; end if;
  select cv.* into c from public.conversations cv where cv.opportunity_id=o.id
    and (select count(*) from public.conversation_members m where m.conversation_id=cv.id)=2
    and exists(select 1 from public.conversation_members m where m.conversation_id=cv.id and m.user_id=o.client_id)
    and exists(select 1 from public.conversation_members m where m.conversation_id=cv.id and m.user_id=caregiver)
    order by cv.created_at,cv.id limit 1;
  if c.id is null then
    if not public.can_apply_for_care(caregiver) then raise exception 'Documentação do cuidador indisponível para nova conversa.' using errcode='42501'; end if;
    insert into public.conversations(opportunity_id) values(o.id) returning * into c;
    insert into public.conversation_members(conversation_id,user_id) values(c.id,o.client_id),(c.id,caregiver);
  end if;
  insert into public.conversation_pairs values(o.id,caregiver,c.id);
  return c;
end $$;
revoke all on function public.open_care_conversation(uuid,uuid) from public;
grant execute on function public.open_care_conversation(uuid,uuid) to authenticated;

create function public.notify_application() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.notifications(user_id,title,body) select client_id,'Nova candidatura','Confira Candidaturas recebidas. Requisição ' || new.opportunity_id::text from public.opportunities where id=new.opportunity_id;
  return new;
end $$;
create trigger application_notification after insert on public.applications for each row execute function public.notify_application();
create function public.notify_chat_message() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.notifications(user_id,title,body) select user_id,'Nova mensagem','Você recebeu uma mensagem. Abra a aba Mensagens.' from public.conversation_members where conversation_id=new.conversation_id and user_id<>new.sender_id;
  return new;
end $$;
create trigger message_notification after insert on public.messages for each row execute function public.notify_chat_message();
commit;
