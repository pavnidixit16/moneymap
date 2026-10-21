"use client";

import { startTransition, useActionState, useState } from "react";
import { Field, inputClass } from "@/components/ui";
import { istToday } from "@/lib/engine/dates";
import { EXPENSE_CATEGORIES } from "@/lib/transactions";
import { saveTransaction, type TransactionFormState } from "./actions";

export interface TransactionFormValues {
  id?: string;
  kind: "expense" | "income";
  amount: string;
  category: string;
  occurred_on: string;
  note: string;
}

export function TransactionForm({ initial }: { initial: TransactionFormValues }) {
  const [state, action, pending] = useActionState<TransactionFormState, FormData>(saveTransaction, {});
  const [kind, setKind] = useState(initial.kind);
  const e = state.errors ?? {};

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        const data = new FormData(ev.currentTarget);
        startTransition(() => action(data));
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <fieldset className="flex gap-1 rounded-xl border border-border bg-surface p-1">
        <legend className="sr-only">Type</legend>
        {(["expense", "income"] as const).map((k) => (
          <label
            key={k}
            className={`flex-1 cursor-pointer rounded-lg py-2 text-center text-sm font-medium ${kind === k ? "bg-accent text-accent-foreground" : "text-muted"}`}
          >
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
            {k === "expense" ? "Expense" : "Extra income"}
          </label>
        ))}
      </fieldset>

      <Field label="Amount (₹)" htmlFor="amount" error={e.amount}>
        <input id="amount" name="amount" inputMode="decimal" defaultValue={initial.amount} className={inputClass} placeholder="450" autoFocus={!initial.id} />
      </Field>

      {kind === "expense" ? (
        <Field label="Category" htmlFor="category" error={e.category} hint="Rent, bills and EMIs belong under Commitments.">
          <select id="category" name="category" defaultValue={initial.category} className={inputClass}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <>
          <input type="hidden" name="category" value="income" />
          <p className="text-xs text-muted">
            For money beyond your usual take-home pay, like a bonus or freelance payment. It&apos;s added to this pay
            cycle&apos;s income.
          </p>
        </>
      )}

      <Field label="Date" htmlFor="occurred_on" error={e.occurred_on}>
        <input id="occurred_on" name="occurred_on" type="date" defaultValue={initial.occurred_on || istToday()} className={inputClass} />
      </Field>

      <Field label="Note (optional)" htmlFor="note" error={e.note}>
        <input id="note" name="note" defaultValue={initial.note} maxLength={280} className={inputClass} />
      </Field>

      {e.form && (
        <p role="alert" className="text-sm text-danger">
          {e.form}
        </p>
      )}
      <button type="submit" disabled={pending} className="h-12 rounded-xl bg-accent font-medium text-accent-foreground disabled:opacity-60">
        {pending ? "Saving…" : initial.id ? "Save changes" : kind === "expense" ? "Add expense" : "Add income"}
      </button>
    </form>
  );
}
