import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";
import { databaseError } from "@/lib/api-error";
export async function GET(request: Request) {
  const { supabase, user } = await requireCurrentUser(); if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("caregiverId") ?? user.id;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Perfil inválido." }, { status: 422 });
  const { data, error } = await supabase.rpc("care_applicant_profile", { p_caregiver: id });
  if (error) return databaseError(error, "Não foi possível carregar o perfil profissional.");
  return NextResponse.json({ professional: data }, { headers: { "Cache-Control": "no-store" } });
}
export async function PATCH(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const { supabase, user } = await requireCurrentUser(); if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const parsed = z.object({ bio: z.string().trim().max(3000), experienceYears: z.number().int().min(0).max(80), specialties: z.array(z.string().trim().min(2).max(100)).max(20), hourlyRate: z.number().positive().max(10000), availability: z.object({ days: z.array(z.number().int().min(0).max(6)).max(7), notes: z.string().trim().max(1000) }) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confira os dados profissionais." }, { status: 422 });
  const p = parsed.data;
  const { data, error } = await supabase.from("caregiver_profiles").update({ bio: p.bio, experience_years: p.experienceYears, specialties: p.specialties, hourly_rate: p.hourlyRate, availability: p.availability }).eq("user_id", user.id).select("user_id").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Envie sua documentação para iniciar o perfil profissional." }, { status: 409 });
  return NextResponse.json({ saved: true });
}
