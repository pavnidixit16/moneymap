"use server";

import { dataChanged } from "@/lib/data-changed";
import { isUuid, requireUser } from "@/lib/data";

export interface ReviewState {
  error?: string;
}

// Keep / Review set the review status; Cancelled stops future projections (history is kept);
// Reactivate undoes a cancellation.
export async function setReview(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!isUuid(id)) return { error: "This subscription no longer exists." };

  const update =
    decision === "keep" || decision === "review"
      ? { review_status: decision }
      : decision === "cancelled"
        ? { status: "cancelled" }
        : decision === "reactivate"
          ? { status: "active", review_status: "keep" }
          : null;
  if (!update) return { error: "Choose Keep, Review or Cancelled." };

  const { data, error } = await supabase
    .from("commitments")
    .update(update)
    .eq("id", id)
    .eq("kind", "subscription")
    .select("id");
  if (error || !data?.length) return { error: "Couldn't update this subscription. Please try again." };
  dataChanged();
  return {};
}
