import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";
import { databaseError } from "@/lib/api-error";
import { scheduleSchema } from "@/lib/care-planning";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["sign", "cancel", "complete"]) }),
  z.object({ action: z.literal("terminate"), reason: z.string().trim().min(10).max(3000) }),
  z.object({ action: z.literal("propose_change"), schedule: scheduleSchema, grossAmount: z.number().positive().max(1000000), conditions: z.string().trim().min(10).max(5000) }),
  z.object({ action: z.enum(["accept_change", "reject_change", "withdraw_change"]), changeId: z.string().uuid() }),
]);
export async function PATCH(request: Request, context: { params: Promise<{ contractId: string }> }) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  const { contractId } = await context.params;
  if (!parsed.success || !z.string().uuid().safeParse(contractId).success) return NextResponse.json({ error: "Ação inválida." }, { status: 422 });
  const { data, error } = ["sign", "cancel", "complete"].includes(parsed.data.action)
    ? await supabase.rpc("transition_contract", { p_contract: contractId, p_action: parsed.data.action })
    : await supabase.rpc("change_care_contract", { p_contract: contractId, p_data: parsed.data });
  if (error) return databaseError(error, "Não foi possível atualizar o contrato.");
  return NextResponse.json({ contract: data });
}
