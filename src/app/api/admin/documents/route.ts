import { NextResponse } from "next/server";
import { requireCurrentUser, createSupabaseAdminClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const { supabase, user } = await requireCurrentUser();
  if (!user) return { supabase, user: null, forbidden: true };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return { supabase, user, forbidden: profile?.role !== "admin" && profile?.role !== "super_admin" };
}

export async function GET() {
  try {
    const access = await requireAdmin();
    if (!access.user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
    if (access.forbidden) return NextResponse.json({ error: "Acesso restrito à administração." }, { status: 403 });
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("documents").select("id, caregiver_id, document_type, storage_path, status, reviewer_notes, created_at, updated_at").order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: "Não foi possível carregar documentos." }, { status: 500 });
    return NextResponse.json({ documents: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }
}
