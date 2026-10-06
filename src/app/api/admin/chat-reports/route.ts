import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient, requireCurrentUser } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";
async function access() {
  const { supabase, user } = await requireCurrentUser();
  if (!user) return { user: null, allowed: false };
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { user, allowed: ["admin", "super_admin"].includes(data?.role ?? "") };
}
export async function GET(request: Request) {
  const { user, allowed } = await access(); if (!allowed) return NextResponse.json({ error: "Acesso restrito à administração." }, { status: user ? 403 : 401 });
  const id = new URL(request.url).searchParams.get("reportId"); const admin = createSupabaseAdminClient();
  if (id) {
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Denúncia inválida." }, { status: 422 });
    const { data: report } = await admin.from("chat_reports").select("conversation_id").eq("id", id).maybeSingle();
    if (!report) return NextResponse.json({ error: "Denúncia não encontrada." }, { status: 404 });
    const { data, error } = await admin.from("messages").select("id, sender_id, body, created_at").eq("conversation_id", report.conversation_id).order("created_at", { ascending: false }).limit(100);
    if (error) return NextResponse.json({ error: "Falha ao carregar contexto." }, { status: 500 });
    const audit = await admin.from("audit_logs").insert({ actor_id: user!.id, action: "chat_report.context_read", entity_type: "chat_report", entity_id: id });
    if (audit.error) return NextResponse.json({ error: "Falha ao registrar a consulta." }, { status: 500 });
    return NextResponse.json({ messages: data.reverse() }, { headers: { "Cache-Control": "no-store" } });
  }
  const { data, error } = await admin.from("chat_reports").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "Falha ao carregar denúncias." }, { status: 500 });
  return NextResponse.json({ reports: data }, { headers: { "Cache-Control": "no-store" } });
}
export async function PATCH(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const { user, allowed } = await access(); if (!allowed) return NextResponse.json({ error: "Acesso restrito à administração." }, { status: user ? 403 : 401 });
  const parsed = z.object({ id: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Denúncia inválida." }, { status: 422 });
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("chat_reports").update({ status: "reviewed" }).eq("id", parsed.data.id);
  if (error) return NextResponse.json({ error: "Falha ao concluir análise." }, { status: 500 });
  const audit = await admin.from("audit_logs").insert({ actor_id: user!.id, action: "chat_report.reviewed", entity_type: "chat_report", entity_id: parsed.data.id });
  if (audit.error) return NextResponse.json({ error: "Análise salva, mas houve falha no registro de auditoria." }, { status: 500 });
  return NextResponse.json({ saved: true });
}
