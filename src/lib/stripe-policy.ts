import type Stripe from "stripe";

export type TestPayment = {
  id: string; contract_id: string; contract_version: number; client_id: string; caregiver_id: string;
  amount_cents: number; fee_cents: number; destination: string; currency: string; status: string;
  stripe_session_id: string | null; stripe_payment_intent_id: string | null;
  refunded_cents: number; expires_at: string; created_at: string;
};

export function sandboxConfig(env: Record<string, string | undefined>) {
  if (env.STRIPE_SANDBOX_ENABLED !== "true") throw new Error("Pagamentos de teste ainda não foram configurados.");
  const key = env.STRIPE_SECRET_KEY ?? "";
  if (!/^sk_test_[A-Za-z0-9]+$/.test(key)) throw new Error("A integração aceita somente chave secreta de teste da Stripe.");
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET ?? "";
  if (!/^whsec_[A-Za-z0-9]+$/.test(webhookSecret)) throw new Error("Configure a assinatura das notificações de teste da Stripe.");
  const url = new URL(env.NEXT_PUBLIC_APP_URL ?? "");
  if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) {
    throw new Error("Configure o endereço seguro do Zelou.");
  }
  return { key, webhookSecret, origin: url.origin };
}

export function assertTestObject(value: { livemode: boolean }) {
  if (value.livemode !== false) throw new Error("Operações reais estão bloqueadas nesta integração.");
}

export function checkoutParameters(payment: TestPayment, origin: string): Stripe.Checkout.SessionCreateParams {
  const metadata = { zelou_test_payment: payment.id, contract_id: payment.contract_id, contract_version: String(payment.contract_version) };
  return {
    mode: "payment", payment_method_types: ["card"], locale: "pt-BR",
    client_reference_id: payment.id, metadata,
    expires_at: Math.floor(new Date(payment.expires_at).getTime() / 1000),
    line_items: [{ quantity: 1, price_data: { currency: "brl", unit_amount: payment.amount_cents, product_data: { name: "Zelou — contrato de cuidado (TESTE)" } } }],
    payment_intent_data: { metadata, application_fee_amount: payment.fee_cents, transfer_data: { destination: payment.destination } },
    success_url: `${origin}/?stripe=return&contract=${payment.contract_id}`,
    cancel_url: `${origin}/?stripe=cancel&contract=${payment.contract_id}`,
  };
}

/** Validate provider values against the immutable server reservation, not URL parameters. */
export function verifiedPaymentState(payment: TestPayment, session: Stripe.Checkout.Session, refunds: Stripe.Refund[] = []) {
  assertTestObject(session);
  if (!session.id.startsWith("cs_test_") || (payment.stripe_session_id && payment.stripe_session_id !== session.id)
    || session.client_reference_id !== payment.id || session.metadata?.zelou_test_payment !== payment.id
    || session.metadata?.contract_id !== payment.contract_id || session.metadata?.contract_version !== String(payment.contract_version)
    || session.amount_total !== payment.amount_cents || session.currency !== "brl" || session.mode !== "payment") {
    throw new Error("O pagamento não corresponde ao contrato de teste.");
  }
  const intent = session.payment_intent;
  if (typeof intent === "string") throw new Error("Confirmação incompleta do pagamento.");
  if (intent) {
    assertTestObject(intent);
    const destination = intent.transfer_data?.destination;
    if (intent.amount !== payment.amount_cents || intent.currency !== "brl" || intent.application_fee_amount !== payment.fee_cents
      || (typeof destination === "string" ? destination : destination?.id) !== payment.destination
      || intent.metadata.zelou_test_payment !== payment.id
      || (payment.stripe_payment_intent_id && intent.id !== payment.stripe_payment_intent_id)) {
      throw new Error("Divergência na divisão do pagamento de teste.");
    }
  }
  const charge = intent?.latest_charge;
  if (typeof charge === "string") throw new Error("Confirmação incompleta da cobrança.");
  if (charge) {
    assertTestObject(charge);
    if (charge.amount !== payment.amount_cents || charge.currency !== "brl") throw new Error("Cobrança divergente.");
  }
  // A requested/pending refund is not a completed refund. Use the provider's
  // individual refund statuses rather than treating a charge aggregate as final.
  let refunded = 0;
  for (const refund of refunds) {
    const refundIntent = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
    if (refundIntent !== intent?.id || refund.currency !== "brl" || !Number.isSafeInteger(refund.amount) || refund.amount <= 0) throw new Error("Reembolso divergente.");
    if (refund.status === "succeeded") refunded += refund.amount;
  }
  if (refunded > payment.amount_cents) throw new Error("Reembolso acima do valor pago.");
  const paid = session.payment_status === "paid" && intent?.status === "succeeded" && charge?.paid === true;
  const status = paid ? refunded === payment.amount_cents ? "refunded" : refunded > 0 ? "partially_refunded" : "paid"
    : session.status === "expired" ? "expired" : "open";
  return { status, refunded, intentId: intent?.id ?? null };
}
