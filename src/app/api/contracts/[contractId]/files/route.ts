import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient, requireCurrentUser } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";
type Context = { params: Promise<{ contractId: string }> };
export async function GET(request: Request, context: Context) {
  const { supabase, user } = await requireCurrentUser(); if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const { contractId } = await context.params;
  if (!z.string().uuid().safeParse(contractId).success) return NextResponse.json({ error: "Contrato inválido." }, { status: 422 });
  const fileId = new URL(request.url).searchParams.get("fileId");
  if (fileId) {
    if (!z.string().uuid().safeParse(fileId).success) return NextResponse.json({ error: "Arquivo inválido." }, { status: 422 });
    const { data: file } = await supabase.from("care_files").select("path, name").eq("contract_id", contractId).eq("id", fileId).maybeSingle();
    if (!file) return NextResponse.json({ error: "Arquivo não encontrado ou acesso encerrado." }, { status: 404 });
    const { data, error } = await createSupabaseAdminClient().storage.from("care-files").createSignedUrl(file.path, 60, { download: file.name });
    if (error) return NextResponse.json({ error: "Download indisponível." }, { status: 500 });
    return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
  const { data, error } = await supabase.from("care_files").select("id, name, size_bytes, uploaded_by, created_at").eq("contract_id", contractId).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Não foi possível carregar arquivos." }, { status: 500 });
  return NextResponse.json({ files: data, currentUserId: user.id }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request, context: Context) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const { supabase, user } = await requireCurrentUser(); if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const { contractId } = await context.params;
  if (!z.string().uuid().safeParse(contractId).success) return NextResponse.json({ error: "Contrato inválido." }, { status: 422 });
  const { data: contract } = await supabase.from("contracts").select("client_id, caregiver_id, status").eq("id", contractId).maybeSingle();
  if (!contract || !(contract.status === "active" || (contract.status === "pending_signatures" && contract.client_id === user.id))) return NextResponse.json({ error: "Contrato indisponível para envio." }, { status: 403 });
  if (Number(request.headers.get("content-length")) > 6 * 1024 * 1024) return NextResponse.json({ error: "Envie um arquivo de até 5 MB." }, { status: 413 });
  const form = await request.formData().catch(() => null); const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 5 * 1024 * 1024 || form?.get("consent") !== "true") return NextResponse.json({ error: "Confirme a autorização e envie PDF, JPEG ou PNG de até 5 MB." }, { status: 422 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = bytes.subarray(0, 5).toString() === "%PDF-" ? "application/pdf" : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg" : bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png" : null;
  if (!mime || mime !== file.type) return NextResponse.json({ error: "O conteúdo não corresponde a um PDF, JPEG ou PNG válido." }, { status: 422 });
  const admin = createSupabaseAdminClient(); const id = crypto.randomUUID(); const path = `${contractId}/${id}`;
  const upload = await admin.storage.from("care-files").upload(path, bytes, { contentType: mime, upsert: false });
  if (upload.error) return NextResponse.json({ error: "Não foi possível enviar o arquivo." }, { status: 500 });
  const { error } = await admin.from("care_files").insert({ id, contract_id: contractId, uploaded_by: user.id, name: file.name.replace(/[\r\n/\\]/g, "_").slice(0, 160), path, mime_type: mime, size_bytes: file.size });
  if (error) { await admin.storage.from("care-files").remove([path]); return NextResponse.json({ error: "Não foi possível registrar o arquivo." }, { status: 500 }); }
  return NextResponse.json({ saved: true }, { status: 201 });
}
export async function DELETE(request: Request, context: Context) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const { supabase, user } = await requireCurrentUser(); if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const { contractId } = await context.params; const parsed = z.object({ id: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.string().uuid().safeParse(contractId).success) return NextResponse.json({ error: "Arquivo inválido." }, { status: 422 });
  const { data: file } = await supabase.from("care_files").select("path, uploaded_by").eq("contract_id", contractId).eq("id", parsed.data.id).maybeSingle();
  if (!file || file.uploaded_by !== user.id) return NextResponse.json({ error: "Apenas quem enviou pode remover este arquivo." }, { status: 403 });
  const admin = createSupabaseAdminClient(); const storage = await admin.storage.from("care-files").remove([file.path]);
  if (storage.error) return NextResponse.json({ error: "Não foi possível remover o arquivo." }, { status: 500 });
  const { error } = await admin.from("care_files").delete().eq("id", parsed.data.id);
  if (error) return NextResponse.json({ error: "Arquivo removido; atualização da lista pendente. Tente novamente." }, { status: 500 });
  return NextResponse.json({ saved: true });
}
