import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser, createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";

const reviewSchema = z.object({ status: z.enum(["approved", "rejected", "needs_correction", "under_review"]), reviewerNotes: z.string().trim().max(2000).optional() });

export async function PATCH(request: Request, context: { params: Promise<{ documentId: string }> }) {
  try {
    const originError = requireSameOrigin(request);
    if (originError) return originError;
    const { documentId } = await context.params;
    const { supabase, user } = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Acesso restrito à administração." }, { status: 403 });
    const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Revisão inválida." }, { status: 422 });
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("documents").update({ status: parsed.data.status, reviewer_notes: parsed.data.reviewerNotes ?? null, updated_at: new Date().toISOString() }).eq("id", documentId).select().single();
    if (error) return NextResponse.json({ error: "Não foi possível atualizar o documento." }, { status: 500 });
    const { error: profileError } = await admin.from("caregiver_profiles").upsert(
      {
        user_id: data.caregiver_id,
        verification_status: parsed.data.status,
        verified_at: parsed.data.status === "approved" ? new Date().toISOString() : null,
      },
      { onConflict: "user_id" },
    );
    if (profileError) return NextResponse.json({ error: "Documento atualizado, mas o status do cuidador não pôde ser sincronizado." }, { status: 500 });
    await admin.from("audit_logs").insert({ actor_id: user.id, action: `document.${parsed.data.status}`, entity_type: "document", entity_id: documentId, metadata: { reviewer_notes: parsed.data.reviewerNotes ?? null } });
    return NextResponse.json({ document: data });
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
}
