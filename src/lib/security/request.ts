import "server-only";

import { NextResponse } from "next/server";

/** Reject cross-origin state-changing requests while allowing non-browser clients. */
export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  try {
    const originUrl = new URL(origin);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost || request.headers.get("host");
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const protocol = forwardedProtocol || new URL(request.url).protocol.replace(":", "");
    const requestOrigin = host ? `${protocol}://${host}` : new URL(request.url).origin;
    if (originUrl.origin === requestOrigin) return null;
  } catch {
    // Treat malformed origins exactly like an untrusted origin.
  }

  return NextResponse.json({ error: "Origem da requisição não permitida." }, { status: 403 });
}

export function getClientIp(request: Request) {
  // This header is trustworthy only when the hosting proxy overwrites it.
  // It is deliberately used only for best-effort throttling, never identity.
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
