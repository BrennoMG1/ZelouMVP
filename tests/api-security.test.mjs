import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("rotas mutáveis exigem mesma origem", async () => {
  const routes = ["src/app/api/auth/register/route.ts", "src/app/api/auth/login/route.ts", "src/app/api/opportunities/route.ts", "src/app/api/applications/route.ts", "src/app/api/contracts/[contractId]/route.ts", "src/app/api/conversations/[conversationId]/messages/route.ts"];
  for (const route of routes) assert.match(await read(route), /requireSameOrigin/);
});

test("rotas sensíveis validam sessão e entrada", async () => {
  for (const route of ["src/app/api/opportunities/route.ts", "src/app/api/applications/route.ts", "src/app/api/contracts/route.ts", "src/app/api/conversations/[conversationId]/messages/route.ts"]) {
    const source = await read(route);
    assert.match(source, /requireCurrentUser/);
    assert.match(source, /safeParse|z\.object/);
  }
});

test("candidaturas e mensagens verificam a relação do usuário com o recurso", async () => {
  assert.match(await read("src/app/api/applications/route.ts"), /profile\?\.role !== "caregiver"/);
  assert.match(await read("src/app/api/conversations/[conversationId]/messages/route.ts"), /memberOf/);
  assert.match(await read("src/app/api/admin/documents/[documentId]/route.ts"), /profile\?\.role !== "admin"/);
});

test("migrations definem RLS para diário e notificações", async () => {
  const migration = await read("supabase/migrations/20260922_diary_and_notifications.sql");
  assert.match(migration, /enable row level security/);
  assert.match(migration, /contract parties read diary entries/);
  assert.match(migration, /author_id = auth\.uid\(\)/);
});
