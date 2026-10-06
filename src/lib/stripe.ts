import "server-only";
import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { sandboxConfig, assertTestObject, checkoutParameters, verifiedPaymentState, type TestPayment } from "@/lib/stripe-policy";

export function stripeSandbox() {
  const config = sandboxConfig(process.env);
  return { ...config, stripe: new Stripe(config.key, { maxNetworkRetries: 2, timeout: 15000 }) };
}
export function stripeSandboxEnabled() {
  try { sandboxConfig(process.env); return true; } catch { return false; }
}
export function paymentError(cause: unknown) {
  if (cause instanceof RecoveredCheckoutError) return NextResponse.json({ error: "A tentativa anterior expirou sem cobrança. Inicie um novo pagamento de teste." }, { status: 409 });
  const reference = crypto.randomUUID();
  console.error("stripe_test_failed", { reference, type: cause instanceof Stripe.errors.StripeError ? cause.type : "integration" });
  return NextResponse.json({ error: "Não foi possível concluir a operação de teste. Atualize o status antes de tentar novamente.", reference }, { status: 502 });
}
class RecoveredCheckoutError extends Error {}

export async function syncTestAccount(caregiverId: string) {
  const admin = createSupabaseAdminClient();
  const { data: saved, error } = await admin.from("stripe_test_accounts").select("stripe_account_id").eq("caregiver_id", caregiverId).maybeSingle();
  if (error) throw error;
  if (!saved?.stripe_account_id) return { ready: false, registered: false };
  const { stripe } = stripeSandbox();
  const account = await stripe.v2.core.accounts.retrieve(saved.stripe_account_id, { include: ["configuration.recipient"] });
  assertTestObject(account);
  const ready = account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status === "active";
  const result = await admin.from("stripe_test_accounts").update({ ready, updated_at: new Date().toISOString() }).eq("caregiver_id", caregiverId);
  if (result.error) throw result.error;
  return { ready, registered: true };
}

/** Reuse the exact reservation/key even after a timeout or interrupted response. */
export async function getTestSession(payment: TestPayment) {
  const { stripe, origin } = stripeSandbox();
  if (payment.stripe_session_id) return stripe.checkout.sessions.retrieve(payment.stripe_session_id, { expand: ["payment_intent.latest_charge"] });
  if (new Date(payment.expires_at).getTime() <= Date.now()) {
    // A process may stop after Stripe creates a session but before its ID is
    // stored. Find it before releasing the reservation; never guess it failed.
    let scanned = 0;
    for await (const candidate of stripe.checkout.sessions.list({ created: { gte: Math.floor(new Date(payment.created_at).getTime() / 1000) - 60, lte: Math.ceil(new Date(payment.expires_at).getTime() / 1000) }, limit: 100 })) {
      if (candidate.client_reference_id === payment.id) return stripe.checkout.sessions.retrieve(candidate.id, { expand: ["payment_intent.latest_charge"] });
      if (++scanned >= 1000) throw new Error("Conciliação administrativa necessária: limite de sessões.");
    }
    const released = await createSupabaseAdminClient().rpc("release_missing_stripe_test_session", { p_id: payment.id });
    if (released.error) throw released.error;
    throw new RecoveredCheckoutError();
  }
  // Stripe may prune idempotency keys after 24h. Never recreate an uncertain old operation.
  if (Date.now() - new Date(payment.created_at).getTime() > 23 * 60 * 60 * 1000) throw new Error("Checkout antigo exige conciliação administrativa.");
  const session = await stripe.checkout.sessions.create(checkoutParameters(payment, origin), { idempotencyKey: `zelou-test-checkout-${payment.id}` });
  return stripe.checkout.sessions.retrieve(session.id, { expand: ["payment_intent.latest_charge"] });
}

export async function syncTestPayment(payment: TestPayment, session?: Stripe.Checkout.Session) {
  const current = session ?? await getTestSession(payment);
  // Validate the session/intent before using either ID for further API calls.
  verifiedPaymentState(payment, current);
  const intent = current.payment_intent;
  const refunds: Stripe.Refund[] = [];
  if (intent && typeof intent !== "string" && intent.status === "succeeded") {
    const { stripe } = stripeSandbox();
    for await (const refund of stripe.refunds.list({ payment_intent: intent.id, limit: 100 })) {
      refunds.push(refund);
      if (refunds.length > 1000) throw new Error("Conciliação de reembolsos excedeu o limite.");
    }
  }
  const state = verifiedPaymentState(payment, current, refunds);
  const { data, error } = await createSupabaseAdminClient().rpc("apply_stripe_test_payment", {
    p_id: payment.id, p_session: current.id, p_intent: state.intentId, p_status: state.status, p_refunded: state.refunded,
  });
  if (error) throw error;
  return { payment: data as TestPayment, session: current };
}
