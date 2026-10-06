import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient, requireCurrentUser } from "@/lib/supabase/server";
export async function GET(_request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const { supabase, user } = await requireCurrentUser(); if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const { conversationId } = await context.params;
  if (!z.string().uuid().safeParse(conversationId).success) return NextResponse.json({ error: "Conversa inválida." }, { status: 422 });
  const { data: conversation } = await supabase.from("conversations").select("opportunity_id").eq("id", conversationId).maybeSingle();
  if (!conversation) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  const admin = createSupabaseAdminClient();
  const { data: members, error: membersError } = await admin.from("conversation_members").select("user_id").eq("conversation_id", conversationId);
  if (membersError) return NextResponse.json({ error: "Não foi possível carregar participantes." }, { status: 500 });
  const ids = (members ?? []).map(member => member.user_id);
  const [opportunity, contracts] = await Promise.all([
    admin.from("opportunities").select("title, description, approximate_region, care_type, schedule, requirements, hourly_rate").eq("id", conversation.opportunity_id).maybeSingle(),
    supabase.from("contracts").select("id, status, service_snapshot").eq("opportunity_id", conversation.opportunity_id).in("client_id", ids).in("caregiver_id", ids).order("created_at", { ascending: false }),
  ]);
  if (opportunity.error || contracts.error) return NextResponse.json({ error: "Não foi possível carregar o contexto." }, { status: 500 });
  return NextResponse.json({ opportunity: opportunity.data, contracts: contracts.data }, { headers: { "Cache-Control": "no-store" } });
}
