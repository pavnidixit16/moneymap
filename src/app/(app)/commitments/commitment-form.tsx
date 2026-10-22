"use client";

import { useHydrated } from "@/components/use-hydrated";
import { startTransition, useActionState, useState, type ReactNode } from "react";
import { Field, inputClass, primaryButton } from "@/components/ui";
import { BANKS, CARD_ISSUERS, FUND_PLATFORMS, INSURERS, type FormVariant } from "@/lib/catalog";
import { defaultTrackingMode, FREQUENCY_LABELS, MODE_LABELS, staleDueDateSuggestion, SUBTYPES } from "@/lib/commitments";
import { isISODate, istToday } from "@/lib/engine/dates";
import { FREQUENCIES, TRACKING_MODES, type CommitmentKind, type Frequency, type TrackingMode } from "@/lib/engine/types";
import { formatDate } from "@/lib/format";
import { saveCommitment, type CommitmentFormState } from "./actions";

export interface CommitmentFormValues {
  id?: string;
  variant: FormVariant;
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
  provider: string;
  coverage: string;
  interest_rate: string;
  notes: string;
}

// Wording per form variant, so each type reads naturally.
const COPY: Record<FormVariant, { name: string; namePlaceholder: string; amount: string; due: string; provider?: string; end?: string }> = {
  bill: { name: "Name", namePlaceholder: "e.g. Electricity", amount: "Amount each time (₹)", due: "Next due date", provider: "Provider or landlord (optional)" },
  loan: { name: "Name", namePlaceholder: "e.g. Home loan", amount: "EMI amount (₹)", due: "Next EMI date", provider: "Lender (optional)", end: "Last EMI date (optional)" },
  card: { name: "Card nickname", namePlaceholder: "e.g. HDFC Millennia", amount: "Expected bill amount (₹)", due: "Next bill due date" },
  insurance: { name: "Policy nickname", namePlaceholder: "e.g. Family health cover", amount: "Premium (₹)", due: "Next premium due", provider: "Insurer (optional)" },
  subscription: { name: "Service", namePlaceholder: "e.g. Netflix", amount: "Amount each time (₹)", due: "Next charge date" },
  sip: { name: "Fund or SIP name", namePlaceholder: "e.g. Nifty 50 index fund", amount: "SIP amount (₹)", due: "Next SIP date", provider: "Fund house or platform (optional)", end: "SIP end date (optional)" },
  rd: { name: "Name", namePlaceholder: "e.g. SBI RD", amount: "Instalment (₹)", due: "Next instalment date", provider: "Bank (optional)", end: "Last instalment date (optional)" },
  fd: { name: "Name", namePlaceholder: "e.g. SBI FD", amount: "Principal (₹)", due: "Deposit date", provider: "Bank (optional)" },
  savings: { name: "Name", namePlaceholder: "e.g. PPF", amount: "Amount each time (₹)", due: "Next contribution date", provider: "Bank or account (optional)" },
  other: { name: "Name", namePlaceholder: "e.g. Course fees", amount: "Amount each time (₹)", due: "Next due date", provider: "Paid to (optional)", end: "Last payment date (optional)" },
};

const OTHER_ISSUER = "__other__";

export function CommitmentForm({ initial }: { initial: CommitmentFormValues }) {
  const [state, action, pending] = useActionState<CommitmentFormState, FormData>(saveCommitment, {});
  const hydrated = useHydrated();
  const variant = initial.variant;
  const copy = COPY[variant];
  const [subtype, setSubtype] = useState(initial.subtype);
  const [mode, setMode] = useState(initial.tracking_mode);
  const [modeTouched, setModeTouched] = useState(Boolean(initial.id));
  const [frequency, setFrequency] = useState(initial.frequency);
  const [nextDue, setNextDue] = useState(initial.next_due_date);
  const [name, setName] = useState(initial.name);
  const [nameTouched, setNameTouched] = useState(Boolean(initial.id) || initial.name !== "");
  const knownIssuer = CARD_ISSUERS.some((i) => i.name === initial.provider);
  const [issuer, setIssuer] = useState(initial.provider === "" || knownIssuer ? initial.provider : OTHER_ISSUER);
  const [customIssuer, setCustomIssuer] = useState(knownIssuer ? "" : initial.provider);
  const [cardVariant, setCardVariant] = useState("");
  const e = state.errors ?? {};

  const isInfo = mode === "info";
  const provider = variant === "card" ? (issuer === OTHER_ISSUER ? customIssuer : issuer) : undefined;
  const suggestion = !isInfo && isISODate(nextDue) ? staleDueDateSuggestion(nextDue, frequency, istToday()) : null;

  function changeSubtype(next: string) {
    setSubtype(next);
    if (!modeTouched) setMode(defaultTrackingMode(initial.kind, next));
    if (!nameTouched) setName(SUBTYPES[initial.kind].find((s) => s.value === next)?.label ?? "");
  }

  function suggestCardName(nextIssuer: string, nextVariant: string) {
    if (nameTouched) return;
    const short = nextIssuer.replace(/ Bank$| Card$/, "");
    setName([short, nextVariant].filter(Boolean).join(" ") || "Credit card");
  }

  // SIP, RD and FD have their own forms, so "PPF / EPF" only offers the remaining savings types.
  const subtypeOptions =
    variant === "savings" ? SUBTYPES.investment.filter((s) => ["ppf", "epf", "other"].includes(s.value)) : SUBTYPES[initial.kind];
  const subtypeSelect = subtypeOptions.length > 1 && variant !== "sip" && variant !== "rd" && variant !== "fd" && (
    <Field label="Type" htmlFor="subtype" error={e.subtype}>
      <select id="subtype" value={subtype} onChange={(ev) => changeSubtype(ev.target.value)} className={inputClass}>
        {subtypeOptions.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </Field>
  );

  const modeChoices = (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">How should MoneyMap treat it?</legend>
      {TRACKING_MODES.map((m) => (
        <label key={m} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${mode === m ? "border-accent bg-accent-soft/50" : "border-border"}`}>
          <input
            type="radio"
            name="tracking_mode_choice"
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
  );

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
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="kind" value={initial.kind} />
      <input type="hidden" name="subtype" value={subtype} />
      <input type="hidden" name="tracking_mode" value={mode} />
      {isInfo && <input type="hidden" name="frequency" value="one_time" />}
      {provider !== undefined && <input type="hidden" name="provider" value={provider} />}

      {variant === "card" && (
        <>
          <Field label="Card issuer" htmlFor="issuer">
            <select
              id="issuer"
              value={issuer}
              onChange={(ev) => {
                setIssuer(ev.target.value);
                suggestCardName(ev.target.value === OTHER_ISSUER ? customIssuer : ev.target.value, cardVariant);
              }}
              className={inputClass}
            >
              <option value="">Choose issuer</option>
              {CARD_ISSUERS.map((i) => (
                <option key={i.name} value={i.name}>
                  {i.name}
                </option>
              ))}
              <option value={OTHER_ISSUER}>Other / enter manually</option>
            </select>
          </Field>
          {issuer === OTHER_ISSUER && (
            <Field label="Issuer name" htmlFor="custom_issuer">
              <input
                id="custom_issuer"
                value={customIssuer}
                maxLength={80}
                onChange={(ev) => {
                  setCustomIssuer(ev.target.value);
                  suggestCardName(ev.target.value, cardVariant);
                }}
                className={inputClass}
              />
            </Field>
          )}
          {issuer && issuer !== OTHER_ISSUER && !initial.id && (
            <Field label="Card (optional)" htmlFor="card_variant" hint="Pick a suggestion or type your card's name. Suggestions are examples, not a complete list.">
              <input
                id="card_variant"
                list="card-variants"
                value={cardVariant}
                onChange={(ev) => {
                  setCardVariant(ev.target.value);
                  suggestCardName(issuer, ev.target.value);
                }}
                className={inputClass}
                placeholder="e.g. Millennia"
              />
              <datalist id="card-variants">
                {CARD_ISSUERS.find((i) => i.name === issuer)?.variants.map((v) => <option key={v} value={v} />)}
              </datalist>
            </Field>
          )}
        </>
      )}

      {subtypeSelect}

      <Field label={copy.name} htmlFor="name" error={e.name}>
        <input
          id="name"
          name="name"
          value={name}
          maxLength={80}
          onChange={(ev) => {
            setName(ev.target.value);
            setNameTouched(true);
          }}
          className={inputClass}
          placeholder={copy.namePlaceholder}
        />
      </Field>

      {copy.provider && (
        <Field label={copy.provider} htmlFor="provider" error={e.provider}>
          <input
            id="provider"
            name="provider"
            list={variant === "insurance" ? "insurers" : variant === "sip" ? "fund-platforms" : variant === "rd" || variant === "fd" ? "banks" : undefined}
            defaultValue={initial.provider}
            maxLength={80}
            className={inputClass}
          />
          <SuggestionList id="insurers" items={INSURERS} />
          <SuggestionList id="fund-platforms" items={FUND_PLATFORMS} />
          <SuggestionList id="banks" items={BANKS} />
        </Field>
      )}

      {variant === "card" && (
        <Choice
          legend="How do you track spending on this card?"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setModeTouched(true);
          }}
          options={[
            {
              value: "reminder",
              label: "I log card purchases as expenses",
              help: "Recommended. The bill is a reminder only, so the same spending isn't counted twice.",
            },
            {
              value: "outflow",
              label: "I don't log card purchases",
              help: "The bill amount is counted as a commitment when it's due.",
            },
          ]}
        />
      )}

      {variant === "fd" && (
        <Choice
          legend="Is this deposit already made?"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setModeTouched(true);
            setFrequency("one_time");
          }}
          options={[
            { value: "info", label: "Already deposited", help: "Record only. The principal is not subtracted from your money; only the maturity date is shown." },
            { value: "outflow", label: "Planned deposit", help: "Counts as a one-time outflow on the deposit date." },
          ]}
        />
      )}

      <Field
        label={copy.amount.replace(" (₹)", isInfo || mode === "reminder" ? " (₹, optional)" : " (₹)")}
        htmlFor="amount"
        error={e.amount}
      >
        <input id="amount" name="amount" inputMode="decimal" defaultValue={initial.amount} className={inputClass} placeholder="1200" />
      </Field>
      {!isInfo && variant !== "fd" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="amount_is_estimate" defaultChecked={initial.amount_is_estimate} className="size-4 accent-[var(--accent)]" />
          The amount varies; this is an estimate
        </label>
      )}

      {variant === "insurance" && (
        <Field label="Cover / sum insured (₹, optional)" htmlFor="coverage" error={e.coverage} hint="For your reference only. It is never counted in any total.">
          <input id="coverage" name="coverage" inputMode="decimal" defaultValue={initial.coverage} className={inputClass} placeholder="1000000" />
        </Field>
      )}

      {!isInfo && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {variant === "fd" || variant === "card" ? (
              <input type="hidden" name="frequency" value={variant === "fd" ? "one_time" : "monthly"} />
            ) : (
              <Field label="How often" htmlFor="frequency" error={e.frequency}>
                <select id="frequency" name="frequency" value={frequency} onChange={(ev) => setFrequency(ev.target.value as Frequency)} className={inputClass}>
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {FREQUENCY_LABELS[f]}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <div className={variant === "fd" || variant === "card" ? "col-span-2" : ""}>
              <Field label={frequency === "one_time" && variant !== "fd" ? "Due date" : copy.due} htmlFor="next_due_date" error={e.next_due_date}>
                <input id="next_due_date" name="next_due_date" type="date" value={nextDue} onChange={(ev) => setNextDue(ev.target.value)} className={inputClass} />
              </Field>
            </div>
          </div>
          {suggestion && (
            <p role="status" className="rounded-xl border border-border bg-surface-2 p-3 text-sm">
              That date is more than one payment ago, so earlier payments would all show as overdue. Did you mean the next
              upcoming date?{" "}
              <button type="button" onClick={() => setNextDue(suggestion)} className="font-semibold text-accent underline">
                Use {formatDate(suggestion)}
              </button>
            </p>
          )}
          {copy.end && frequency !== "one_time" && (
            <Field label={copy.end} htmlFor="end_date" error={e.end_date}>
              <input id="end_date" name="end_date" type="date" defaultValue={initial.end_date} className={inputClass} />
            </Field>
          )}
        </>
      )}

      {variant === "fd" && (
        <Field label="Interest rate (% a year, optional)" htmlFor="interest_rate" error={e.interest_rate} hint="For your reference. MoneyMap doesn't calculate interest or maturity value.">
          <input id="interest_rate" name="interest_rate" inputMode="decimal" defaultValue={initial.interest_rate} className={inputClass} placeholder="7.1" />
        </Field>
      )}

      {(variant === "rd" || variant === "fd" || variant === "insurance" || variant === "savings" || variant === "other") && (
        <Field
          label={variant === "insurance" ? "Policy maturity date (optional)" : "Maturity date (optional)"}
          htmlFor="maturity_date"
          error={e.maturity_date}
          hint="Shown under Coming up. MoneyMap doesn't calculate interest or returns."
        >
          <input id="maturity_date" name="maturity_date" type="date" defaultValue={initial.maturity_date} className={inputClass} />
        </Field>
      )}

      {variant === "savings" || variant === "other" ? (
        modeChoices
      ) : variant !== "card" && variant !== "fd" ? (
        <details className="rounded-xl border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium">Advanced: {MODE_LABELS[mode].label}</summary>
          <div className="pt-3">{modeChoices}</div>
        </details>
      ) : null}

      <Field label="Notes (optional)" htmlFor="notes" error={e.notes} hint="Please don't enter account or card numbers.">
        <textarea id="notes" name="notes" defaultValue={initial.notes} maxLength={500} rows={2} className={`${inputClass} h-auto py-2`} />
      </Field>

      {e.form && (
        <p role="alert" className="text-sm text-danger">
          {e.form}
        </p>
      )}

      <button type="submit" disabled={!hydrated || pending} className={primaryButton}>
        {pending ? "Saving…" : initial.id ? "Save changes" : "Add commitment"}
      </button>
    </form>
  );
}

function SuggestionList({ id, items }: { id: string; items: string[] }) {
  return (
    <datalist id={id}>
      {items.map((i) => (
        <option key={i} value={i} />
      ))}
    </datalist>
  );
}

function Choice({
  legend,
  value,
  onChange,
  options,
}: {
  legend: string;
  value: TrackingMode;
  onChange: (m: TrackingMode) => void;
  options: { value: TrackingMode; label: string; help: ReactNode }[];
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${value === o.value ? "border-accent bg-accent-soft/50" : "border-border"}`}>
          <input type="radio" checked={value === o.value} onChange={() => onChange(o.value)} className="mt-1 accent-[var(--accent)]" />
          <span className="flex flex-col">
            <span className="text-sm font-medium">{o.label}</span>
            <span className="text-xs text-muted">{o.help}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
