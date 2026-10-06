import { NextResponse } from "next/server";

export function databaseError(error: { code?: string; message?: string }, fallback: string) {
  const status = error.code === "42501" ? 403 : ["23505", "22023", "23514", "23P01"].includes(error.code ?? "") ? 409 : 500;
  const reference = crypto.randomUUID();
  // Do not log payloads, database messages or health information.
  console.error("database_request_failed", { reference, code: error.code });
  const safeBusinessMessage = error.code === "22023" && error.message && !error.message.includes("\n") ? error.message : null;
  return NextResponse.json({ error: status === 403 ? "Ação não permitida. Confira sua participação, documentação e horário." : status === 409 ? safeBusinessMessage ?? "A operação conflita com o estado atual. Confira os dados e atualize a página." : fallback, reference }, { status });
}
