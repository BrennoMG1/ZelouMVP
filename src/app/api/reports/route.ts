import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";

const schema = z.object({ contractId: z.string().uuid(), weekStart: z.string().date(), content: z.object({ title: z.string().trim().min(3).max(160), summary: z.string().trim().min(3).max(5000), final: z.boolean().optional() }) });

export async function GET() {
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const { data, error } = await supabase.from("reports").select("id, contract_id, author_id, week_start, report_type, content, submitted_at, created_at").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Não foi possível carregar relatórios." }, { status: 500 });
  return NextResponse.json({ reports: data ?? [] });
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Relatório inválido." }, { status: 422 });
  const { data: contract } = await supabase.from("contracts").select("id, client_id, caregiver_id, status").eq("id", parsed.data.contractId).maybeSingle();
  if (!contract || !["active", "completed"].includes(contract.status)) return NextResponse.json({ error: "Contrato indisponível para relatório." }, { status: 404 });
  const reportType = contract.client_id === user.id ? "client" : contract.caregiver_id === user.id ? "caregiver" : null;
  if (!reportType) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  const { data, error } = await supabase.from("reports").insert({ contract_id: contract.id, author_id: user.id, week_start: parsed.data.weekStart, report_type: reportType, content: parsed.data.content, submitted_at: new Date().toISOString() }).select("id, contract_id, author_id, week_start, report_type, content, submitted_at, created_at").single();
  if (error) return NextResponse.json({ error: "Não foi possível salvar o relatório." }, { status: 500 });
  return NextResponse.json({ report: data }, { status: 201 });
}
