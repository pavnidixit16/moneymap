"use server";

import { dataChanged } from "@/lib/data-changed";
import { redirect } from "next/navigation";
import { commitmentFormValues, commitmentSchema, fieldErrorsFrom, type FieldErrors } from "@/lib/commitments";
import { getCommitment, isUuid, requireUser } from "@/lib/data";

export interface CommitmentFormState {
  errors?: FieldErrors;
}

const MONTH_BASED = new Set(["monthly", "quarterly", "half_yearly", "yearly"]);

export async function saveCommitment(_prev: CommitmentFormState, formData: FormData): Promise<CommitmentFormState> {
  const { supabase } = await requireUser();

  const parsed = commitmentSchema.safeParse(commitmentFormValues(formData));
  if (!parsed.success) return { errors: fieldErrorsFrom(parsed.error) };
  const input = parsed.data;

  const id = String(formData.get("id") ?? "");
  const existing = id ? await getCommitment(id) : null;
  if (id && !existing) return { errors: { form: "This commitment no longer exists." } };

  // The anchor day remembers "the 31st" through short months. Reset it only when the
  // user actually changes the schedule; otherwise an item on 28 Feb would lose its 31st.
  const scheduleChanged =
    !existing || existing.next_due_date !== input.next_due_date || existing.frequency !== input.frequency;
  const anchor_day =
    input.next_due_date && MONTH_BASED.has(input.frequency)
      ? scheduleChanged
        ? Number(input.next_due_date.slice(8))
        : (existing?.anchor_day ?? Number(input.next_due_date.slice(8)))
      : null;

  const row = { ...input, anchor_day };
  const { error } = existing
    ? await supabase.from("commitments").update(row).eq("id", existing.id)
    : await supabase.from("commitments").insert(row);

  if (error) return { errors: { form: "Couldn't save. Please check the details and try again." } };
  dataChanged();
  redirect("/commitments?tab=all");
}

async function setStatus(formData: FormData, status: "active" | "cancelled") {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) redirect("/commitments");
  const { error } = await supabase.from("commitments").update({ status }).eq("id", id);
  if (!error) dataChanged();
  redirect(`/commitments/${id}${error ? "?error=status" : ""}`);
}

export async function cancelCommitment(formData: FormData) {
  await setStatus(formData, "cancelled");
}

export async function reactivateCommitment(formData: FormData) {
  await setStatus(formData, "active");
}

export async function deleteCommitment(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) redirect("/commitments");
  // Payment history is removed with it (database cascade); the page warns about this.
  const { error } = await supabase.from("commitments").delete().eq("id", id);
  if (!error) dataChanged();
  redirect(error ? `/commitments/${id}?error=delete` : "/commitments");
}
