import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { getClientIp, requireSameOrigin } from "@/lib/security/request";
import { z } from "zod";

const emailSchema = z.string().trim().email();

export async function POST(request: Request) {
  try {
    const originError = requireSameOrigin(request);
    if (originError) return originError;
    if (!(await rateLimit(`forgot-password:${getClientIp(request)}`, 5)).allowed) {
      return NextResponse.json({ error: "Muitas tentativas. Aguarde um minuto." }, { status: 429 });
    }
    const body = await request.json().catch(() => null);
    const parsed = emailSchema.safeParse(typeof body.email === "string" ? body.email.toLowerCase() : "");
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Informe seu e-mail." },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();

    const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
    const appUrl = configuredUrl && /^https?:\/\//.test(configuredUrl) ? configuredUrl : new URL(request.url).origin;
    const redirectTo = new URL("/reset-password", appUrl).toString();

    await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo,
    });

    return NextResponse.json({
      success: true,
      message:
        "Se existir uma conta com esse e-mail, enviaremos um link para redefinir sua senha.",
    });
  } catch {
    return NextResponse.json({
      success: true,
      message:
        "Se existir uma conta com esse e-mail, enviaremos um link para redefinir sua senha.",
    });
  }
}
