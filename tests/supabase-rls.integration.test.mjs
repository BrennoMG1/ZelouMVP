import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.RUN_SUPABASE_INTEGRATION === "1";
const required = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_TEST_CLIENT_EMAIL", "SUPABASE_TEST_CLIENT_PASSWORD", "SUPABASE_TEST_CAREGIVER_EMAIL", "SUPABASE_TEST_CAREGIVER_PASSWORD"];

test("participantes leem vínculos, conversa e mensagens sem recursão RLS", { skip: !enabled || !process.env.SUPABASE_TEST_CONVERSATION_ID || required.some(name => !process.env[name]) }, async () => {
  for (const role of ["CLIENT", "CAREGIVER"]) {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const login = await client.auth.signInWithPassword({ email: process.env[`SUPABASE_TEST_${role}_EMAIL`], password: process.env[`SUPABASE_TEST_${role}_PASSWORD`] });
    assert.equal(login.error, null);
    const id = process.env.SUPABASE_TEST_CONVERSATION_ID;
    const membership = await client.from("conversation_members").select("conversation_id").eq("conversation_id", id).eq("user_id", login.data.user.id);
    assert.equal(membership.error, null);
    assert.equal(membership.data.length, 1);
    const conversation = await client.from("conversations").select("id").eq("id", id);
    assert.equal(conversation.error, null);
    assert.equal(conversation.data.length, 1);
    const messages = await client.from("messages").select("id").eq("conversation_id", id);
    assert.equal(messages.error, null);
  }
});

test("RLS impede leitura de perfil de outro usuário", { skip: !enabled || required.some((name) => !process.env[name]) }, async () => {
  const connect = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const client = connect(); const caregiver = connect();
  assert.equal((await client.auth.signInWithPassword({ email: process.env.SUPABASE_TEST_CLIENT_EMAIL, password: process.env.SUPABASE_TEST_CLIENT_PASSWORD })).error, null);
  const caregiverLogin = await caregiver.auth.signInWithPassword({ email: process.env.SUPABASE_TEST_CAREGIVER_EMAIL, password: process.env.SUPABASE_TEST_CAREGIVER_PASSWORD });
  assert.equal(caregiverLogin.error, null);
  const { data, error } = await client.from("profiles").select("id, full_name").eq("id", caregiverLogin.data.user.id);
  assert.equal(error, null);
  assert.equal(data.length, 0, "um cliente não deve ler o perfil privado de outro usuário");
});

test("RLS impede um cuidador de criar candidatura em nome de outro", { skip: !enabled || required.some((name) => !process.env[name]) }, async () => {
  const caregiver = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const login = await caregiver.auth.signInWithPassword({ email: process.env.SUPABASE_TEST_CAREGIVER_EMAIL, password: process.env.SUPABASE_TEST_CAREGIVER_PASSWORD });
  assert.equal(login.error, null);
  const { error } = await caregiver.from("applications").insert({ opportunity_id: "00000000-0000-0000-0000-000000000000", caregiver_id: "00000000-0000-0000-0000-000000000000" });
  assert.ok(error, "RLS ou a FK devem rejeitar a inserção forjada");
});
