import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/supabase/server";

export async function GET() {
  const { supabase, user } = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  const [profile, elderly, opportunities, contracts, reports, consents, requests, medications, administrations] = await Promise.all([
    supabase.from("profiles").select("id, role, full_name, phone, city, state, accessible_mode, created_at, updated_at").eq("id", user.id).maybeSingle(),
    supabase.from("elderly_profiles").select("id, client_id, display_name, age_range, care_needs, routine_notes, consent_sensitive_data, created_at").eq("client_id", user.id),
    supabase.from("opportunities").select("id, title, description, care_type, approximate_region, schedule, requirements, hourly_rate, estimated_monthly, status, created_at").eq("client_id", user.id),
    supabase.from("contracts").select("id, opportunity_id, client_id, caregiver_id, gross_amount, platform_fee_rate, platform_fee, caregiver_net_amount, starts_at, ends_at, status, created_at").or(`client_id.eq.${user.id},caregiver_id.eq.${user.id}`),
    supabase.from("reports").select("id, contract_id, author_id, week_start, report_type, content, submitted_at, created_at").eq("author_id", user.id),
    supabase.from("consents").select("id, consent_type, version, granted, granted_at, revoked_at").eq("user_id", user.id),
    supabase.from("privacy_requests").select("id, request_type, status, details, created_at, completed_at").eq("user_id", user.id),
    supabase.from("contract_medications").select("*"),
    supabase.from("medication_administrations").select("*"),
  ]);
  if ([profile, elderly, opportunities, contracts, reports, consents, requests, medications, administrations].some((result) => result.error)) {
    return NextResponse.json({ error: "Não foi possível preparar a exportação dos dados." }, { status: 500 });
  }
  const extra = await Promise.all([
    supabase.from("appointments").select("*"), supabase.from("care_tasks").select("*"), supabase.from("care_reviews").select("*"),
    supabase.from("contract_changes").select("*"), supabase.from("contract_versions").select("*"), supabase.from("contract_care_details").select("*"),
    supabase.from("care_files").select("id, contract_id, uploaded_by, name, mime_type, size_bytes, created_at"),
    supabase.from("care_diary_entries").select("*"), supabase.from("messages").select("id, conversation_id, sender_id, body, kind, created_at"),
    supabase.from("stripe_test_accounts").select("*"), supabase.from("stripe_test_payments").select("*"),
  ]);
  if (extra.some(result => result.error)) return NextResponse.json({ error: "Não foi possível exportar os dados de acompanhamento." }, { status: 500 });
  const payload = { exportedAt: new Date().toISOString(), userId: user.id, profile: profile.data, elderlyProfiles: elderly.data ?? [], opportunities: opportunities.data ?? [], contracts: contracts.data ?? [], reports: reports.data ?? [], consents: consents.data ?? [], privacyRequests: requests.data ?? [], medications: medications.data ?? [], medicationAdministrations: administrations.data ?? [], appointments: extra[0].data, tasks: extra[1].data, reviews: extra[2].data, contractChanges: extra[3].data, contractVersions: extra[4].data, careDetails: extra[5].data, files: extra[6].data, diary: extra[7].data, messages: extra[8].data };
  return new NextResponse(JSON.stringify({ ...payload, stripeTestAccounts: extra[9].data, stripeTestPayments: extra[10].data }, null, 2), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="zelou-dados-${user.id}.json"`, "Cache-Control": "no-store" } });
}
