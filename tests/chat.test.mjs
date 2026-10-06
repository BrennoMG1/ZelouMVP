import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { z } from "zod";
import { scheduleSchema } from "../src/lib/care-planning.ts";

async function handler(path, context, admin) {
  let source = await readFile(new URL(`../src/app/api/${path}/route.ts`, import.meta.url), "utf8");
  source = source.replace(/^import .*;\r?\n/gm, "");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("exports", "NextResponse", "z", "requireCurrentUser", "requireSameOrigin", "createSupabaseAdminClient", "scheduleSchema", js)(exports, { json: (body, init) => Response.json(body, init) }, z, async () => context, () => null, () => admin, scheduleSchema);
  return exports;
}

// Record every filter to ensure enrichment never queries unrelated contacts.
function database(results, queries) {
  return { rpc: async () => ({ data: [], error: null }), from(table) {
    const query = { table, filters: [] }; queries.push(query);
    const builder = {};
    for (const method of ["select", "eq", "neq", "in", "order", "insert", "limit", "or"]) {
      builder[method] = (...args) => { query.filters.push([method, ...args]); return builder; };
    }
    builder.then = (resolve, reject) => Promise.resolve(results[table] ?? { data: [], error: null }).then(resolve, reject);
    builder.maybeSingle = builder.single = () => Promise.resolve(results[table] ?? { data: null, error: null });
    return builder;
  } };
}

test("cada participante lista sua conversa com contato e oportunidade", async () => {
  for (const [viewer, contact] of [["client", "caregiver"], ["caregiver", "client"]]) {
    const queries = []; const adminQueries = [];
    const supabase = database({ conversation_members: { data: [{ conversation_id: "chat" }] }, conversations: { data: [{ id: "chat", opportunity_id: "job" }] } }, queries);
    const admin = database({ conversation_members: { data: [{ conversation_id: "chat", user_id: contact, profiles: { full_name: `Nome ${contact}` } }] }, opportunities: { data: [{ id: "job", title: "Companhia" }] } }, adminQueries);
    const route = await handler("conversations", { supabase, user: { id: viewer } }, admin);
    const response = await route.GET();
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.currentUserId, viewer);
    assert.equal(body.conversations[0].contact_name, `Nome ${contact}`);
    assert.equal(body.conversations[0].opportunity_title, "Companhia");
    assert.ok(queries[0].filters.some(filter => filter[0] === "eq" && filter[1] === "user_id" && filter[2] === viewer));
    assert.deepEqual(adminQueries[0].filters.find(filter => filter[0] === "in"), ["in", "conversation_id", ["chat"]]);
  }
});

test("sem participação não consulta contatos com a chave administrativa", async () => {
  const route = await handler("conversations", { supabase: database({ conversation_members: { data: [] } }, []), user: { id: "outsider" } }, { from() { throw new Error("Must not query private contacts"); } });
  const response = await route.GET();
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).conversations, []);
});

test("detalhes do contrato preservam requisição e condições, consultando apenas suas partes", async () => {
  const queries = []; const adminQueries = [];
  const contract = { id: "contract", opportunity_id: "request", client_id: "client", caregiver_id: "caregiver", terms: { conditions: "Condições acordadas" } };
  const route = await handler("contracts", {
    user: { id: "client" }, supabase: database({ contracts: { data: [contract] } }, queries),
  }, database({ profiles: { data: [{ id: "client", full_name: "Cliente" }, { id: "caregiver", full_name: "Cuidador" }] } }, adminQueries));
  const response = await route.GET();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.contracts[0].opportunity_id, "request");
  assert.deepEqual(body.contracts[0].terms, contract.terms);
  assert.equal(body.contracts[0].caregiver_name, "Cuidador");
  assert.deepEqual(adminQueries[0].filters.find(filter => filter[0] === "in"), ["in", "id", ["client", "caregiver"]]);
});

test("falha de RLS é erro explícito, não lista vazia", async () => {
  const route = await handler("conversations", { supabase: database({ conversation_members: { data: null, error: { code: "42P17" } } }, []), user: { id: "client" } });
  assert.equal((await route.GET()).status, 500);
});

test("mensagens de não participante são negadas antes de ler ou gravar", async () => {
  const queries = [];
  const route = await handler("conversations/[conversationId]/messages", { supabase: database({ conversation_members: { data: null } }, queries), user: { id: "outsider" } });
  const context = { params: Promise.resolve({ conversationId: "chat" }) };
  assert.equal((await route.GET(new Request("https://zelou.test"), context)).status, 403);
  assert.equal((await route.POST(new Request("https://zelou.test", { method: "POST", body: JSON.stringify({ body: "Olá" }) }), context)).status, 403);
  assert.ok(queries.every(query => query.table === "conversation_members"));
});

test("participante envia mensagem com remetente da sessão e lê histórico", async () => {
  const queries = [];
  const message = { id: "message", sender_id: "caregiver", body: "Olá" };
  const results = { conversation_members: { data: { conversation_id: "chat" } }, messages: { data: message } };
  const route = await handler("conversations/[conversationId]/messages", { supabase: database(results, queries), user: { id: "caregiver" } });
  const context = { params: Promise.resolve({ conversationId: "chat" }) };
  assert.equal((await route.POST(new Request("https://zelou.test", { method: "POST", body: JSON.stringify({ body: "Olá", sender_id: "forged" }) }), context)).status, 422);
  const response = await route.POST(new Request("https://zelou.test", { method: "POST", body: JSON.stringify({ body: "Olá" }) }), context);
  assert.equal(response.status, 201);
  const inserted = queries.find(query => query.table === "messages").filters.find(filter => filter[0] === "insert")[1];
  assert.equal(inserted.sender_id, "caregiver");
  assert.equal(inserted.conversation_id, "chat");
  results.messages.data = [message];
  assert.equal((await route.GET(new Request("https://zelou.test"), context)).status, 200);
});
