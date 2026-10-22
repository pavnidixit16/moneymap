"use server";

import { dataChanged } from "@/lib/data-changed";
import { redirect } from "next/navigation";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/commitments";
import { isUuid, requireUser } from "@/lib/data";
import { istToday } from "@/lib/engine/dates";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/capture/types";
import { transactionSchema } from "@/lib/transactions";

export interface TransactionFormState {
  errors?: FieldErrors;
}

export async function saveTransaction(_prev: TransactionFormState, formData: FormData): Promise<TransactionFormState> {
  const { supabase } = await requireUser();
  const parsed = transactionSchema(istToday()).safeParse({
    kind: String(formData.get("kind") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    category: String(formData.get("category") ?? ""),
    occurred_on: String(formData.get("occurred_on") ?? ""),
    note: String(formData.get("note") ?? ""),
  });
  if (!parsed.success) return { errors: fieldErrorsFrom(parsed.error) };
  const method = String(formData.get("payment_method") ?? "");
  if (method && !PAYMENT_METHODS.includes(method as PaymentMethod)) return { errors: { payment_method: "Choose how you paid" } };
  const row = { ...parsed.data, payment_method: (method || null) as PaymentMethod | null };

  const id = String(formData.get("id") ?? "");
  if (id && !isUuid(id)) return { errors: { form: "This entry no longer exists." } };
  const { data, error } = id
    ? await supabase.from("transactions").update(row).eq("id", id).select("id")
    : await supabase.from("transactions").insert(row).select("id");
  if (error) return { errors: { form: "Couldn't save. Please check the details and try again." } };
  if (!data?.length) return { errors: { form: "This entry no longer exists." } };

  dataChanged();
  redirect(`/spending?on=${parsed.data.occurred_on}`);
}

export async function deleteTransaction(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const on = String(formData.get("on") ?? "");
  if (!isUuid(id)) redirect("/spending");
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (!error) dataChanged();
  redirect(error ? `/spending/${id}?error=delete` : `/spending${on ? `?on=${on}` : ""}`);
}
