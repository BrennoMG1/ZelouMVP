import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/supabase/server";

export async function GET() {
  try {
    const { supabase, user } = await requireCurrentUser();
    if (!user) return NextResponse.json({ authenticated: false }, { status: 401 });
    const { data: profile, error } = await supabase.from("profiles").select("full_name, role, avatar_url, accessible_mode").eq("id", user.id).single();
    if (error || !profile) return NextResponse.json({ authenticated: false }, { status: 404 });
    const verification = profile.role === "caregiver"
      ? await supabase.from("caregiver_profiles").select("verification_status").eq("user_id", user.id).maybeSingle()
      : { data: null, error: null };
    if (verification.error) return NextResponse.json({ authenticated: false }, { status: 500 });
    const avatarUrl = profile.avatar_url ? "/api/profile/avatar" : null;
    return NextResponse.json({
      authenticated: true,
      profile: {
        name: profile.full_name,
        role: profile.role,
        verificationStatus: verification.data?.verification_status ?? "not_submitted",
        avatarUrl,
        accessibleMode: profile.accessible_mode ?? false,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ authenticated: false, error: "Supabase não configurado." }, { status: 503 });
  }
}
