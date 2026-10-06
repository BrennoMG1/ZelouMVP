import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";
import { databaseError } from "@/lib/api-error";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("details"), address: z.string().trim().max(1000), careNotes: z.string().trim().max(5000), emergencyContact: z.string().trim().max(500), consent: z.literal(true) }),
  z.object({ action: z.literal("task"), title: z.string().trim().min(3).max(160), category: z.enum(["food", "water", "hygiene", "mobility", "other"]), dueAt: z.string().datetime(), repeatDays: z.number().int().min(1).max(90) }),
  z.object({ action: z.literal("record"), taskId: z.string().uuid(), status: z.enum(["done", "skipped", "cancelled"]), notes: z.string().trim().max(3000) }),
  z.object({ action: z.literal("review"), rating: z.number().int().min(1).max(5), comment: z.string().trim().max(2000) }),
]);
export async function GET(_request: Request, context: { params: Promise<{ contractId: string }> }) {
  const { supabase, user } = await requireCurrentUser(); if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const { contractId } = await context.params;
  if (!z.string().uuid().safeParse(contractId).success) return NextResponse.json({ error: "Contrato inválido." }, { status: 422 });
  const params = new URL(_request.url).searchParams;
  const page = z.coerce.number().int().min(0).max(10000).safeParse(params.get("page") ?? 0);
  const status = z.enum(["all", "pending", "done", "skipped", "cancelled"]).safeParse(params.get("taskStatus") ?? "pending");
  if (!page.success || !status.success) return NextResponse.json({ error: "Filtro inválido." }, { status: 422 });
  let tasksQuery = supabase.from("care_tasks").select("*").eq("contract_id", contractId).order("due_at").order("id").range(page.data * 50, page.data * 50 + 50);
  if (status.data !== "all") tasksQuery = tasksQuery.eq("status", status.data);
  const results = await Promise.all([
    supabase.from("contracts").select("id").eq("id", contractId).maybeSingle(),
    supabase.from("contract_care_details").select("address, care_notes, emergency_contact").eq("contract_id", contractId).maybeSingle(),
    tasksQuery,
    supabase.from("contract_changes").select("*").eq("contract_id", contractId).order("created_at", { ascending: false }).limit(30),
    supabase.from("care_reviews").select("*").eq("contract_id", contractId),
    supabase.from("contract_versions").select("version, archived_at").eq("contract_id", contractId).order("version", { ascending: false }),
  ]);
  if (results.some(result => result.error)) return NextResponse.json({ error: "Não foi possível carregar o acompanhamento." }, { status: 500 });
  if (!results[0].data) return NextResponse.json({ error: "Contrato não encontrado." }, { status: 404 });
  const tasks = results[2].data ?? [];
  return NextResponse.json({ currentUserId: user.id, details: results[1].data, tasks: tasks.slice(0, 50), hasMoreTasks: tasks.length > 50, changes: results[3].data, reviews: results[4].data, versions: results[5].data }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request, context: { params: Promise<{ contractId: string }> }) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const { supabase, user } = await requireCurrentUser(); if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const { contractId } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.string().uuid().safeParse(contractId).success) return NextResponse.json({ error: "Dados inválidos. Confira os campos obrigatórios." }, { status: 422 });
  const p = parsed.data;
  let result;
  if (p.action === "details") {
    result = await supabase.from("contract_care_details").upsert({ contract_id: contractId, address: p.address, care_notes: p.careNotes, emergency_contact: p.emergencyContact, updated_at: new Date().toISOString() });
  } else if (p.action === "review") {
    result = await supabase.rpc("submit_care_review", { p_contract: contractId, p_rating: p.rating, p_comment: p.comment });
  } else {
    if (p.action === "record") {
      const { data } = await supabase.from("care_tasks").select("id").eq("id", p.taskId).eq("contract_id", contractId).maybeSingle();
      if (!data) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
    }
    result = await supabase.rpc("manage_care_task", { p_id: p.action === "record" ? p.taskId : null, p_data: { ...p, contractId } });
  }
  if (result.error) return databaseError(result.error, "Não foi possível salvar o acompanhamento.");
  return NextResponse.json({ saved: true });
}
