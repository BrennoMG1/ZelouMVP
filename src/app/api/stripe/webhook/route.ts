import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { stripeSandbox, stripeSandboxEnabled, syncTestPayment, paymentError } from "@/lib/stripe";
import { assertTestObject, type TestPayment } from "@/lib/stripe-policy";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!stripeSandboxEnabled()) return NextResponse.json({ error: "Sandbox não configurado." }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Assinatura ausente." }, { status: 400 });
  const { stripe, webhookSecret } = stripeSandbox();
  let event: Stripe.Event;
  try {
    // Signature verification requires the exact raw body, before parsing JSON.
    event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret);
    assertTestObject(event);
  } catch { return NextResponse.json({ error: "Notificação de teste inválida." }, { status: 400 }); }
  const supported = ["checkout.session.completed", "checkout.session.expired", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "charge.refunded", "refund.updated", "refund.created", "refund.failed"];
  if (!supported.includes(event.type)) return NextResponse.json({ received: true });
  try {
    const admin = createSupabaseAdminClient();
    const seen = await admin.from("stripe_test_events").select("id").eq("id", event.id).maybeSingle();
    if (seen.error) throw seen.error;
    if (seen.data) return NextResponse.json({ received: true });
    let paymentId: string | undefined; let session: Stripe.Checkout.Session | undefined;
    if (event.type.startsWith("checkout.session.")) {
      session = await stripe.checkout.sessions.retrieve((event.data.object as Stripe.Checkout.Session).id, { expand: ["payment_intent.latest_charge"] });
      assertTestObject(session); paymentId = session.metadata?.zelou_test_payment;
    } else {
      const intent = (event.data.object as Stripe.Charge | Stripe.Refund).payment_intent;
      const intentId = typeof intent === "string" ? intent : intent?.id;
      if (intentId) {
        const current = await stripe.paymentIntents.retrieve(intentId);
        assertTestObject(current); paymentId = current.metadata.zelou_test_payment;
      }
    }
    if (paymentId) {
      const result = await admin.from("stripe_test_payments").select("*").eq("id", paymentId).maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new Error("Payment reservation missing; retry webhook.");
      await syncTestPayment(result.data as TestPayment, session);
    }
    // Mark only after the durable state update succeeds. A retry after a crash
    // re-applies current Stripe state without producing duplicate notifications.
    const saved = await admin.from("stripe_test_events").upsert({ id: event.id, event_type: event.type }, { onConflict: "id", ignoreDuplicates: true });
    if (saved.error) throw saved.error;
    return NextResponse.json({ received: true });
  } catch (cause) { return paymentError(cause); }
}
