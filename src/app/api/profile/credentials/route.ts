import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/supabase/server";
import { requireSameOrigin } from "@/lib/security/request";
import { rateLimit } from "@/lib/security/rate-limit";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("email"), email: z.string().trim().email().max(254) }).strict(),
  z.object({ action: z.literal("password"), password: z.string().min(8).max(128) }).strict(),
]);
export async function PATCH(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confira o e-mail ou a senha informada." }, { status: 422 });
  if (!(await rateLimit(`credentials:${user.id}`, 5)).allowed) return NextResponse.json({ error: "Aguarde um minuto antes de tentar novamente." }, { status: 429 });
  const change = parsed.data;
  const { data, error } = await supabase.auth.updateUser(change.action === "email" ? { email: change.email } : { password: change.password });
  if (error) return NextResponse.json({ error: "Não foi possível alterar a credencial. Entre novamente e tente outra vez. Os dados do perfil não foram alterados." }, { status: 422 });
  const pending = change.action === "email" && data.user.email !== change.email;
  return NextResponse.json({ email: data.user.email, pending, message: change.action === "password" ? "Senha alterada." : pending ? "Solicitação enviada. Confira as mensagens de confirmação nos seus e-mails. O endereço atual permanece até a confirmação." : "E-mail alterado." }, { headers: { "Cache-Control": "no-store" } });
}
