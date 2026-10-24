"use server";

import { requireUser } from "@/lib/data";
import { feedbackSchema } from "@/lib/feedback";

export interface FeedbackResult {
  ok?: boolean;
  replaced?: boolean; // the tester had sent feedback before; this replaces it
  errors?: Record<string, string>;
  error?: string;
}

// One response per tester: sending again (a retry, a double tap, or changed answers)
// replaces the earlier one instead of adding a duplicate.
export async function submitFeedback(input: unknown): Promise<FeedbackResult> {
  const { supabase, userId } = await requireUser();
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0] ?? "form")] ??= i.message;
    return { errors };
  }
  const { data: before } = await supabase.from("feedback_responses").select("id").eq("user_id", userId).maybeSingle();
  const { error } = await supabase.from("feedback_responses").upsert({ user_id: userId, ...parsed.data }, { onConflict: "user_id" });
  if (error) return { error: "Couldn't send your feedback. Your answers are still here; please try again." };
  return { ok: true, replaced: Boolean(before) };
}
