import { NextResponse } from "next/server";

import { createSupabaseAdminClient, requireCurrentUser } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxSize = 2 * 1024 * 1024;

export async function GET() {
  const { supabase, user } = await requireCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const { data: profile, error } = await supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle();
  if (error) return new NextResponse(null, { status: 500 });
  if (!profile?.avatar_url) return new NextResponse(null, { status: 404 });
  const { data, error: downloadError } = await createSupabaseAdminClient().storage.from("avatars").download(profile.avatar_url);
  if (downloadError || !data) return new NextResponse(null, { status: 404 });
  if (!allowedTypes.has(data.type)) return new NextResponse(null, { status: 415 });
  return new NextResponse(data, { headers: { "Content-Type": data.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const { user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size > maxSize) return NextResponse.json({ error: "Use JPG, PNG ou WEBP de até 2 MB." }, { status: 422 });
  const extension = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
  const path = `${user.id}/avatar.${extension}`;
  const admin = createSupabaseAdminClient();
  const { error: uploadError } = await admin.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) return NextResponse.json({ error: "Não foi possível enviar a imagem." }, { status: 500 });
  const { error: profileError } = await admin.from("profiles").update({ avatar_url: path }).eq("id", user.id);
  if (profileError) return NextResponse.json({ error: "Imagem enviada, mas o perfil não foi atualizado." }, { status: 500 });
  return NextResponse.json({ avatarUrl: `/api/profile/avatar?v=${crypto.randomUUID()}` }, { headers: { "Cache-Control": "no-store" } });
}
