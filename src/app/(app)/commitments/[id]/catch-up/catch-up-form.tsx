"use client";

import { useHydrated } from "@/components/use-hydrated";
import { startTransition, useActionState, useState } from "react";
import { inputClass } from "@/components/ui";
import { istToday } from "@/lib/engine/dates";
import { formatDate } from "@/lib/format";
import { paiseToInput } from "@/lib/money";
import { catchUp, type ActionResult } from "../../payment-actions";

type Choice = "leave" | "paid" | "skipped" | "paid_unrecorded";

export function CatchUpForm({
  commitmentId,
  expectedPaise,
  rows,
}: {
  commitmentId: string;
  expectedPaise: number;
  rows: { date: string; allowUnrecorded: boolean }[];
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(catchUp, {});
  const hydrated = useHydrated();
  const [choices, setChoices] = useState<Record<string, Choice>>(() => Object.fromEntries(rows.map((r) => [r.date, "leave"])));
  const chosen = Object.values(choices).filter((c) => c !== "leave").length;

  return (
    <form
      method="post"
      onSubmit={(ev) => {
        ev.preventDefault();
        const data = new FormData(ev.currentTarget);
        startTransition(() => action(data));
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <input type="hidden" name="commitment_id" value={commitmentId} />
      {rows.map(({ date, allowUnrecorded }) => {
        const choice = choices[date];
        const options: { value: Choice; label: string }[] = [
          { value: "leave", label: "Leave unresolved (stays overdue)" },
          { value: "paid", label: "Paid" },
          { value: "skipped", label: "Didn't need to pay" },
          ...(allowUnrecorded ? [{ value: "paid_unrecorded" as const, label: "Paid earlier, amount not recorded" }] : []),
        ];
        return (
          <fieldset key={date} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
            <input type="hidden" name="due_date" value={date} />
            <legend className="px-1 font-medium">Due {formatDate(date)}</legend>
            {options.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`choice_${date}`}
                  value={o.value}
                  checked={choice === o.value}
                  onChange={() => setChoices((prev) => ({ ...prev, [date]: o.value }))}
                  className="accent-[var(--accent)]"
                />
                {o.label}
              </label>
            ))}
            {choice === "paid" && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Amount paid (₹)
                  <input name={`amount_${date}`} inputMode="decimal" defaultValue={expectedPaise > 0 ? paiseToInput(expectedPaise) : ""} aria-label={`Amount paid for ${date}`} className={inputClass} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Paid on
                  <input name={`paid_on_${date}`} type="date" defaultValue={date} max={istToday()} aria-label={`Paid on for ${date}`} className={inputClass} />
                </label>
              </div>
            )}
          </fieldset>
        );
      })}

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={!hydrated || pending || chosen === 0}
        className="h-12 rounded-full bg-accent font-semibold text-accent-foreground disabled:opacity-60"
      >
        {pending ? "Saving…" : chosen === 0 ? "Choose at least one date" : `Save ${chosen} date${chosen === 1 ? "" : "s"}`}
      </button>
    </form>
  );
}
