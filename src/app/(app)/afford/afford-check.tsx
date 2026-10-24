"use client";

import { CalendarClock, CircleCheck, Compass, Info, PiggyBank, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { inputClass } from "@/components/ui";
import {
  AFTER_MESSAGES,
  assessAfterPayday,
  assessPurchase,
  monthlyShare,
  NOT_NOW,
  PLAN_MONTHS,
  type AffordInput,
  type AffordLevel,
} from "@/lib/engine/afford";
import type { ISODate } from "@/lib/engine/dates";
import type { DueItem } from "@/lib/engine/overview";
import { formatDate } from "@/lib/format";
import { formatINR, paiseToInput, parseRupees } from "@/lib/money";

// Calm tones only: no red, no warning sirens. Shortfalls use the brand colour, not alarm.
const TONE: Record<AffordLevel, { icon: typeof Info; box: string; iconClass: string; label: string }> = {
  comfortable: { icon: CircleCheck, box: "border-success/30 bg-success/5", iconClass: "text-success", label: "Looks manageable" },
  tight: { icon: Info, box: "border-warning/30 bg-warning/5", iconClass: "text-warning", label: "A little tighter" },
  short: { icon: Compass, box: "border-accent/30 bg-accent-soft", iconClass: "text-accent", label: "Worth a second look" },
  incomplete: { icon: Info, box: "border-border bg-surface-2", iconClass: "text-muted", label: "Not enough information yet" },
};

const signed = (p: number) => (p < 0 ? `−${formatINR(-p)}` : formatINR(p));

export function AffordCheck({ input, next }: { input: AffordInput; next: { items: DueItem[]; end: ISODate } }) {
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [when, setWhen] = useState<"now" | "after">("now");
  const [planOpen, setPlanOpen] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const paise = parseRupees(amount);
  const o = input.overview;

  const now = useMemo(() => (paise ? assessPurchase(input, paise) : null), [input, paise]);
  const later = useMemo(() => (paise ? assessAfterPayday(input, next, paise) : null), [input, next, paise]);
  const level: AffordLevel | null = when === "now" ? (now?.level ?? null) : now?.level === "incomplete" ? "incomplete" : (later?.level ?? null);
  const tone = level ? TONE[level] : null;
  const what = label.trim() || "this purchase";

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          How much is it? (₹)
          <input ref={amountRef} inputMode="decimal" placeholder="e.g. 6000" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          What is it for? (optional)
          <input value={label} maxLength={60} placeholder="e.g. new headphones" onChange={(e) => setLabel(e.target.value)} className={inputClass} />
        </label>
        <div role="group" aria-label="When" className="grid grid-cols-2 gap-1 rounded-full border border-border p-1">
          {(["now", "after"] as const).map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={when === w}
              onClick={() => setWhen(w)}
              className={`rounded-full py-2 text-xs font-semibold ${when === w ? "bg-accent text-accent-foreground" : "text-muted"}`}
            >
              {w === "now" ? "Before payday" : `After payday (${formatDate(o.cycle.nextPayday, false)})`}
            </button>
          ))}
        </div>
        {amount !== "" && !paise && <p className="text-sm text-warning">Enter an amount above ₹0, like 6000 or 1299.50.</p>}
      </section>

      {now && tone && level && (
        <section aria-live="polite" aria-label="Estimate" className={`flex animate-[mm-rise_300ms_ease-out] flex-col gap-3 rounded-2xl border p-4 ${tone.box}`}>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <tone.icon className={`size-5 ${tone.iconClass}`} aria-hidden /> {tone.label}
          </p>

          {level === "incomplete" ? (
            <>
              <p>{now.message}</p>
              <p className="text-sm">
                Add your take-home pay and payday in{" "}
                <Link href="/settings" className="font-semibold text-accent underline">
                  Settings
                </Link>
                , and your regular payments under{" "}
                <Link href="/commitments" className="font-semibold text-accent underline">
                  Commitments
                </Link>
                . Then we can estimate how {what} fits.
              </p>
            </>
          ) : when === "now" ? (
            <>
              <p className="text-base">{now.message}</p>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted">Estimated remaining until payday</dt>
                <dd className="text-right tabular-nums">{signed(now.beforePaise)}</dd>
                <dt className="text-muted">{label.trim() || "This purchase"}</dt>
                <dd className="text-right tabular-nums">−{formatINR(now.amountPaise)}</dd>
                <dt className="font-semibold">After it</dt>
                <dd className="text-right font-semibold tabular-nums">{signed(now.afterPaise)}</dd>
                {now.level !== "comfortable" && now.cushionPaise > 0 && (
                  <>
                    <dt className="text-muted">{now.cushionReason === "budget" ? "Everyday budget still planned" : "Breathing room (10% of income)"}</dt>
                    <dd className="text-right tabular-nums">{formatINR(now.cushionPaise)}</dd>
                  </>
                )}
              </dl>
              {now.reasons.length > 0 && (
                <div className="text-sm">
                  <p className="font-medium">Already set aside for, before payday:</p>
                  <ul className="mt-1 flex flex-col gap-0.5 text-muted">
                    {now.reasons.map((r) => (
                      <li key={`${r.commitmentId}-${r.date}`} className="flex justify-between gap-3">
                        <span>
                          {r.name} · {formatDate(r.date, false)}
                        </span>
                        <span className="tabular-nums">{formatINR(r.amountPaise)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            later && (
              <>
                <p className="text-base">{AFTER_MESSAGES[later.level]}</p>
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted">
                    Take-home pay ({formatDate(later.from, false)} – {formatDate(later.to, false)})
                  </dt>
                  <dd className="text-right tabular-nums">{formatINR(later.incomePaise)}</dd>
                  <dt className="text-muted">Bills, EMIs and SIPs due that cycle</dt>
                  <dd className="text-right tabular-nums">−{formatINR(later.commitmentsPaise)}</dd>
                  {later.everydayPaise > 0 && (
                    <>
                      <dt className="text-muted">Your everyday spending budget</dt>
                      <dd className="text-right tabular-nums">−{formatINR(later.everydayPaise)}</dd>
                    </>
                  )}
                  {later.carryPaise < 0 && (
                    <>
                      <dt className="text-muted">Shortfall carried from this cycle</dt>
                      <dd className="text-right tabular-nums">{signed(later.carryPaise)}</dd>
                    </>
                  )}
                  <dt className="text-muted">{label.trim() || "This purchase"}</dt>
                  <dd className="text-right tabular-nums">−{formatINR(paise!)}</dd>
                  <dt className="font-semibold">Estimated left</dt>
                  <dd className="text-right font-semibold tabular-nums">{signed(later.afterPaise)}</dd>
                </dl>
                <p className="text-xs text-muted">A rough guide from what you&apos;ve recorded today, not a promise about next month.</p>
              </>
            )
          )}

          {level !== "comfortable" && level !== "incomplete" && (
            <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
              <p className="text-sm font-medium">{NOT_NOW} A few ways to look at it:</p>
              <div className="flex flex-wrap gap-2">
                {when === "now" && (
                  <button type="button" onClick={() => setWhen("after")} className="flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-semibold">
                    <CalendarClock className="size-4" aria-hidden /> See it after payday
                  </button>
                )}
                <button type="button" aria-expanded={planOpen} onClick={() => setPlanOpen((v) => !v)} className="flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-semibold">
                  <PiggyBank className="size-4" aria-hidden /> Plan for it
                </button>
                <button
                  type="button"
                  onClick={() => {
                    amountRef.current?.focus();
                    amountRef.current?.select();
                  }}
                  className="flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-semibold"
                >
                  <RotateCcw className="size-4" aria-hidden /> Try another amount
                </button>
              </div>
            </div>
          )}

          {(planOpen || level === "comfortable") && level !== "incomplete" && paise && (
            <div className="flex flex-col gap-2 rounded-xl bg-surface p-3 text-sm">
              <p className="font-medium">Work towards it, if you&apos;d like</p>
              <p className="text-muted">Set aside a little each month. You review it under Commitments before anything is saved.</p>
              <ul className="flex flex-col gap-1">
                {PLAN_MONTHS.map((m) => {
                  const monthly = monthlyShare(paise, m);
                  const href = `/commitments/new?type=other&frequency=monthly&name=${encodeURIComponent(`Saving towards ${label.trim() || "a purchase"}`)}&amount=${encodeURIComponent(paiseToInput(monthly))}`;
                  return (
                    <li key={m}>
                      <Link href={href} className="flex justify-between gap-3 rounded-lg border border-border px-3 py-2 font-semibold">
                        <span>Over {m} months</span>
                        <span className="tabular-nums text-accent">{formatINR(monthly)} a month</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {level !== "incomplete" && (
            <p className="text-xs text-muted">
              {when === "now"
                ? `Based on what you've recorded in MoneyMap for this pay cycle (${formatDate(o.cycle.start, false)} – ${formatDate(o.cycle.end, false)}). Not your bank balance.`
                : `Based on the income, regular payments and budget recorded in MoneyMap, applied to the next pay cycle (${formatDate(later?.from ?? o.cycle.nextPayday, false)} – ${formatDate(later?.to ?? next.end, false)}). Not your bank balance.`}
            </p>
          )}

          {level !== "incomplete" && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer font-medium">What this estimate doesn&apos;t know</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {now.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <p className="text-center text-xs text-muted">
        You decide. MoneyMap only estimates from what you&apos;ve recorded; it never blocks a purchase, and nothing on this page is saved.
      </p>
    </div>
  );
}
