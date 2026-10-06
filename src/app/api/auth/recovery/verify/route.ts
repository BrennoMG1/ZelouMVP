import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";

const schema = z.object({ code: z.string().min(1).max(2048) });

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Link de recuperação inválido." }, { status: 422 });
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(parsed.data.code);
    if (error) return NextResponse.json({ error: "O link de recuperação é inválido ou expirou." }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Não foi possível validar o link de recuperação." }, { status: 500 });
  }
}
