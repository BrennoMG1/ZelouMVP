import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";

const planSchema = z.object({
  contractId: z.string().uuid(), name: z.string().trim().min(1).max(160),
  dosage: z.string().trim().min(1).max(160), instructions: z.string().trim().max(3000),
  intervalHours: z.number().int().min(1).max(720), startsAt: z.string().datetime(), endsAt: z.string().datetime().nullable(),
}).refine((v) => !v.endsAt || v.endsAt >= v.startsAt, "O término deve ser posterior ao primeiro horário.");
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("stop"), medicationId: z.string().uuid() }),
  z.object({ action: z.literal("record"), medicationId: z.string().uuid(), scheduledAt: z.string().datetime(), administeredAt: z.string().datetime(), outcome: z.enum(["given", "skipped"]), notes: z.string().trim().max(1000) }).refine(v => v.outcome !== "skipped" || !!v.notes, "Informe o motivo da dose não administrada."),
]);

export async function GET(request: Request) {
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const contractId = params.get("contractId");
  const page = z.coerce.number().int().min(0).max(100000).safeParse(params.get("page") ?? 0);
  if (!page.success) return NextResponse.json({ error: "Página inválida." }, { status: 422 });
  if (contractId && !z.string().uuid().safeParse(contractId).success) return NextResponse.json({ error: "Contrato inválido." }, { status: 422 });
  let query = supabase.from("contract_medications").select("*, contracts!inner(status, starts_at, ends_at)").order("next_due_at");
  if (contractId) query = query.eq("contract_id", contractId);
  else query = query.eq("active", true).eq("contracts.status", "active");
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Não foi possível carregar medicamentos." }, { status: 500 });
  const history = contractId && data?.length ? await supabase.from("medication_administrations").select("*").in("medication_id", data.map(m => m.id)).order("scheduled_at", { ascending: false }).order("id", { ascending: false }).range(page.data * 100, page.data * 100 + 100) : { data: [], error: null };

  return NextResponse.json({ medications: data, administrations: history.error ? [] : history.data?.slice(0, 100), historyError: history.error ? "Não foi possível carregar o histórico. Tente novamente." : null, hasMore: (history.data?.length ?? 0) > 100 }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const parsed = planSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 });
  const p = parsed.data;
  const { error } = await supabase.from("contract_medications").insert({ contract_id: p.contractId, name: p.name, dosage: p.dosage, instructions: p.instructions, interval_hours: p.intervalHours, next_due_at: p.startsAt, ends_at: p.endsAt });
  if (error) return NextResponse.json({ error: "Não foi possível cadastrar. Apenas o responsável pode adicionar medicamentos a um contrato em andamento." }, { status: 400 });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confira o horário e informe o motivo das doses não administradas." }, { status: 422 });
  const p = parsed.data;
  const { error } = p.action === "stop"
    ? await supabase.rpc("stop_contract_medication", { p_medication_id: p.medicationId })
    : await supabase.rpc("record_medication_dose", { p_medication_id: p.medicationId, p_scheduled_at: p.scheduledAt, p_administered_at: p.administeredAt, p_outcome: p.outcome, p_notes: p.notes });
  if (error) return NextResponse.json({ error: "Não foi possível atualizar. Confira sua permissão e o horário; a dose pode já ter sido registrada. Atualize a lista." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
