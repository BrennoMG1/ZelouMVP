import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();
    if (error) return NextResponse.json({ error: "Não foi possível encerrar a sessão." }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Não foi possível encerrar a sessão." }, { status: 500 });
  }
}
