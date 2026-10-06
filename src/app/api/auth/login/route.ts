import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { getClientIp, requireSameOrigin } from "@/lib/security/request";

export async function POST(request: Request) {
  try {
    const originError = requireSameOrigin(request);
    if (originError) return originError;
    const address = getClientIp(request);

    if (!(await rateLimit(`login:${address}`)).allowed) {
      return NextResponse.json(
        { error: "Muitas tentativas. Aguarde um minuto." },
        { status: 429 }
      );
    }

    const { email, password } = await request.json().catch(() => null);

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return NextResponse.json(
        { error: "Informe e-mail e senha." },
        { status: 422 }
      );
    }

    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error || !data.user) {
      return NextResponse.json(
        { error: "E-mail ou senha inválidos." },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("full_name, role, avatar_url, accessible_mode")
      .eq("id", data.user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Perfil não encontrado." },
        { status: 404 }
      );
    }
    const verification = profile.role === "caregiver"
      ? await supabase.from("caregiver_profiles").select("verification_status").eq("user_id", data.user.id).maybeSingle()
      : { data: null, error: null };
    if (verification.error) {
      return NextResponse.json({ error: "Não foi possível verificar o perfil." }, { status: 500 });
    }

    return NextResponse.json(
      {
        profile: {
          name: profile.full_name,
          role: profile.role,
          avatarUrl: profile.avatar_url ? "/api/profile/avatar" : null,
          accessibleMode: profile.accessible_mode ?? false,
          verificationStatus: verification.data?.verification_status ?? "not_submitted",
        },
        message: "Login realizado.",
      },
      { status: 200 }
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("configuration")
    ) {
      return NextResponse.json(
        {
          error:
            "Login indisponível: configure o Supabase no servidor.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Requisição inválida." },
      { status: 400 }
    );
  }
}
