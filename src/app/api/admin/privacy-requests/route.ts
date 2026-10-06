import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient, requireCurrentUser } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";
import { databaseError } from "@/lib/api-error";

async function access() {
  const session = await requireCurrentUser();
  if (!session.user) return null;
  const { data } = await session.supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
  return ["admin", "super_admin"].includes(data?.role ?? "") ? session : null;
}
export async function GET() {
  if (!await access()) return NextResponse.json({ error: "Acesso restrito à administração." }, { status: 403 });
  const { data, error } = await createSupabaseAdminClient().from("privacy_requests").select("id,user_id,request_type,status,details,response_note,created_at,completed_at").order("created_at", { ascending: false }).limit(100);
  if (error) return databaseError(error, "Falha ao consultar solicitações.");
  return NextResponse.json({ requests: data }, { headers: { "Cache-Control": "no-store" } });
}
const schema = z.object({ id: z.string().uuid(), action: z.enum(["in_progress", "completed", "rejected", "close_account"]), note: z.string().trim().min(10).max(3000), confirmUserId: z.string().uuid().optional(), retentionReviewed: z.boolean().optional() }).strict();
export async function POST(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const session = await access(); if (!session) return NextResponse.json({ error: "Acesso restrito à administração." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confira a ação e a resposta ao usuário." }, { status: 422 });
  const { id, action, note, confirmUserId, retentionReviewed } = parsed.data;
  if (action !== "close_account") {
    const { error } = await session.supabase.rpc("review_privacy_request", { p_id: id, p_status: action, p_note: note });
    return error ? databaseError(error, "Falha ao atualizar solicitação.") : NextResponse.json({ saved: true });
  }
  const admin = createSupabaseAdminClient();
  const { data: target, error } = await admin.from("privacy_requests").select("user_id,request_type,status").eq("id", id).maybeSingle();
  if (error) return databaseError(error, "Falha ao consultar pedido.");
  if (!target || target.request_type !== "deletion" || confirmUserId !== target.user_id || retentionReviewed !== true) return NextResponse.json({ error: "Confirme a conta solicitante e a análise dos registros que serão preservados." }, { status: 422 });
  if (target.status === "completed") return NextResponse.json({ saved: true });
  const prepared = await admin.rpc("prepare_account_closure", { p_id: id, p_actor: session.user!.id, p_note: note });
  if (prepared.error) return databaseError(prepared.error, "Não foi possível preparar o encerramento.");
  try {
    // Remove through Storage, never by deleting storage.objects rows.
    // Application uploads in these buckets use a flat <user UUID>/<filename> path.
    for (const bucket of ["avatars", "documents"]) {
      for (let batch = 0; ; batch++) {
        if (batch >= 50) throw new Error("Cleanup batch limit");
        const listed = await admin.storage.from(bucket).list(target.user_id, { limit: 100 });
        if (listed.error) throw listed.error;
        if (!listed.data.length) break;
        if (listed.data.some(file => !file.id || file.name.includes("/"))) throw new Error("Unexpected nested folder");
        const removed = await admin.storage.from(bucket).remove(listed.data.map(file => `${target.user_id}/${file.name}`));
        if (removed.error) throw removed.error;
      }
    }
    // Soft deletion removes Auth credentials while preserving the referenced ID.
    // Historical contracts, care records and payment records are retained, not
    // falsely described as erased; the administrator must document this review.
    const deleted = await admin.auth.admin.deleteUser(target.user_id, true);
    if (deleted.error && deleted.error.code !== "user_not_found") throw deleted.error;
    const finished = await admin.rpc("finish_account_closure", { p_id: id });
    if (finished.error) throw finished.error;
    return NextResponse.json({ saved: true, message: "Conta encerrada. Registros compartilhados preservados conforme a análise registrada." });
  } catch {
    return NextResponse.json({ error: "O acesso foi bloqueado, mas o encerramento ainda está em processamento. Confira os serviços de Storage/Auth e repita esta mesma ação para continuar. O pedido não foi marcado como concluído." }, { status: 503 });
  }
}
