import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { z } from "zod";
import { scheduleSchema } from "../src/lib/care-planning.ts";

// Execute the real handlers with only the session/database boundary replaced.
async function handler(path, context) {
  let source = await readFile(new URL(`../src/app/api/${path}/route.ts`, import.meta.url), "utf8");
  source = source.replace(/^import .*;\r?\n/gm, "");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("exports", "NextResponse", "z", "requireCurrentUser", "requireSameOrigin", "scheduleSchema", js)(exports, { json: (body, init) => Response.json(body, init) }, z, async () => context, () => null, scheduleSchema);
  return exports;
}
const request = (payload) => new Request("https://zelou.test/api/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
const uuid = "00000000-0000-4000-8000-000000000001";

test("oportunidade explica a descrição curta da captura e aceita entrada válida", async () => {
  let inserted;
  const supabase = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: "client" } }) }) }) }), rpc: async (_name, args) => { inserted = args.p_data; return { data: inserted }; } };
  const route = await handler("opportunities", { supabase, user: { id: uuid } });
  const payload = { title: "teste", description: "teste", careType: "Higiene e mobilidade", regionId: uuid, schedule: { kind: "once", startDate: "2090-01-01", endDate: "2090-01-01", days: [1], startTime: "08:00", endTime: "17:00", timezone: "America/Sao_Paulo" }, hourlyRate: 1 };
  const invalid = await route.POST(request(payload));
  assert.equal(invalid.status, 422);
  assert.match((await invalid.json()).error, /descrição.*10/);
  assert.equal(inserted, undefined);
  const valid = await route.POST(request({ ...payload, description: "Acompanhamento durante o dia", hourlyRate: 25.5 }));
  assert.equal(valid.status, 201);
  assert.equal(inserted.hourlyRate, 25.5);
  const unverified = await route.POST(request({ ...payload, description: "Acompanhamento durante o dia", regionId: undefined, approximateRegion: "banana" }));
  assert.equal(unverified.status, 422);
});

test("medicamentos rejeitam intervalo inválido, término invertido e sessão ausente", async () => {
  const route = await handler("medications", { supabase: {}, user: { id: uuid } });
  const payload = { contractId: uuid, name: "Medicamento", dosage: "Dose prescrita", instructions: "", intervalHours: 0, startsAt: "2026-09-23T12:00:00.000Z", endsAt: null };
  assert.equal((await route.POST(request(payload))).status, 422);
  assert.equal((await route.POST(request({ ...payload, intervalHours: 8, endsAt: "2026-09-22T12:00:00.000Z" }))).status, 422);
  const anonymous = await handler("medications", { user: null });
  assert.equal((await anonymous.POST(request(payload))).status, 401);
});

test("doses exigem motivo quando não administradas e propagam conflitos", async () => {
  let calls = 0;
  const route = await handler("medications", { user: { id: uuid }, supabase: { rpc: async () => { calls++; return { error: { code: "22023" } }; } } });
  const payload = { action: "record", medicationId: uuid, scheduledAt: "2026-09-23T12:00:00.000Z", administeredAt: "2026-09-23T12:05:00.000Z", outcome: "skipped", notes: "" };
  assert.equal((await route.PATCH(request(payload))).status, 422);
  assert.equal(calls, 0);
  assert.equal((await route.PATCH(request({ ...payload, notes: "Recusado" }))).status, 409);
  assert.equal(calls, 1);
});
