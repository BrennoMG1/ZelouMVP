import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
export async function careDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role authenticator; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated') $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key, owner uuid);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select on storage.objects to authenticated;
    create policy owner_read on storage.objects for select to authenticated using(owner=auth.uid());
    create function public.uuid_generate_v4() returns uuid language sql as $$ select gen_random_uuid() $$;
    grant usage on schema public,auth to authenticated,anon,service_role;
    alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
  `);
  const root = new URL("../../supabase/", import.meta.url);
  await db.exec((await readFile(new URL("schema.sql", root), "utf8")).replace('create extension if not exists "uuid-ossp";', ''));
  const initial = ["20260922_security_hardening.sql", "20260922_product_persistence.sql", "20260922_diary_and_notifications.sql"];
  const files = [...initial, ...(await readdir(new URL("migrations/", root))).filter(name => !initial.includes(name)).sort()];
  for (const name of files) { try { await db.exec((await readFile(new URL(`migrations/${name}`, root), "utf8")).replace(/^\uFEFF/, "")); } catch (error) { await db.close(); throw new Error(`Migration ${name}: ${error.message}`); } }
  return db;
}
export async function asUser(db, id) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)", [id]);
  await db.exec("set role authenticated");
}
