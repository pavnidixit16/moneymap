"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { isISODate, istToday } from "@/lib/engine/dates";
import { isUuid, requireUser } from "@/lib/data";
import { parseRupees } from "@/lib/money";

export interface ActionResult {
  ok?: boolean;
  error?: string;
}

type DbError = { code?: string; message?: string } | null;

// Messages raised by our own database functions and triggers are written for people,
// so show them; anything else gets a generic message.
function messageFor(error: NonNullable<DbError>): string {
  if (error.code === "23505") return "That date is already recorded. Refresh to see the latest.";
  if (error.code === "22023" && error.message) return error.message;
  if (error.code === "P0002") return "This item no longer exists.";
  return "Couldn't save. Please try again.";
}

interface Item {
  due_date: string;
  outcome: "paid" | "skipped" | "paid_unrecorded";
  amount_paise?: number;
  paid_on?: string;
}

function readPaid(amount: FormDataEntryValue | null, paidOn: FormDataEntryValue | null): { item?: Omit<Item, "due_date" | "outcome">; error?: string } {
  const amount_paise = parseRupees(String(amount ?? ""));
  if (amount_paise === null || amount_paise === 0) return { error: "Enter the amount you paid (above ₹0)." };
  if (amount_paise > 10_000_000_000) return { error: "That amount is too large." };
  const paid_on = String(paidOn ?? "");
  if (!isISODate(paid_on)) return { error: "Enter the date you paid." };
  if (paid_on > istToday()) return { error: "The paid date can't be in the future." };
  return { item: { amount_paise, paid_on } };
}

async function resolve(commitmentId: string, items: Item[]): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!isUuid(commitmentId)) return { error: "This item no longer exists." };
  const { error } = await supabase.rpc("resolve_occurrences", { p_commitment_id: commitmentId, p_items: items });
  if (error) return { error: messageFor(error) };
  refresh();
  return { ok: true };
}

export async function markPaid(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const due_date = String(formData.get("due_date") ?? "");
  if (!isISODate(due_date)) return { error: "Missing due date." };
  const { item, error } = readPaid(formData.get("amount"), formData.get("paid_on"));
  if (error) return { error };
  return resolve(String(formData.get("commitment_id") ?? ""), [{ due_date, outcome: "paid", ...item }]);
}

export async function skipOccurrence(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const due_date = String(formData.get("due_date") ?? "");
  if (!isISODate(due_date)) return { error: "Missing due date." };
  return resolve(String(formData.get("commitment_id") ?? ""), [{ due_date, outcome: "skipped" }]);
}

// Catch up: only the rows the user chose are recorded; "leave" rows are ignored.
export async function catchUp(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const commitmentId = String(formData.get("commitment_id") ?? "");
  const dates = formData.getAll("due_date").map(String);
  const items: Item[] = [];

  for (const due_date of dates) {
    if (!isISODate(due_date)) return { error: "Missing due date." };
    const choice = String(formData.get(`choice_${due_date}`) ?? "leave");
    if (choice === "leave") continue;
    if (choice === "skipped" || choice === "paid_unrecorded") {
      items.push({ due_date, outcome: choice });
    } else if (choice === "paid") {
      const { item, error } = readPaid(formData.get(`amount_${due_date}`), formData.get(`paid_on_${due_date}`));
      if (error) return { error: `${due_date}: ${error}` };
      items.push({ due_date, outcome: "paid", ...item });
    } else {
      return { error: "Choose what happened for each date." };
    }
  }

  if (items.length === 0) return { error: "Nothing selected. Choose what happened for at least one date." };
  const result = await resolve(commitmentId, items);
  if (result.error) return result;
  redirect(`/commitments?tab=upcoming&caughtup=${items.length}`);
}

export async function undoPayment(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const id = String(formData.get("payment_id") ?? "");
  if (!isUuid(id)) return { error: "This payment no longer exists." };
  const { error } = await supabase.rpc("undo_payment", { p_payment_id: id });
  if (error) return { error: messageFor(error) };
  refresh();
  return { ok: true };
}

// Changes the amount or paid date of a paid record. Never touches the schedule.
export async function editPayment(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const id = String(formData.get("payment_id") ?? "");
  if (!isUuid(id)) return { error: "This payment no longer exists." };
  const { item, error } = readPaid(formData.get("amount"), formData.get("paid_on"));
  if (error) return { error };
  const { data, error: dbError } = await supabase
    .from("commitment_payments")
    .update(item!)
    .eq("id", id)
    .eq("outcome", "paid")
    .select("id");
  if (dbError) return { error: messageFor(dbError) };
  if (!data?.length) return { error: "Only paid records can be edited." };
  refresh();
  return { ok: true };
}
