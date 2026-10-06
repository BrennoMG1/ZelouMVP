import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";

const schema = z.object({ notificationId: z.string().uuid() });

export async function GET() {
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const { data, error } = await supabase.from("notifications").select("id, title, body, read_at, created_at").order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "Não foi possível carregar notificações." }, { status: 500 });
  return NextResponse.json({ notifications: data ?? [] });
}

export async function PATCH(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Notificação inválida." }, { status: 422 });
  const { data, error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", parsed.data.notificationId).select("id, read_at").maybeSingle();
  if (error) return NextResponse.json({ error: "Não foi possível atualizar a notificação." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Notificação não encontrada." }, { status: 404 });
  return NextResponse.json({ notification: data });
}
