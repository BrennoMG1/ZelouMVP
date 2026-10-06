import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";

const schema = z.object({
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
});

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Use ao menos 8 caracteres, uma letra maiúscula e um número." }, { status: 422 });
    const { supabase, user } = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "A sessão de recuperação expirou. Solicite um novo link." }, { status: 401 });
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) return NextResponse.json({ error: "Não foi possível alterar a senha. Solicite um novo link." }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Não foi possível alterar a senha." }, { status: 500 });
  }
}
