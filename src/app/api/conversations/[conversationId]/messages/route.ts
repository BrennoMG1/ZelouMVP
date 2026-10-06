import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";
import { databaseError } from "@/lib/api-error";

const messageSchema = z.object({ body: z.string().trim().min(1).max(5000) }).strict();

async function memberOf(supabase: Awaited<ReturnType<typeof requireCurrentUser>>["supabase"], conversationId: string, userId: string) {
  const { data } = await supabase.from("conversation_members").select("conversation_id").eq("conversation_id", conversationId).eq("user_id", userId).maybeSingle();
  return Boolean(data);
}

export async function GET(_request: Request, context: { params: Promise<{ conversationId: string }> }) {
  try {
    const { conversationId } = await context.params;
    const { supabase, user } = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
    if (!(await memberOf(supabase, conversationId, user.id))) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    const params = new URL(_request.url).searchParams;
    const cursor = params.get("before"); const beforeId = params.get("beforeId");
    if (cursor && (!z.string().datetime({ offset: true }).safeParse(cursor).success || !z.string().uuid().safeParse(beforeId).success)) return NextResponse.json({ error: "Página inválida." }, { status: 422 });
    let query = supabase.from("messages").select("id, sender_id, body, created_at, kind").eq("conversation_id", conversationId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(51);
    if (cursor) query = query.or(`created_at.lt.${cursor},and(created_at.eq.${cursor},id.lt.${beforeId})`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: "Não foi possível carregar mensagens." }, { status: 500 });
    const page = (data ?? []).slice(0, 50); const oldest = page.at(-1);
    return NextResponse.json({ currentUserId: user.id, messages: page.reverse(), nextCursor: (data?.length ?? 0) > 50 && oldest ? { before: oldest.created_at, beforeId: oldest.id } : null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  try {
    const originError = requireSameOrigin(request);
    if (originError) return originError;
    const { conversationId } = await context.params;
    const { supabase, user } = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
    if (!(await memberOf(supabase, conversationId, user.id))) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    const parsed = messageSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Mensagem inválida." }, { status: 422 });
    const { data, error } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: user.id, body: parsed.data.body }).select("id, sender_id, body, created_at").single();
    if (error) return databaseError(error, "Não foi possível enviar a mensagem.");
    return NextResponse.json({ message: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
}
