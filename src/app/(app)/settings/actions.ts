"use server";

import { redirect } from "next/navigation";
import { fieldErrorsFrom, settingsSchema, type FieldErrors } from "@/lib/commitments";
import { requireUser } from "@/lib/data";

export interface SettingsState {
  errors?: FieldErrors;
  saved?: boolean;
}

export async function saveSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { userId, supabase } = await requireUser();

  const parsed = settingsSchema.safeParse({
    display_name: formData.get("display_name") ?? "",
    income: formData.get("income") ?? "",
    budget: formData.get("budget") ?? "",
    payday_day: formData.get("payday_day") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrorsFrom(parsed.error) };

  const firstTime = formData.get("first_time") === "1";
  const { error } = await supabase
    .from("profiles")
    .update({ ...parsed.data, ...(firstTime ? { onboarded_at: new Date().toISOString() } : {}) })
    .eq("id", userId);
  if (error) return { errors: { form: "Couldn't save your settings. Please try again." } };

  if (firstTime) redirect("/commitments?welcome=1");
  return { saved: true };
}
