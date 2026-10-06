import { databaseError } from "@/lib/api-error";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient, requireCurrentUser } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";

const createConversationSchema = z.object({ opportunityId: z.string().uuid(), participantId: z.string().uuid().optional() });

export async function GET() {
  try {
    const { supabase, user } = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
    const { data: memberships, error: membershipError } = await supabase.from("conversation_members").select("conversation_id").eq("user_id", user.id);
    if (membershipError) return NextResponse.json({ error: "Não foi possível carregar conversas." }, { status: 500 });
    const ids = (memberships ?? []).map((membership) => membership.conversation_id);
    if (!ids.length) return NextResponse.json({ conversations: [], currentUserId: user.id });
    const { data, error } = await supabase.from("conversations").select("id, opportunity_id, created_at").in("id", ids).order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: "Não foi possível carregar conversas." }, { status: 500 });
    // Only enrich conversations already authorized by the caller's RLS session.
    const authorizedIds = (data ?? []).map(item => item.id);
    if (!authorizedIds.length) return NextResponse.json({ conversations: [], currentUserId: user.id });
    const admin = createSupabaseAdminClient();
    const { data: members, error: membersError } = await admin.from("conversation_members").select("conversation_id, user_id, profiles(full_name)").in("conversation_id", authorizedIds).neq("user_id", user.id);
    if (membersError) return NextResponse.json({ error: "Não foi possível carregar os contatos." }, { status: 500 });
    const opportunityIds = [...new Set((data ?? []).flatMap(item => item.opportunity_id ? [item.opportunity_id] : []))];
    const titles = opportunityIds.length ? await admin.from("opportunities").select("id, title").in("id", opportunityIds) : { data: [], error: null };
    if (titles.error) return NextResponse.json({ error: "Não foi possível carregar as oportunidades das conversas." }, { status: 500 });
    const { data: summaries, error: summariesError } = await supabase.rpc("care_chat_summaries");
    if (summariesError) return NextResponse.json({ error: "Não foi possível carregar as mensagens recentes." }, { status: 500 });
    return NextResponse.json({ currentUserId: user.id, conversations: (data ?? []).map(item => {
      const member = members?.find(member => member.conversation_id === item.id);
      const profile = Array.isArray(member?.profiles) ? member.profiles[0] : member?.profiles;
      const summary = (summaries as { conversation_id: string; unread: number; last_body: string; last_at: string; blocked: boolean; peer_read_at: string | null }[] | null)?.find(summary => summary.conversation_id === item.id);
      return { ...item, ...summary, contact_name: profile?.full_name ?? "Contato", opportunity_title: titles.data?.find(opportunity => opportunity.id === item.opportunity_id)?.title ?? "Oportunidade" };
    }).sort((a, b) => Date.parse(b.last_at ?? b.created_at) - Date.parse(a.last_at ?? a.created_at)) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const parsed = createConversationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Conversa inválida." }, { status: 422 });
  const { data, error } = await supabase.rpc("open_care_conversation", { p_opportunity: parsed.data.opportunityId, p_caregiver: parsed.data.participantId ?? null });
  if (error) return databaseError(error, "Não foi possível abrir a conversa.");
  return NextResponse.json({ conversation: data });
}

export async function PATCH(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const { supabase, user } = await requireCurrentUser(); if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const parsed = z.object({ conversationId: z.string().uuid(), action: z.enum(["read", "block", "unblock", "report"]), reason: z.string().trim().min(10).max(3000).optional(), seenMessageId: z.string().uuid().optional() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success || (parsed.data.action === "report" && !parsed.data.reason)) return NextResponse.json({ error: "Informe uma ação válida e o motivo da denúncia." }, { status: 422 });
  const { error } = await supabase.rpc("manage_care_conversation", { p_conversation: parsed.data.conversationId, p_action: parsed.data.action, p_reason: parsed.data.action === "read" ? parsed.data.seenMessageId ?? null : parsed.data.reason ?? null });
  if (error) return databaseError(error, "Não foi possível atualizar a conversa.");
  return NextResponse.json({ saved: true });
}
