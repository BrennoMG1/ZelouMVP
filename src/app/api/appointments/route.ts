import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";
import { databaseError } from "@/lib/api-error";

const schema = z.object({ contractId: z.string().uuid(), title: z.string().trim().min(3).max(160), description: z.string().trim().max(3000).optional(), startsAt: z.string().datetime(), endsAt: z.string().datetime() });

export async function GET() {
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const { data, error } = await supabase.from("appointments").select("id, contract_id, title, description, starts_at, ends_at, completed_at, created_at, status, checked_in_at, checked_out_at, reason, replacement_requested_at, replacement_reason, contracts(caregiver_id, service_snapshot)").order("starts_at");
  if (error) return NextResponse.json({ error: "Não foi possível carregar a agenda." }, { status: 500 });
  return NextResponse.json({ appointments: data ?? [], currentUserId: user.id });
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || new Date(parsed.data.endsAt) <= new Date(parsed.data.startsAt)) return NextResponse.json({ error: "Compromisso inválido." }, { status: 422 });
  const { data: contract } = await supabase.from("contracts").select("id, status").eq("id", parsed.data.contractId).maybeSingle();
  if (!contract || contract.status !== "active") return NextResponse.json({ error: "Contrato ativo não encontrado." }, { status: 404 });
  const { data, error } = await supabase.rpc("manage_care_appointment", { p_id: null, p_data: parsed.data });
  if (error) return databaseError(error, "Não foi possível criar o compromisso.");
  return NextResponse.json({ appointment: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const { supabase, user } = await requireCurrentUser(); if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const parsed = z.discriminatedUnion("action", [
    z.object({ id: z.string().uuid(), action: z.enum(["checkin", "checkout"]) }),
    z.object({ id: z.string().uuid(), action: z.enum(["cancel", "missed"]), reason: z.string().trim().min(3).max(3000) }),
    z.object({ id: z.string().uuid(), action: z.literal("reschedule"), reason: z.string().trim().min(3).max(3000), startsAt: z.string().datetime(), endsAt: z.string().datetime() }),
    z.object({ id: z.string().uuid(), action: z.literal("replacement"), reason: z.string().trim().min(10).max(3000), publish: z.boolean() }),
  ]).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confira os horários e justifique a alteração." }, { status: 422 });
  const { data, error } = parsed.data.action === "replacement"
    ? await supabase.rpc("request_care_replacement", { p_appointment: parsed.data.id, p_reason: parsed.data.reason, p_publish: parsed.data.publish })
    : await supabase.rpc("manage_care_appointment", { p_id: parsed.data.id, p_data: parsed.data });
  if (error) return databaseError(error, "Não foi possível alterar o compromisso.");
  return NextResponse.json({ appointment: data });
}
