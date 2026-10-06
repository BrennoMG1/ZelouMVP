import { databaseError } from "@/lib/api-error";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient, requireCurrentUser } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";
import { scheduleSchema } from "@/lib/care-planning";

const createSchema = z.object({
  opportunityId: z.string().uuid(), caregiverId: z.string().uuid(), grossAmount: z.number().positive().max(1_000_000),
  terms: z.object({ conditions: z.string().trim().min(10).max(5000), schedule: scheduleSchema }),
});

export async function GET() {
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const { data, error } = await supabase.from("contracts").select("id, opportunity_id, client_id, caregiver_id, gross_amount, platform_fee_rate, platform_fee, caregiver_net_amount, starts_at, ends_at, status, terms, service_snapshot, snapshot_legacy, document_version, client_signed_at, caregiver_signed_at, created_at, opportunities(title)").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Não foi possível carregar contratos." }, { status: 500 });
  if (!data?.length) return NextResponse.json({ contracts: [] });
  // Enrich only parties of contracts authorized by the caller's RLS session.
  const partyIds = [...new Set(data.flatMap(contract => [contract.client_id, contract.caregiver_id]))];
  const admin = createSupabaseAdminClient();
  const { data: parties, error: partiesError } = await admin.from("profiles").select("id, full_name").in("id", partyIds);
  if (partiesError) return NextResponse.json({ error: "Não foi possível carregar as partes dos contratos." }, { status: 500 });
  return NextResponse.json({ contracts: data.map(contract => ({ ...contract, opportunities: contract.service_snapshot,
    client_name: parties?.find(party => party.id === contract.client_id)?.full_name ?? "Cliente / responsável",
    caregiver_name: parties?.find(party => party.id === contract.caregiver_id)?.full_name ?? "Cuidador",
  })) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Contrato inválido." }, { status: 422 });
  const p = parsed.data;
  const { data, error } = await supabase.rpc("propose_contract", { p_opportunity: p.opportunityId, p_caregiver: p.caregiverId, p_amount: p.grossAmount, p_start: null, p_end: null, p_terms: p.terms });
  if (error) return databaseError(error, "Não foi possível criar a proposta.");
  return NextResponse.json({ contract: data }, { status: 201 });
}
