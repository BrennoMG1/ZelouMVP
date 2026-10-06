import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";

const schema = z.object({ contractId: z.string().uuid(), body: z.string().trim().min(1).max(3000) });

export async function GET() {
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const { data, error } = await supabase.from("care_diary_entries").select("id, contract_id, body, created_at").order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "Não foi possível carregar o diário." }, { status: 500 });
  return NextResponse.json({ entries: data ?? [] });
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Registro inválido." }, { status: 422 });
  const { data, error } = await supabase.from("care_diary_entries").insert({ contract_id: parsed.data.contractId, author_id: user.id, body: parsed.data.body }).select("id, contract_id, body, created_at").single();
  if (error) return NextResponse.json({ error: "Não foi possível salvar o registro." }, { status: 500 });
  return NextResponse.json({ entry: data }, { status: 201 });
}
