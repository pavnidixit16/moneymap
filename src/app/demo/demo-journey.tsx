"use client";

import { ChevronRight, Plus, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { commitmentIconName, IconBubble } from "@/components/icons";
import { Badge, inputClass, primaryButton } from "@/components/ui";
import { DEMO_TYPES, newDemoCommitment, type DemoJourneyStart, type DemoTypeKey } from "@/lib/demo-data";
import { addDays } from "@/lib/engine/dates";
import { computeOverview } from "@/lib/engine/overview";
import type { Commitment } from "@/lib/engine/types";
import { formatDate } from "@/lib/format";
import { formatINR, paiseToInput, parseRupees } from "@/lib/money";

const PAYDAYS = [1, 5, 7, 10, 15, 25, 28, 30];

// The guest demo's one journey: your pay → what's already committed → money left until
// payday. Everything stays in this browser tab (nothing is sent or saved); the number is
// recalculated by MoneyMap's real engine on every change.
export function DemoJourney({ start }: { start: DemoJourneyStart }) {
  const [income, setIncome] = useState(paiseToInput(start.profile.monthly_income_paise));
  const [payday, setPayday] = useState(start.profile.payday_day);
  const [commitments, setCommitments] = useState<Commitment[]>(start.commitments);
  const [added, setAdded] = useState(0);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ type: "subscription" as DemoTypeKey, name: "", amount: "", dueDate: addDays(start.today, 3) });
  const [formError, setFormError] = useState<string | null>(null);
  const [lastChange, setLastChange] = useState<string | null>(null);
  const answerRef = useRef<HTMLElement>(null);
  // After a change, bring the number back into view so the visitor sees it move.
  const showAnswer = () => answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const incomePaise = parseRupees(income) ?? 0;
  const o = useMemo(
    () =>
      computeOverview({
        profile: { ...start.profile, monthly_income_paise: incomePaise, payday_day: payday },
        transactions: start.spending,
        commitments,
        payments: [],
        today: start.today,
      }),
    [start, incomePaise, payday, commitments],
  );
  const counted = new Set(o.dueItems.filter((i) => i.bucket !== "reminder").map((i) => i.commitmentId));

  function addCommitment() {
    const c = newDemoCommitment({ type: form.type, name: form.name, amountPaise: parseRupees(form.amount), dueDate: form.dueDate }, `added-${added + 1}`);
    if (!c) {
      setFormError("Add a name, an amount above ₹0 and a due date.");
      return;
    }
    const before = o.remainingPaise;
    const after = computeOverview({
      profile: { ...start.profile, monthly_income_paise: incomePaise, payday_day: payday },
      transactions: start.spending,
      commitments: [...commitments, c],
      payments: [],
      today: start.today,
    }).remainingPaise;
    setCommitments((list) => [...list, c]);
    setAdded((n) => n + 1);
    setAdding(false);
    setFormError(null);
    setForm((f) => ({ ...f, name: "", amount: "" }));
    setLastChange(
      after === before
        ? `${c.name} added. It doesn’t change this estimate: ${c.tracking_mode === "reminder" ? "a card bill is a reminder, because its purchases are already in spending" : "it’s due after payday"}.`
        : `${c.name} added: ${formatINR(before - after)} less left until payday.`,
    );
    showAnswer();
  }

  function remove(c: Commitment) {
    setCommitments((list) => list.filter((x) => x.id !== c.id));
    setLastChange(`${c.name} removed.`);
    showAnswer();
  }

  function reset() {
    setIncome(paiseToInput(start.profile.monthly_income_paise));
    setPayday(start.profile.payday_day);
    setCommitments(start.commitments);
    setAdding(false);
    setLastChange("Demo reset to the starting example.");
    showAnswer();
  }

  const when = (c: Commitment) =>
    c.tracking_mode === "reminder" ? "" : counted.has(c.id) ? " · before payday" : " · after payday";
  const tag = (c: Commitment) =>
    c.tracking_mode === "reminder" ? <Badge>Reminder only</Badge> : counted.has(c.id) ? <Badge tone="accent">Counted</Badge> : null;

  return (
    <div className="flex flex-col gap-5">
      {/* 3. The answer, kept at the top so every change is visible at once. */}
      <section ref={answerRef} aria-label="Money left until payday" className="flex flex-col gap-2 rounded-3xl bg-gradient-to-br from-hero-from to-hero-to p-5 text-white shadow-lg">
        <p className="text-sm text-white/85">Money left until payday (estimate)</p>
        <p className="text-4xl font-bold tracking-tight tabular-nums" data-testid="demo-left" aria-live="polite">
          {formatINR(o.remainingPaise)}
        </p>
        <p className="text-sm text-white/85">
          Payday {formatDate(o.cycle.nextPayday, false)} · after what’s already committed and recorded
        </p>
        {lastChange && (
          <p role="status" className="rounded-xl bg-white/15 px-3 py-2 text-sm">
            {lastChange}
          </p>
        )}
        <details className="group rounded-xl bg-white/10 px-3 py-2 text-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
            How it’s worked out
            <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
          </summary>
          <ul className="flex flex-col gap-1.5 pt-3">
            <li className="flex justify-between gap-3"><span>Take-home pay</span><span className="tabular-nums">+ {formatINR(o.incomePaise)}</span></li>
            <li className="flex justify-between gap-3"><span>Everyday spending so far</span><span className="tabular-nums">− {formatINR(o.spendingPaise)}</span></li>
            <li className="flex justify-between gap-3"><span>Bills and EMIs due before payday</span><span className="tabular-nums">− {formatINR(o.obligationsDuePaise)}</span></li>
            <li className="flex justify-between gap-3"><span>SIPs due before payday</span><span className="tabular-nums">− {formatINR(o.investmentsDuePaise)}</span></li>
            <li className="flex justify-between gap-3 border-t border-white/25 pt-2 font-semibold"><span>Money left until payday</span><span className="tabular-nums">{formatINR(o.remainingPaise)}</span></li>
          </ul>
          <p className="pt-2 text-xs text-white/80">Credit-card bills set as reminders aren’t counted: their purchases are already in spending.</p>
        </details>
      </section>

      {/* 1. Pay */}
      <section aria-labelledby="pay-title" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        <h2 id="pay-title" className="font-semibold">
          <span className="text-accent">1.</span> Your pay
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Take-home pay (₹)
            <input inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Payday
            <select value={payday} onChange={(e) => setPayday(Number(e.target.value))} className={inputClass}>
              {PAYDAYS.map((d) => (
                <option key={d} value={d}>
                  {d === 30 ? "30th / month end" : `${d}${d === 1 ? "st" : "th"}`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs text-muted">Pay cycle {formatDate(o.cycle.start, false)} – {formatDate(o.cycle.end, false)}. Everyday spending so far: {formatINR(o.spendingPaise)} (example).</p>
      </section>

      {/* 2. Commitments */}
      <section aria-labelledby="commit-title" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        <h2 id="commit-title" className="font-semibold">
          <span className="text-accent">2.</span> What’s already committed
        </h2>
        <ul className="divide-y divide-border" aria-label="Commitments">
          {commitments.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-3">
              <IconBubble name={commitmentIconName(c.kind, c.subtype)} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-semibold">{c.name}</span>
                <span className="flex flex-wrap items-center gap-1 text-xs text-muted">
                  Due {c.next_due_date ? formatDate(c.next_due_date, false) : "—"}
                  {when(c)} {tag(c)}
                </span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{formatINR(c.amount_paise)}</span>
              <button type="button" onClick={() => remove(c)} aria-label={`Remove ${c.name}`} className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2">
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
          {commitments.length === 0 && <li className="py-3 text-sm text-muted">Nothing committed. Add rent, an EMI or a SIP below.</li>}
        </ul>

        {adding ? (
          <div className="flex flex-col gap-3 rounded-xl bg-surface-2 p-3">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Type
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as DemoTypeKey })} className={inputClass}>
                {DEMO_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Name
              <input value={form.name} maxLength={80} placeholder="e.g. Gym membership" onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm font-medium">
                Amount (₹)
                <input inputMode="decimal" value={form.amount} placeholder="e.g. 1500" onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Next due date
                <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className={inputClass} />
              </label>
            </div>
            {formError && (
              <p role="alert" className="text-sm text-danger">
                {formError}
              </p>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={addCommitment} className={`${primaryButton} flex-1`}>
                Add to my month
              </button>
              <button type="button" onClick={() => setAdding(false)} className="h-12 rounded-full border border-border px-5 text-sm font-semibold">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="flex h-11 items-center justify-center gap-2 rounded-full bg-accent-soft text-sm font-semibold text-accent">
            <Plus className="size-4" aria-hidden /> Add a commitment
          </button>
        )}
      </section>

      <div className="flex flex-col items-center gap-3 pb-4 text-sm">
        <button type="button" onClick={reset} className="flex items-center gap-1 font-semibold text-muted underline">
          <RotateCcw className="size-4" aria-hidden /> Reset demo
        </button>
        <Link href="/login?next=/settings" className="font-semibold text-accent underline">
          Do this with my own numbers (sign in with Google)
        </Link>
      </div>
    </div>
  );
}
