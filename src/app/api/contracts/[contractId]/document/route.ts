import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/supabase/server";
import { scheduleSummary } from "@/lib/care-planning";

export async function GET(request: Request, context: { params: Promise<{ contractId: string }> }) {
  const { supabase, user } = await requireCurrentUser(); if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const { contractId } = await context.params;
  if (!z.string().uuid().safeParse(contractId).success) return NextResponse.json({ error: "Contrato inválido." }, { status: 422 });
  const version = new URL(request.url).searchParams.get("version");
  const result = version ? await supabase.from("contract_versions").select("document").eq("contract_id", contractId).eq("version", Number(version)).maybeSingle() : await supabase.from("contracts").select("*").eq("id", contractId).maybeSingle();
  if (result.error || !result.data) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  const c = version ? result.data.document : result.data;
  const text = [`ZELOU! — CONTRATO ${c.id}`, `Versão: ${c.document_version} · Estado: ${c.status}`, `Responsável: ${c.client_id}`, `Cuidador: ${c.caregiver_id}`, `Serviço: ${c.service_snapshot?.title}`, `Descrição: ${c.service_snapshot?.description}`, `Região: ${c.service_snapshot?.approximate_region}`, `Escala: ${scheduleSummary(c.service_snapshot?.schedule)}`, `Tarefas e requisitos: ${c.service_snapshot?.requirements ?? ""}`, `Valor total: R$ ${c.gross_amount}`, `Taxa: R$ ${c.platform_fee} · Líquido: R$ ${c.caregiver_net_amount}`, `Condições: ${JSON.stringify(c.terms, null, 2)}`, `Aceite do responsável: ${c.client_signed_at ?? "Pendente"}`, `Aceite do cuidador: ${c.caregiver_signed_at ?? "Pendente"}`, "Valores contratuais não comprovam pagamento.", "", "Registro completo:", JSON.stringify(c, null, 2)].join("\n");
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="contrato-${contractId}-v${c.document_version}.txt"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
