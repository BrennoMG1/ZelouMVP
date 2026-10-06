import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";
import { scheduleSchema } from "@/lib/care-planning";
import { databaseError } from "@/lib/api-error";

const opportunitySchema = z.object({
  title: z.string().trim().min(5, "O título deve ter pelo menos 5 caracteres.").max(120, "O título deve ter no máximo 120 caracteres."),
  description: z.string().trim().min(10, "A descrição deve ter pelo menos 10 caracteres.").max(5000, "A descrição deve ter no máximo 5000 caracteres."),
  careType: z.string().trim().min(2, "Selecione ou informe o tipo de cuidado.").max(80),
  regionId: z.string().uuid("Selecione uma região validada."),
  schedule: scheduleSchema,
  requirements: z.string().trim().max(3000).optional(),
  hourlyRate: z.number().positive("Informe um valor por hora maior que zero.").max(10000, "O valor por hora deve ser de até R$ 10.000."),
  estimatedMonthly: z.number().nonnegative().max(1000000).optional(),
  elderlyId: z.string().uuid().optional(),
});

async function getRole(supabase: Awaited<ReturnType<typeof requireCurrentUser>>["supabase"], userId: string) {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).single();
  return data?.role;
}

export async function GET() {
  try {
    const { supabase, user } = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
    const role = await getRole(supabase, user.id);
    if (role !== "caregiver" && role !== "client") return NextResponse.json({ error: "Perfil sem permissão." }, { status: 403 });
    const query = supabase.from("opportunities").select("id, title, description, care_type, approximate_region, region_id, verified_regions(id, municipality_id, city, state, district, label), schedule, requirements, hourly_rate, estimated_monthly, status, created_at").order("created_at", { ascending: false });
    const { data, error } = role === "caregiver" ? await query.eq("status", "published") : await query.eq("client_id", user.id);
    if (error) return NextResponse.json({ error: "Não foi possível carregar oportunidades." }, { status: 500 });
    return NextResponse.json({ opportunities: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const originError = requireSameOrigin(request);
    if (originError) return originError;
    const { supabase, user } = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
    const role = await getRole(supabase, user.id);
    if (role !== "client") return NextResponse.json({ error: "Somente família ou responsável pode publicar oportunidades." }, { status: 403 });
    const parsed = opportunitySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map(issue => issue.message).join(" "), fields: parsed.error.flatten().fieldErrors }, { status: 422 });
    const input = parsed.data;
    if (input.elderlyId) {
      const { data: elderlyProfile } = await supabase.from("elderly_profiles").select("id").eq("id", input.elderlyId).eq("client_id", user.id).maybeSingle();
      if (!elderlyProfile) return NextResponse.json({ error: "Perfil da pessoa idosa inválido." }, { status: 422 });
    }
    const { data, error } = await supabase.rpc("save_care_opportunity", { p_id: null, p_data: input });
    if (error) return databaseError(error, "Não foi possível publicar a oportunidade.");
    return NextResponse.json({ opportunity: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const payload = await request.json().catch(() => null);
  const id = z.string().uuid().safeParse(payload?.id);
  const parsed = payload?.status ? z.object({ status: z.enum(["published", "paused", "closed"]) }).safeParse(payload) : opportunitySchema.safeParse(payload);
  if (!id.success || !parsed.success) return NextResponse.json({ error: "Confira a região, escala e dados da vaga." }, { status: 422 });
  const { data, error } = await supabase.rpc("save_care_opportunity", { p_id: id.data, p_data: parsed.data });
  if (error) return databaseError(error, "Não foi possível atualizar a vaga.");
  return NextResponse.json({ opportunity: data });
}
