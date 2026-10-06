import { NextResponse } from "next/server";
import { createSupabaseAdminClient, requireCurrentUser } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";

const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
const maxSize = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const originError = requireSameOrigin(request);
    if (originError) return originError;
    const { user } = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
    const admin = createSupabaseAdminClient();
    const { data: profile, error: profileError } = await admin.from("profiles").select("role").eq("id", user.id).single();
    if (profileError || profile?.role !== "caregiver") return NextResponse.json({ error: "Somente cuidadores podem enviar documentos." }, { status: 403 });
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "O arquivo é obrigatório." }, { status: 422 });
    if (!allowedTypes.has(file.type) || file.size > maxSize) return NextResponse.json({ error: "Arquivo inválido. Use PDF, JPG ou PNG de até 10 MB." }, { status: 422 });

    const path = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const upload = await admin.storage.from("documents").upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) return NextResponse.json({ error: "Não foi possível armazenar o documento." }, { status: 500 });

    const { error } = await admin.from("documents").insert({ caregiver_id: user.id, document_type: "diploma_or_certificate", storage_path: path, status: "under_review" });
    if (error) { await admin.storage.from("documents").remove([path]); return NextResponse.json({ error: "Não foi possível registrar o documento para análise." }, { status: 500 }); }
    const { error: statusError } = await admin.from("caregiver_profiles").upsert(
      { user_id: user.id, verification_status: "under_review" },
      { onConflict: "user_id" },
    );
    if (statusError) return NextResponse.json({ error: "Documento enviado, mas não foi possível atualizar seu status." }, { status: 500 });
    return NextResponse.json({ status: "under_review" }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("configuration")) return NextResponse.json({ error: "Supabase não configurado no servidor." }, { status: 503 });
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
}
