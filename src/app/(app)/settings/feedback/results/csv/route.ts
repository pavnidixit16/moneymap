import { NextResponse } from "next/server";
import { toCsv, type FeedbackRow } from "@/lib/feedback";
import { createClient, getVerifiedUserId } from "@/lib/supabase/server";

// Admin-only CSV of all feedback. Testers are numbered; no names or emails are included.
export async function GET() {
  const userId = await getVerifiedUserId();
  if (!userId) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const { data: admin } = await supabase.from("app_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (!admin) return new NextResponse("Not found", { status: 404 });
  const { data, error } = await supabase
    .from("feedback_responses")
    .select("parts_tried, ease, issues, issue_details, return_intent, comments, quote_ok, created_at, updated_at")
    .order("created_at", { ascending: true });
  if (error) return new NextResponse("Couldn't load feedback", { status: 500 });
  return new NextResponse(toCsv(data as FeedbackRow[]), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="moneymap-feedback.csv"',
      "cache-control": "no-store",
    },
  });
}
