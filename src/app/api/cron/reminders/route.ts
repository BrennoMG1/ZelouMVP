import { timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { allowedPushEndpoint } from "@/lib/push";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET; const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || Buffer.byteLength(auth) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) return NextResponse.json({ error: "Acesso negado." }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const reminders = await admin.rpc("enqueue_care_reminders");
  if (reminders.error) return NextResponse.json({ error: "Não foi possível gerar lembretes." }, { status: 500 });
  const publicKey = process.env.VAPID_PUBLIC_KEY; const privateKey = process.env.VAPID_PRIVATE_KEY; const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return NextResponse.json({ reminders: true, pushConfigured: false });
  const { data, error } = await admin.rpc("claim_care_push");
  if (error) return NextResponse.json({ error: "Não foi possível processar a fila." }, { status: 500 });
  const results = await Promise.allSettled((data ?? []).map(async (item: { id: string; endpoint: string; keys: { auth: string; p256dh: string } }) => {
    if (!allowedPushEndpoint(item.endpoint)) { await admin.from("push_subscriptions").delete().eq("endpoint", item.endpoint); return; }
    try {
      await webpush.sendNotification({ endpoint: item.endpoint, keys: item.keys }, JSON.stringify({ title: "Zelou!", body: "Você tem uma atualização ou horário pendente. Abra o Zelou! para conferir.", tag: item.id }), { vapidDetails: { subject, publicKey, privateKey }, TTL: 3600, timeout: 5000 });
      const saved = await admin.from("push_outbox").update({ delivered_at: new Date().toISOString() }).eq("id", item.id); if (saved.error) throw new Error("Delivery state not saved");
    } catch (cause) {
      const code = (cause as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("endpoint", item.endpoint);
      else throw new Error("Push delivery failed");
    }
  }));
  return NextResponse.json({ processed: results.length, failed: results.filter(result => result.status === "rejected").length });
}
