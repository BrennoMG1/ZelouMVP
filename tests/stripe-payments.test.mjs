import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import Stripe from "stripe";
import { z } from "zod";
import { sandboxConfig, assertTestObject, checkoutParameters, verifiedPaymentState } from "../src/lib/stripe-policy.ts";
import { careDatabase, asUser } from "./helpers/care-database.mjs";

const family = "10000000-0000-4000-8000-000000000001";
const caregiver = "10000000-0000-4000-8000-000000000002";
const outsider = "10000000-0000-4000-8000-000000000003";
const payment = { id: outsider, contract_id: family, contract_version: 1, client_id: family, caregiver_id: caregiver, destination: "acct_test", amount_cents: 12345, fee_cents: 1235, currency: "brl", status: "creating", stripe_session_id: null, stripe_payment_intent_id: null, refunded_cents: 0, expires_at: "2090-01-01T01:00:00Z", created_at: "2090-01-01T00:00:00Z" };
const parameters = checkoutParameters(payment, "https://zelou.test");
const session = { id: "cs_test_example", livemode: false, client_reference_id: payment.id, metadata: parameters.metadata, mode: "payment", amount_total: 12345, currency: "brl", status: "complete", payment_status: "paid", payment_intent: { id: "pi_test", livemode: false, amount: 12345, currency: "brl", application_fee_amount: 1235, transfer_data: { destination: "acct_test" }, metadata: parameters.metadata, status: "succeeded", latest_charge: { id: "ch_test", livemode: false, amount: 12345, currency: "brl", paid: true, amount_refunded: 0 } } };

test("sandbox rejeita chaves reais, configuração incompleta e URLs inseguras", () => {
  const env = { STRIPE_SANDBOX_ENABLED: "true", STRIPE_SECRET_KEY: "sk_test_dummy", STRIPE_WEBHOOK_SECRET: "whsec_dummy", NEXT_PUBLIC_APP_URL: "http://localhost:3000" };
  assert.equal(sandboxConfig(env).origin, "http://localhost:3000");
  for (const key of ["sk_live_dummy", "rk_live_dummy", "pk_test_dummy", "", "sk_test_dummy\n"]) assert.throws(() => sandboxConfig({ ...env, STRIPE_SECRET_KEY: key }));
  assert.throws(() => sandboxConfig({ ...env, STRIPE_SANDBOX_ENABLED: "false" }));
  assert.throws(() => sandboxConfig({ ...env, STRIPE_WEBHOOK_SECRET: "" }));
  assert.throws(() => sandboxConfig({ ...env, NEXT_PUBLIC_APP_URL: "http://public.example" }));
  assert.throws(() => sandboxConfig({ ...env, NEXT_PUBLIC_APP_URL: "https://user:pass@zelou.test" }));
  assert.throws(() => assertTestObject({ livemode: true }));
  assert.throws(() => assertTestObject({}));
});

test("checkout preserva centavos, comissão e destino; confirmação rejeita divergências", () => {
  assert.equal(parameters.line_items[0].price_data.unit_amount, 12345);
  assert.equal(parameters.payment_intent_data.application_fee_amount, 1235);
  assert.equal(parameters.payment_intent_data.transfer_data.destination, "acct_test");
  assert.deepEqual(parameters.payment_method_types, ["card"]);
  assert.deepEqual(verifiedPaymentState(payment, session), { status: "paid", refunded: 0, intentId: "pi_test" });
  const mutations = [
    s => { s.livemode = true; }, s => { s.id = "cs_live_bad"; }, s => { s.amount_total = 1; },
    s => { s.currency = "usd"; }, s => { s.client_reference_id = family; }, s => { s.metadata.contract_version = "2"; },
    s => { s.payment_intent.application_fee_amount = 0; }, s => { s.payment_intent.transfer_data.destination = "acct_attacker"; },
    s => { s.payment_intent.livemode = true; }, s => { s.payment_intent.latest_charge.livemode = true; },
    s => { s.payment_intent = "pi_unexpanded"; },
  ];
  for (const mutate of mutations) { const value = structuredClone(session); mutate(value); assert.throws(() => verifiedPaymentState(payment, value)); }
  const refund = structuredClone(session); refund.payment_intent.latest_charge.amount_refunded = 12345;
  const providerRefund = { payment_intent: "pi_test", currency: "brl", amount: 12345, status: "succeeded" };
  assert.equal(verifiedPaymentState(payment, refund, [providerRefund]).status, "refunded");
  for (const status of ["pending", "failed", "canceled"]) assert.equal(verifiedPaymentState(payment, refund, [{ ...providerRefund, status }]).status, "paid");
  refund.payment_intent.latest_charge.amount_refunded = 100;
  assert.equal(verifiedPaymentState(payment, refund, [{ ...providerRefund, amount: 100 }]).status, "partially_refunded");
  assert.throws(() => verifiedPaymentState(payment, refund, [{ ...providerRefund, payment_intent: "pi_other" }]));
  const unpaid = { ...session, payment_status: "unpaid", status: "open", payment_intent: null };
  assert.equal(verifiedPaymentState(payment, unpaid).status, "open");
  assert.equal(verifiedPaymentState(payment, { ...unpaid, status: "expired" }).status, "expired");
});

test("banco: RLS, reserva única, centavos, notificações idempotentes e bloqueio de aditivo", async () => {
  const db = await careDatabase();
  try {
    await db.query("insert into auth.users(id) values($1),($2),($3)", [family, caregiver, outsider]);
    await db.query("insert into profiles(id,role,full_name) values($1,'client','Family'),($2,'caregiver','Caregiver'),($3,'client','Other')", [family, caregiver, outsider]);
    const job = (await db.query("insert into opportunities(client_id,title,description,care_type,approximate_region,hourly_rate) values($1,'Care','Care description','Care','SP',25) returning id", [family])).rows[0].id;
    const inserted = (await db.query("insert into contracts(opportunity_id,client_id,caregiver_id,gross_amount,starts_at,status,client_signed_at,caregiver_signed_at,service_snapshot) values($1,$2,$3,123.45,'2090-01-01','active',now(),now(),'{}') returning id,caregiver_net_amount", [job,family,caregiver])).rows[0];
    assert.equal(Number(inserted.caregiver_net_amount),111.10);
    const contract = inserted.id;
    await db.query("insert into stripe_test_accounts(caregiver_id,stripe_account_id,ready) values($1,'acct_test',true)", [caregiver]);
    await asUser(db, caregiver);
    await assert.rejects(db.query("select reserve_stripe_test_payment($1)", [contract]), /Acesso negado/);
    await asUser(db, family);
    const reserve = async () => (await db.query("select (reserve_stripe_test_payment($1)).*", [contract])).rows[0];
    const p = await reserve(); assert.equal(p.amount_cents,12345); assert.equal(p.fee_cents,1235);
    assert.equal((await reserve()).id,p.id);
    await assert.rejects(db.query("update stripe_test_payments set status='paid' where id=$1", [p.id]), /permission denied/);
    await assert.rejects(db.query("select apply_stripe_test_payment($1,'cs_test_fake','pi_fake','paid',0)", [p.id]), /permission denied/);
    await assert.rejects(db.query("select release_missing_stripe_test_session($1)", [p.id]), /permission denied/);
    await asUser(db, outsider);
    assert.equal((await db.query("select * from stripe_test_payments")).rows.length,0);
    assert.equal((await db.query("select * from stripe_test_accounts")).rows.length,0);
    await assert.rejects(db.query("select reserve_stripe_test_payment($1)", [contract]), /Acesso negado/);
    await db.exec("reset role");
    await assert.rejects(db.query("update contracts set document_version=document_version+1,gross_amount=200 where id=$1", [contract]), /checkout|reembolse/);
    await assert.rejects(db.query("update contracts set status='cancelled' where id=$1", [contract]), /checkout/);
    const apply = async (status, refunded=0, sid="cs_test_example") => (await db.query("select (apply_stripe_test_payment($1,$2,'pi_test',$3,$4)).*", [p.id,sid,status,refunded])).rows[0];
    await assert.rejects(apply("paid",0,"cs_live_bad"), /Inconsistent/);
    assert.equal((await apply("open")).status,"open");
    await assert.rejects(apply("paid",0,"cs_test_other"), /Inconsistent/);
    assert.equal((await apply("paid")).status,"paid");
    const count = async () => (await db.query("select count(*)::int n from notifications where title='Pagamento de teste atualizado'")).rows[0].n;
    assert.equal(await count(),2); await apply("paid"); assert.equal(await count(),2);
    assert.equal((await apply("open")).status,"paid");
    assert.equal((await apply("expired")).status,"paid");
    assert.equal((await apply("partially_refunded",100)).status,"partially_refunded");
    assert.equal((await apply("paid")).refunded_cents,100);
    await assert.rejects(db.query("update contracts set document_version=document_version+1,gross_amount=200 where id=$1", [contract]), /checkout|reembolse/);
    assert.equal((await apply("refunded",12345)).status,"refunded");
    assert.equal((await apply("paid")).status,"refunded");
    await db.query("update contracts set document_version=document_version+1,gross_amount=200 where id=$1", [contract]);
    await asUser(db, family); const next = await reserve(); assert.notEqual(next.id,p.id); assert.equal(next.amount_cents,20000); assert.equal(next.contract_version,2);
    await asUser(db, caregiver); assert.equal((await db.query("select * from stripe_test_payments")).rows.length,2);
    await db.exec("reset role");
    await db.query("update stripe_test_payments set expires_at=now()-interval '1 hour' where id=$1",[next.id]);
    await db.query("select release_missing_stripe_test_session($1)",[next.id]);
    assert.equal((await db.query("select status from stripe_test_payments where id=$1",[next.id])).rows[0].status,"expired");
    await assert.rejects(db.query("update stripe_test_accounts set livemode=true"), /check constraint/);
  } finally { await db.close(); }
});

async function loadRoute(path, overrides) {
  let source = await readFile(new URL(`../src/app/api/${path}/route.ts`, import.meta.url),"utf8");
  source = source.replace(/^import .*;\r?\n/gm, "");
  const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports = {};
  const bindings = { NextResponse: { json: (body,init)=>Response.json(body,init) }, Stripe, z, assertTestObject, paymentError: ()=>Response.json({error:"provider"},{status:502}), stripeSandboxEnabled: ()=>true, rateLimit: ()=>({allowed:true}), requireSameOrigin: ()=>null, ...overrides };
  new Function("exports",...Object.keys(bindings),js)(exports,...Object.values(bindings)); return exports;
}

test("webhook verifica assinatura e modo antes do banco; falha provoca nova entrega", async () => {
  const stripe = new Stripe("sk_test_dummy"); const secret="whsec_dummy"; let dbCalls=0; let syncCalls=0; let seen=false; let fail=false;
  stripe.checkout.sessions.retrieve=async ()=>session;
  const admin={from: table=>{dbCalls++; return {select:()=>({eq:()=>({maybeSingle:async()=>({data:table==='stripe_test_events' ? seen ? {id:'evt_test'} : null : payment})})}),upsert:async()=>{seen=true; return {error:null};}};}};
  const route=await loadRoute("stripe/webhook",{stripeSandbox:()=>({stripe,webhookSecret:secret}),createSupabaseAdminClient:()=>admin,syncTestPayment:async()=>{syncCalls++; if(fail) throw Error('offline');}});
  const payload=JSON.stringify({id:'evt_test',object:'event',type:'checkout.session.completed',livemode:false,data:{object:{id:session.id}}});
  const req=(body=payload, signature=stripe.webhooks.generateTestHeaderString({payload:body,secret}))=>new Request('https://zelou.test/api/stripe/webhook',{method:'POST',headers:{'stripe-signature':signature},body});
  assert.equal((await route.POST(req(payload,'invalid'))).status,400); assert.equal(dbCalls,0);
  assert.equal((await route.POST(req(payload.replace('"livemode":false','"livemode":true')))).status,400); assert.equal(dbCalls,0);
  fail=true; assert.equal((await route.POST(req())).status,502); assert.equal(seen,false);
  fail=false; assert.equal((await route.POST(req())).status,200); assert.equal(syncCalls,2);
  assert.equal((await route.POST(req())).status,200); assert.equal(syncCalls,2);
});

test("API exige sessão, origem, vínculo e papel; cliente não escolhe valor ou destino", async () => {
  let stripeCalls=0;
  const context={params:Promise.resolve({contractId:family})};
  const req=body=>new Request('https://zelou.test/api/contracts/'+family+'/payments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const db={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:family,client_id:family,caregiver_id:caregiver}})})})})};
  const bindings={stripeSandbox:()=>{stripeCalls++;throw Error('must not access provider');}};
  const anonymous=await loadRoute("contracts/[contractId]/payments",{...bindings,requireCurrentUser:async()=>({user:null})});
  assert.equal((await anonymous.POST(req({action:'checkout'}),context)).status,401);
  const foreign=await loadRoute("contracts/[contractId]/payments",{...bindings,requireCurrentUser:async()=>({user:{id:family},supabase:db}),requireSameOrigin:()=>Response.json({error:'origin'},{status:403})});
  assert.equal((await foreign.POST(req({action:'checkout'}),context)).status,403);
  for (const id of [caregiver,outsider]) {
    const route=await loadRoute("contracts/[contractId]/payments",{...bindings,requireCurrentUser:async()=>({user:{id},supabase:db})});
    assert.equal((await route.POST(req({action:'refund',paymentId:outsider}),context)).status,id===caregiver?403:404);
  }
  const client=await loadRoute("contracts/[contractId]/payments",{...bindings,requireCurrentUser:async()=>({user:{id:family},supabase:db})});
  assert.equal((await client.POST(req({action:'checkout',amount:1,destination:'acct_attacker'}),context)).status,422);
  assert.equal(stripeCalls,0);
});
