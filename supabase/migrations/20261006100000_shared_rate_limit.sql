begin;
create table public.request_limits (
  key_hash text primary key check(length(key_hash)=64),
  count integer not null,
  expires_at timestamptz not null
);
create index request_limits_expiry on public.request_limits(expires_at);
alter table public.request_limits enable row level security;
revoke all on public.request_limits from public,anon,authenticated;
grant all on public.request_limits to service_role;
create function public.consume_request_limit(p_key text,p_limit integer) returns boolean
language plpgsql security definer set search_path=public as $$
declare hits integer;
begin
  if length(p_key)<>64 or p_limit not between 1 and 1000 then raise exception 'Invalid limit'; end if;
  delete from public.request_limits where key_hash in
    (select key_hash from public.request_limits where expires_at<now()-interval '1 hour' limit 100);
  insert into public.request_limits(key_hash,count,expires_at) values(p_key,1,now()+interval '1 minute')
  on conflict(key_hash) do update set
    count=case when request_limits.expires_at<=now() then 1 else least(request_limits.count+1,1000000) end,
    expires_at=case when request_limits.expires_at<=now() then now()+interval '1 minute' else request_limits.expires_at end
  returning count into hits;
  return hits<=p_limit;
end $$;
revoke all on function public.consume_request_limit(text,integer) from public,anon,authenticated;
grant execute on function public.consume_request_limit(text,integer) to service_role;
commit;
