import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient, requireCurrentUser } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";
import { allowedPushEndpoint } from "@/lib/push";

export async function GET() {
  const { user } = await requireCurrentUser(); if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  return NextResponse.json({ publicKey: process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT ? process.env.VAPID_PUBLIC_KEY : null });
}
export async function POST(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const { user } = await requireCurrentUser(); if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const parsed = z.object({ endpoint: z.string().max(2048).refine(allowedPushEndpoint), keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]+$/).min(80).max(100), auth: z.string().regex(/^[A-Za-z0-9_-]+$/).min(20).max(30) }) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Assinatura de notificações inválida ou navegador não suportado." }, { status: 422 });
  const admin = createSupabaseAdminClient();
  const { data: existing, error: lookupError } = await admin.from("push_subscriptions").select("user_id").eq("endpoint", parsed.data.endpoint).maybeSingle();
  if (lookupError) return NextResponse.json({ error: "Não foi possível verificar este dispositivo." }, { status: 500 });
  if (existing && existing.user_id !== user.id) return NextResponse.json({ error: "Desative as notificações da conta anterior neste navegador antes de ativar outra conta." }, { status: 409 });
  const { error } = existing
    ? await admin.from("push_subscriptions").update({ keys: parsed.data.keys }).eq("endpoint", parsed.data.endpoint).eq("user_id", user.id)
    : await admin.from("push_subscriptions").insert({ ...parsed.data, user_id: user.id });
  if (error) return NextResponse.json({ error: "Não foi possível ativar os lembretes." }, { status: 500 });
  return NextResponse.json({ saved: true });
}
export async function DELETE(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const { supabase, user } = await requireCurrentUser(); if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const parsed = z.object({ endpoint: z.string().max(2048) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dispositivo inválido." }, { status: 422 });
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Não foi possível desativar os lembretes." }, { status: 500 });
  return NextResponse.json({ saved: true });
}
