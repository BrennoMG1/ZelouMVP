import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const rateLimitMode = "shared-database";
export async function rateLimit(key: string, limit = 10) {
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("consume_request_limit", {
      p_key: createHash("sha256").update(key).digest("hex"), p_limit: limit,
    });
    if (error) throw error;
    return { allowed: data === true };
  } catch {
    // Never silently remove protection when the shared store is unavailable.
    console.error("shared_rate_limit_unavailable");
    return { allowed: false };
  }
}
