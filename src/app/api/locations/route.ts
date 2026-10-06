import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient, requireCurrentUser } from "@/lib/supabase/server";
import { municipalities, resolveRegion } from "@/lib/locations";
import { states } from "@/lib/care-planning";
import { requireSameOrigin } from "@/lib/security/request";
import { rateLimit } from "@/lib/security/rate-limit";

export async function GET(request: Request) {
  const { user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const state = z.enum(states).safeParse(new URL(request.url).searchParams.get("state"));
  if (!state.success) return NextResponse.json({ error: "Selecione uma UF válida." }, { status: 422 });
  try { return NextResponse.json({ municipalities: await municipalities(state.data) }); }
  catch { return NextResponse.json({ error: "Consulta de municípios indisponível. Tente novamente." }, { status: 503 }); }
}
export async function POST(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const { user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  if (!(await rateLimit(`locations:${user.id}`, 30)).allowed) return NextResponse.json({ error: "Muitas consultas. Aguarde um minuto." }, { status: 429 });
  const parsed = z.object({ municipalityId: z.string().regex(/^\d{7}$/).optional(), cep: z.string().regex(/^\d{8}$/).optional() }).refine(value => Boolean(value.municipalityId) !== Boolean(value.cep)).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Informe um município ou CEP válido." }, { status: 422 });
  try {
    const region = await resolveRegion(parsed.data);
    const { data, error } = await createSupabaseAdminClient().from("verified_regions").upsert(region, { onConflict: "municipality_id,district" }).select("id, municipality_id, city, state, district, label").single();
    if (error) throw new Error("Não foi possível salvar a região validada.");
    return NextResponse.json({ region: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Não foi possível validar a região." }, { status: 503 }); }
}
