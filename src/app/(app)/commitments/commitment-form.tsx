"use client";

import { startTransition, useActionState, useState } from "react";
import { Field, inputClass } from "@/components/ui";
import {
  defaultTrackingMode,
  FREQUENCY_LABELS,
  KIND_LABELS,
  MODE_LABELS,
  staleDueDateSuggestion,
  SUBTYPES,
} from "@/lib/commitments";
import { isISODate, istToday } from "@/lib/engine/dates";
import { COMMITMENT_KINDS, FREQUENCIES, TRACKING_MODES, type CommitmentKind, type Frequency, type TrackingMode } from "@/lib/engine/types";
import { saveCommitment, type CommitmentFormState } from "./actions";

export interface CommitmentFormValues {
  id?: string;
  name: string;
  kind: CommitmentKind;
  subtype: string;
  tracking_mode: TrackingMode;
  amount: string;
  amount_is_estimate: boolean;
  frequency: Frequency;
  next_due_date: string;
  end_date: string;
  maturity_date: string;
  notes: string;
}

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function CommitmentForm({ initial }: { initial: CommitmentFormValues }) {
  const [state, action, pending] = useActionState<CommitmentFormState, FormData>(saveCommitment, {});
  const [kind, setKind] = useState(initial.kind);
  const [subtype, setSubtype] = useState(initial.subtype);
  const [mode, setMode] = useState(initial.tracking_mode);
  const [modeTouched, setModeTouched] = useState(Boolean(initial.id));
  const [frequency, setFrequency] = useState(initial.frequency);
  const [nextDue, setNextDue] = useState(initial.next_due_date);
  const e = state.errors ?? {};

  function changeKind(next: CommitmentKind) {
    const firstSubtype = SUBTYPES[next][0].value;
    setKind(next);
    setSubtype(firstSubtype);
    if (!modeTouched) setMode(defaultTrackingMode(next, firstSubtype));
  }

  function changeSubtype(next: string) {
    setSubtype(next);
    if (!modeTouched) setMode(defaultTrackingMode(kind, next));
  }

  const isInfo = mode === "info";
  const suggestion =
    !isInfo && isISODate(nextDue) ? staleDueDateSuggestion(nextDue, frequency, istToday()) : null;

  return (
    <form
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
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <Field label="Name" htmlFor="name" error={e.name}>
        <input id="name" name="name" defaultValue={initial.name} maxLength={80} className={inputClass} placeholder="e.g. HDFC home loan" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="What is it?" htmlFor="kind" error={e.kind}>
          <select id="kind" name="kind" value={kind} onChange={(ev) => changeKind(ev.target.value as CommitmentKind)} className={inputClass}>
            {COMMITMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type" htmlFor="subtype" error={e.subtype}>
          <select id="subtype" name="subtype" value={subtype} onChange={(ev) => changeSubtype(ev.target.value)} className={inputClass}>
            {SUBTYPES[kind].map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">How should MoneyMap treat it?</legend>
        {TRACKING_MODES.map((m) => (
          <label
            key={m}
            className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${mode === m ? "border-accent" : "border-border"}`}
          >
            <input
              type="radio"
              name="tracking_mode"
              value={m}
              checked={mode === m}
              onChange={() => {
                setMode(m);
                setModeTouched(true);
              }}
              className="mt-1 accent-[var(--accent)]"
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium">{MODE_LABELS[m].label}</span>
              <span className="text-xs text-muted">{MODE_LABELS[m].help}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <Field
        label={isInfo ? "Amount (₹, optional)" : mode === "reminder" ? "Usual amount (₹, optional)" : "Amount each time (₹)"}
        htmlFor="amount"
        error={e.amount}
      >
        <input id="amount" name="amount" inputMode="decimal" defaultValue={initial.amount} className={inputClass} placeholder="1200" />
      </Field>
      {!isInfo && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="amount_is_estimate" defaultChecked={initial.amount_is_estimate} className="accent-[var(--accent)]" />
          The amount varies; this is an estimate
        </label>
      )}

      {!isInfo && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="How often" htmlFor="frequency" error={e.frequency}>
              <select
                id="frequency"
                name="frequency"
                value={frequency}
                onChange={(ev) => setFrequency(ev.target.value as Frequency)}
                className={inputClass}
              >
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_LABELS[f]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={frequency === "one_time" ? "Due date" : "Next due date"} htmlFor="next_due_date" error={e.next_due_date}>
              <input
                id="next_due_date"
                name="next_due_date"
                type="date"
                value={nextDue}
                onChange={(ev) => setNextDue(ev.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          {suggestion && (
            <p role="status" className="rounded-xl border border-border bg-background p-3 text-sm">
              That date is more than one payment ago, so earlier payments would all show as overdue. Did you mean the
              next upcoming date?{" "}
              <button type="button" onClick={() => setNextDue(suggestion)} className="font-medium text-accent underline">
                Use {formatDate(suggestion)}
              </button>
            </p>
          )}
          {frequency !== "one_time" && (
            <Field label="Last payment date (optional)" htmlFor="end_date" error={e.end_date} hint="For loans and RDs that finish on a known date.">
              <input id="end_date" name="end_date" type="date" defaultValue={initial.end_date} className={inputClass} />
            </Field>
          )}
        </>
      )}
      {isInfo && <input type="hidden" name="frequency" value="one_time" />}

      <Field
        label="Maturity or renewal date (optional)"
        htmlFor="maturity_date"
        error={e.maturity_date}
        hint="Shown under Coming up. MoneyMap doesn't calculate returns."
      >
        <input id="maturity_date" name="maturity_date" type="date" defaultValue={initial.maturity_date} className={inputClass} />
      </Field>

      <Field label="Notes (optional)" htmlFor="notes" error={e.notes} hint="Please don't enter account or card numbers.">
        <textarea id="notes" name="notes" defaultValue={initial.notes} maxLength={500} rows={2} className={`${inputClass} h-auto py-2`} />
      </Field>

      {e.form && (
        <p role="alert" className="text-sm text-danger">
          {e.form}
        </p>
      )}

      <button type="submit" disabled={pending} className="h-12 rounded-xl bg-accent font-medium text-accent-foreground disabled:opacity-60">
        {pending ? "Saving…" : initial.id ? "Save changes" : "Add commitment"}
      </button>
    </form>
  );
}
