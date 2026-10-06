import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";
import { databaseError } from "@/lib/api-error";

const schema = z.object({ opportunityId: z.string().uuid(), message: z.string().trim().max(2000).optional() });

export async function GET() {
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile) return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });
  const query = profile.role === "caregiver"
    ? supabase.from("applications").select("id, opportunity_id, status, message, created_at, opportunities(title, approximate_region)").eq("caregiver_id", user.id)
    : supabase.from("applications").select("id, opportunity_id, caregiver_id, status, message, created_at, opportunities!inner(title, approximate_region, client_id)").eq("opportunities.client_id", user.id);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Não foi possível carregar candidaturas." }, { status: 500 });
  return NextResponse.json({ applications: data ?? [] });
}

export async function PATCH(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const { supabase, user } = await requireCurrentUser(); if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const parsed = z.object({ id: z.string().uuid(), status: z.enum(["withdrawn", "shortlisted", "rejected"]) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ação inválida." }, { status: 422 });
  const { error } = await supabase.rpc("manage_care_application", { p_id: parsed.data.id, p_status: parsed.data.status });
  if (error) return databaseError(error, "Não foi possível alterar a candidatura.");
  return NextResponse.json({ saved: true });
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Candidatura inválida." }, { status: 422 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "caregiver") return NextResponse.json({ error: "Somente cuidadores podem se candidatar." }, { status: 403 });
  const { data: verification, error: verificationError } = await supabase.from("caregiver_profiles").select("verification_status").eq("user_id", user.id).maybeSingle();
  if (verificationError) return NextResponse.json({ error: "Não foi possível verificar a documentação." }, { status: 500 });
  if (!verification || !["under_review", "approved"].includes(verification.verification_status)) return NextResponse.json({ error: "Envie sua documentação antes de se candidatar." }, { status: 403 });
  const { data: opportunity } = await supabase.from("opportunities").select("id").eq("id", parsed.data.opportunityId).eq("status", "published").maybeSingle();
  if (!opportunity) return NextResponse.json({ error: "Oportunidade indisponível." }, { status: 404 });
  const { data, error } = await supabase.from("applications").insert({ opportunity_id: opportunity.id, caregiver_id: user.id, message: parsed.data.message }).select("id, opportunity_id, status, message, created_at").single();
  if (error?.code === "23505") return NextResponse.json({ error: "Você já se candidatou a esta oportunidade." }, { status: 409 });
  if (error) return NextResponse.json({ error: "Não foi possível registrar a candidatura." }, { status: 500 });
  return NextResponse.json({ application: data }, { status: 201 });
}
