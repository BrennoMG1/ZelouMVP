import { NextResponse } from "next/server";
import { z } from "zod";

import { normalizeDigits } from "@/lib/validation";
import { requireCurrentUser } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";

const profileSchema = z.object({
  fullName: z.string().trim().min(3).max(160),
  phone: z.string().trim().max(20).optional(),
  regionId: z.string().uuid().optional(),
  accessibleMode: z.boolean().optional(),
}).strict();

export async function GET() {
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const { data, error } = await supabase.from("profiles").select("full_name, phone, city, state, accessible_mode, avatar_url, role, verified_regions(id, municipality_id, city, state, district, label)").eq("id", user.id).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });
  const avatarUrl = data.avatar_url ? "/api/profile/avatar" : null;
  return NextResponse.json({ profile: { fullName: data.full_name, email: user.email ?? "", phone: data.phone, city: data.city, state: data.state, region: Array.isArray(data.verified_regions) ? data.verified_regions[0] : data.verified_regions, accessibleMode: data.accessible_mode, role: data.role, avatarUrl } });
}

export async function PATCH(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados de perfil inválidos." }, { status: 422 });

  const { data, error } = await supabase.from("profiles").update({ full_name: parsed.data.fullName, phone: parsed.data.phone ? normalizeDigits(parsed.data.phone) : null, ...(parsed.data.regionId ? { region_id: parsed.data.regionId } : {}), accessible_mode: parsed.data.accessibleMode }).eq("id", user.id).select("full_name, phone, city, state, accessible_mode").single();
  if (error) return NextResponse.json({ error: "Não foi possível atualizar o perfil." }, { status: 500 });
  return NextResponse.json({ profile: data, email: user.email });
}
