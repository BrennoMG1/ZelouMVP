import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";
import { rateLimit } from "@/lib/security/rate-limit";
import { databaseError } from "@/lib/api-error";
import { stripeSandbox, stripeSandboxEnabled, syncTestAccount, syncTestPayment, paymentError } from "@/lib/stripe";
import { assertTestObject, type TestPayment } from "@/lib/stripe-policy";

export const runtime = "nodejs";
type Context = { params: Promise<{ contractId: string }> };
const actionSchema = z.object({ action: z.enum(["checkout", "refresh", "expire", "refund"]), paymentId: z.string().uuid().optional() }).strict();

export async function GET(_request: Request, context: Context) {
  const { contractId } = await context.params;
  if (!z.string().uuid().safeParse(contractId).success) return NextResponse.json({ error: "Contrato inválido." }, { status: 422 });
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const { data: contract, error: contractError } = await supabase.from("contracts").select("id").eq("id", contractId).maybeSingle();
  if (contractError) return databaseError(contractError, "Não foi possível consultar o contrato.");
  if (!contract) return NextResponse.json({ error: "Contrato não encontrado." }, { status: 404 });
  const { data, error } = await supabase.from("stripe_test_payments").select("id,contract_id,contract_version,amount_cents,fee_cents,status,refunded_cents,created_at,updated_at").eq("contract_id", contractId).order("created_at", { ascending: false }).limit(50);
  if (error) return databaseError(error, "Não foi possível consultar os pagamentos de teste.");
  return NextResponse.json({ enabled: stripeSandboxEnabled(), payments: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const { contractId } = await context.params;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(contractId).success || !parsed.success) return NextResponse.json({ error: "Solicitação inválida." }, { status: 422 });
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const { data: contract, error: contractError } = await supabase.from("contracts").select("id,client_id,caregiver_id").eq("id", contractId).maybeSingle();
  if (contractError) return databaseError(contractError, "Não foi possível consultar o contrato.");
  if (!contract || ![contract.client_id, contract.caregiver_id].includes(user.id)) return NextResponse.json({ error: "Contrato não encontrado." }, { status: 404 });
  const { action, paymentId } = parsed.data;
  if (action !== "refresh" && contract.client_id !== user.id) return NextResponse.json({ error: "Apenas o responsável pode iniciar ou desfazer um pagamento de teste." }, { status: 403 });
  if (!stripeSandboxEnabled()) return NextResponse.json({ error: "Pagamentos de teste ainda não foram configurados." }, { status: 503 });
  if (!(await rateLimit(`stripe-payment:${user.id}`, 15)).allowed) return NextResponse.json({ error: "Aguarde antes de tentar novamente." }, { status: 429 });
  try {
    const { stripe } = stripeSandbox(); let payment: TestPayment;
    if (action === "checkout") {
      const account = await syncTestAccount(contract.caregiver_id);
      if (!account.ready) return NextResponse.json({ error: "O cuidador precisa concluir o cadastro de recebimento de teste em Financeiro." }, { status: 409 });
      const reserved = await supabase.rpc("reserve_stripe_test_payment", { p_contract: contractId });
      if (reserved.error) return databaseError(reserved.error, "Não foi possível iniciar o pagamento de teste.");
      payment = reserved.data as TestPayment;
    } else {
      if (!paymentId) return NextResponse.json({ error: "Selecione um pagamento." }, { status: 422 });
      const result = await supabase.from("stripe_test_payments").select("*").eq("contract_id", contractId).eq("id", paymentId).maybeSingle();
      if (result.error) return databaseError(result.error, "Não foi possível consultar o pagamento.");
      if (!result.data) return NextResponse.json({ error: "Pagamento não encontrado." }, { status: 404 });
      payment = result.data as TestPayment;
    }
    if (payment.status === "expired" && !payment.stripe_session_id) return NextResponse.json({ status: "expired", url: null });
    let synced = await syncTestPayment(payment);
    if (action === "expire" && synced.session.status === "open") {
      await stripe.checkout.sessions.expire(synced.session.id);
      synced = await syncTestPayment(synced.payment);
    }
    if (action === "refund") {
      if (!["paid", "partially_refunded", "refunded"].includes(synced.payment.status) || !synced.payment.stripe_payment_intent_id) {
        return NextResponse.json({ error: "O pagamento ainda não foi confirmado." }, { status: 409 });
      }
      if (synced.payment.status !== "refunded") {
        const refund = await stripe.refunds.create({ payment_intent: synced.payment.stripe_payment_intent_id,
          reverse_transfer: true, refund_application_fee: true,
        }, { idempotencyKey: `zelou-test-refund-${payment.id}-${synced.payment.refunded_cents}` });
        // Refund has no livemode field; it is issued only through the test client,
        // against an intent that syncTestPayment has already verified as test.
        synced = await syncTestPayment(synced.payment);
        if (refund.status === "failed" || refund.status === "canceled") return NextResponse.json({ error: "O reembolso de teste não foi concluído. Confira o sandbox da Stripe." }, { status: 409 });
      }
    }
    assertTestObject(synced.session);
    return NextResponse.json({ status: synced.payment.status, url: action === "checkout" && synced.session.status === "open" ? synced.session.url : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) { return paymentError(cause); }
}
