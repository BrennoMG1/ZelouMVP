import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";

const requestSchema = z.object({ requestType: z.enum(["export", "correction", "deletion", "consent_revocation"]), details: z.string().trim().max(2000).optional() });

export async function GET() {
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const { data, error } = await supabase.from("privacy_requests").select("id, request_type, status, details, response_note, created_at, completed_at").eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Não foi possível carregar solicitações." }, { status: 500 });
  return NextResponse.json({ requests: data ?? [] });
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Solicitação de privacidade inválida." }, { status: 422 });
  const { data, error } = await supabase.from("privacy_requests").insert({ user_id: user.id, request_type: parsed.data.requestType, details: parsed.data.details }).select("id, request_type, status, created_at").single();
  if (error) return NextResponse.json({ error: "Não foi possível registrar a solicitação." }, { status: 500 });
  return NextResponse.json({ request: data }, { status: 201 });
}
