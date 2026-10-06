import { NextResponse } from "next/server";
import { requireCurrentUser, createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";
import { rateLimit } from "@/lib/security/rate-limit";
import { stripeSandbox, stripeSandboxEnabled, syncTestAccount, paymentError } from "@/lib/stripe";
import { assertTestObject } from "@/lib/stripe-policy";

export const runtime = "nodejs";
export async function GET() {
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "caregiver") return NextResponse.json({ error: "Acesso exclusivo do cuidador." }, { status: 403 });
  if (!stripeSandboxEnabled()) return NextResponse.json({ enabled: false, ready: false }, { headers: { "Cache-Control": "no-store" } });
  if (!(await rateLimit(`stripe-account-read:${user.id}`, 20)).allowed) return NextResponse.json({ error: "Aguarde antes de atualizar novamente." }, { status: 429 });
  try { return NextResponse.json({ enabled: true, ...await syncTestAccount(user.id) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (cause) { return paymentError(cause); }
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "caregiver") return NextResponse.json({ error: "Acesso exclusivo do cuidador." }, { status: 403 });
  if (!stripeSandboxEnabled()) return NextResponse.json({ error: "Pagamentos de teste ainda não foram configurados." }, { status: 503 });
  if (!(await rateLimit(`stripe-connect:${user.id}`, 5)).allowed) return NextResponse.json({ error: "Aguarde antes de tentar novamente." }, { status: 429 });
  try {
    const { stripe, origin } = stripeSandbox(); const admin = createSupabaseAdminClient();
    const reservation = await admin.from("stripe_test_accounts").upsert({ caregiver_id: user.id }, { onConflict: "caregiver_id", ignoreDuplicates: true });
    if (reservation.error) throw reservation.error;
    const { data: saved, error } = await admin.from("stripe_test_accounts").select("stripe_account_id,created_at").eq("caregiver_id", user.id).single();
    if (error) throw error;
    let accountId = saved.stripe_account_id as string | null;
    if (!accountId) {
      if (Date.now() - new Date(saved.created_at).getTime() > 23 * 60 * 60 * 1000) throw new Error("Cadastro antigo exige conciliação administrativa.");
      const account = await stripe.v2.core.accounts.create({
        dashboard: "express", identity: { country: "br" },
        defaults: { currency: "brl", locales: ["pt-BR"], responsibilities: { fees_collector: "application", losses_collector: "application" } },
        configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
        metadata: { zelou_caregiver_id: user.id },
      }, { idempotencyKey: `zelou-test-account-${user.id}` });
      assertTestObject(account); accountId = account.id;
      const savedAccount = await admin.from("stripe_test_accounts").update({ stripe_account_id: accountId }).eq("caregiver_id", user.id).is("stripe_account_id", null);
      if (savedAccount.error) throw savedAccount.error;
    }
    const link = await stripe.v2.core.accountLinks.create({ account: accountId, use_case: { type: "account_onboarding", account_onboarding: {
      configurations: ["recipient"], return_url: `${origin}/?stripe=connect`, refresh_url: `${origin}/?stripe=connect-refresh`,
    } } });
    assertTestObject(link);
    return NextResponse.json({ url: link.url }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) { return paymentError(cause); }
}
