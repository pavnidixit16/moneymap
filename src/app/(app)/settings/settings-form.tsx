"use client";

import { useHydrated } from "@/components/use-hydrated";
import { startTransition, useActionState } from "react";
import { Field, inputClass, primaryButton } from "@/components/ui";
import { saveSettings, type SettingsState } from "./actions";

export interface SettingsValues {
  display_name: string;
  income: string;
  budget: string;
  payday_day: number;
  firstTime: boolean;
}

export function SettingsForm({ initial }: { initial: SettingsValues }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettings, {});
  const hydrated = useHydrated();
  const e = state.errors ?? {};

  return (
    <form
      method="post"
      // Submit manually: a plain form action resets every field afterwards, which would
      // wipe what the user typed when validation fails.
      onSubmit={(ev) => {
        ev.preventDefault();
        const data = new FormData(ev.currentTarget);
        startTransition(() => action(data));
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <input type="hidden" name="first_time" value={initial.firstTime ? "1" : "0"} />

      <Field label="Monthly take-home pay (₹)" htmlFor="income" error={e.income} hint="What reaches your bank account after tax and EPF.">
        <input id="income" name="income" inputMode="decimal" defaultValue={initial.income} className={inputClass} placeholder="80000" />
      </Field>

      <Field label="Payday (day of the month)" htmlFor="payday_day" error={e.payday_day} hint="If a month is shorter, payday moves to its last day.">
        <select id="payday_day" name="payday_day" defaultValue={initial.payday_day} className={inputClass}>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Spending budget per pay cycle (₹)"
        htmlFor="budget"
        error={e.budget}
        hint="For everyday spending like food, groceries and shopping. Bills and EMIs are tracked separately."
      >
        <input id="budget" name="budget" inputMode="decimal" defaultValue={initial.budget} className={inputClass} placeholder="20000" />
      </Field>

      <Field label="Your name (optional)" htmlFor="display_name" error={e.display_name}>
        <input id="display_name" name="display_name" defaultValue={initial.display_name} className={inputClass} />
      </Field>

      {e.form && (
        <p role="alert" className="text-sm text-danger">
          {e.form}
        </p>
      )}
      {state.saved && (
        <p role="status" className="rounded-xl border border-success/40 p-2 text-sm text-success">
          Saved. Your dashboard now uses these settings.
        </p>
      )}

      <button
        type="submit"
        disabled={!hydrated || pending}
        className={primaryButton}
      >
        {pending ? "Saving…" : initial.firstTime ? "Save and continue" : "Save settings"}
      </button>
    </form>
  );
}
