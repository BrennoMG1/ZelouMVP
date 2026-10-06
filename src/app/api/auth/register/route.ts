import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeDigits, registrationSchema } from "@/lib/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { getClientIp, requireSameOrigin } from "@/lib/security/request";

export async function POST(request: Request) {
  try {
    const originError = requireSameOrigin(request);
    if (originError) return originError;
    const address = getClientIp(request);
    if (!(await rateLimit(`register:${address}`, 5)).allowed) return NextResponse.json({ error: "Muitas tentativas. Aguarde um minuto." }, { status: 429 });
    const payload = await request.json().catch(() => null);
    const parsed = registrationSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos.", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
    }

    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) {
      return NextResponse.json({ error: "Cadastro indisponível: configure o Supabase no ambiente do servidor." }, { status: 503 });
    }

    const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.name, role: parsed.data.role },
    });
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Não foi possível criar a conta com estes dados." }, { status: 409 });
    }

    const { error: profileError } = await supabase.from("profiles").insert({
      id: authData.user.id,
      role: parsed.data.role,
      full_name: parsed.data.name,
      phone: normalizeDigits(parsed.data.phone),
    });
    if (profileError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: "Não foi possível criar o perfil." }, { status: 500 });
    }

    const { error: consentError } = await supabase.from("consents").insert({
      user_id: authData.user.id,
      consent_type: "terms_and_privacy",
      version: "2026-09-22",
      granted: true,
    });
    if (consentError) {
      await supabase.from("profiles").delete().eq("id", authData.user.id);
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: "Não foi possível registrar o aceite dos termos." }, { status: 500 });
    }
    const sessionClient = await createSupabaseServerClient();
    const { error: signInError } = await sessionClient.auth.signInWithPassword({
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
    });
    if (signInError) {
      return NextResponse.json({ error: "Conta criada, mas não foi possível iniciar a sessão. Entre com seu e-mail e senha." }, { status: 500 });
    }
    return NextResponse.json({ message: "Conta criada com sucesso.", profile: { name: parsed.data.name, role: parsed.data.role, verificationStatus: "not_submitted" } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
}
