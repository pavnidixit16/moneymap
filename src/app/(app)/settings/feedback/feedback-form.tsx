"use client";

import { useState, useTransition } from "react";
import { primaryButton, SuccessNote } from "@/components/ui";
import { useHydrated } from "@/components/use-hydrated";
import {
  EASE,
  ISSUES,
  PARTS,
  RETURN,
  type FeedbackInput,
} from "@/lib/feedback";
import { submitFeedback, type FeedbackResult } from "./actions";

const box =
  "flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4";
const option =
  "flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft";

export function FeedbackForm({ initial }: { initial: FeedbackInput | null }) {
  const hydrated = useHydrated();
  const [v, setV] = useState<FeedbackInput>(
    initial ?? {
      parts_tried: [],
      ease: undefined as never,
      issues: [],
      issue_details: "",
      return_intent: undefined as never,
      comments: "",
      quote_ok: false,
    },
  );
  const [result, setResult] = useState<FeedbackResult>({});
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<FeedbackInput>) => {
    setV((old) => ({ ...old, ...patch }));
    setResult((r) => ({ ...r, errors: undefined, error: undefined }));
  };
  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  function send() {
    startTransition(async () => {
      let r: FeedbackResult;
      try {
        r = await submitFeedback(v);
      } catch {
        r = {
          error:
            "Couldn't reach MoneyMap. Your answers are still here; please try again.",
        };
      }
      setResult(r);
    });
  }

  if (result.ok) {
    return (
      <SuccessNote>
        Thank you! Your feedback was saved
        {result.replaced ? " and replaces your earlier answers" : ""}. It&apos;s
        seen only by the MoneyMap team.
      </SuccessNote>
    );
  }

  const err = result.errors ?? {};
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      className="flex flex-col gap-4"
    >
      <div className={box}>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">
            1. Which parts of MoneyMap did you try?
          </legend>
          <p className="text-xs text-muted">Choose all that apply.</p>
          {PARTS.map((o) => (
            <label key={o.value} className={option}>
              <input
                type="checkbox"
                checked={v.parts_tried.includes(o.value)}
                onChange={() =>
                  set({
                    parts_tried: toggle(
                      v.parts_tried,
                      o.value,
                    ) as FeedbackInput["parts_tried"],
                  })
                }
                className="size-4 accent-[var(--accent)]"
              />
              {o.label}
            </label>
          ))}
        </fieldset>
      </div>

      <div className={box}>
        <fieldset
          className="flex flex-col gap-2"
          aria-describedby={err.ease ? "ease-error" : undefined}
        >
          <legend className="mb-1 font-semibold">
            2. How easy was MoneyMap to use?
          </legend>
          {EASE.map((o) => (
            <label key={o.value} className={option}>
              <input
                type="radio"
                name="ease"
                checked={v.ease === o.value}
                onChange={() => set({ ease: o.value })}
                className="size-4 accent-[var(--accent)]"
              />
              {o.label}
            </label>
          ))}
          {err.ease && (
            <p id="ease-error" className="text-sm text-danger">
              {err.ease}
            </p>
          )}
        </fieldset>
      </div>

      <div className={box}>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">
            3. Did anything confuse you, fail, or make you hesitate to trust
            MoneyMap?
          </legend>
          <p className="text-xs text-muted">Choose all that apply.</p>
          {ISSUES.map((o) => (
            <label key={o.value} className={option}>
              <input
                type="checkbox"
                checked={v.issues.includes(o.value)}
                onChange={() => {
                  // "No issues" and specific issues can't both be ticked.
                  const next =
                    o.value === "none"
                      ? v.issues.includes("none")
                        ? []
                        : ["none"]
                      : toggle(
                          v.issues.filter((x) => x !== "none"),
                          o.value,
                        );
                  set({ issues: next as FeedbackInput["issues"] });
                }}
                className="size-4 accent-[var(--accent)]"
              />
              {o.label}
            </label>
          ))}
          {err.issues && <p className="text-sm text-danger">{err.issues}</p>}
          {v.issues.some((i) => i !== "none") && (
            <label className="flex flex-col gap-1 text-sm">
              What happened? (optional)
              <input
                value={v.issue_details ?? ""}
                maxLength={300}
                onChange={(e) => set({ issue_details: e.target.value })}
                placeholder="A few words is plenty. Please don't include amounts or account details."
                className="h-11 rounded-xl border border-border bg-surface px-3 text-base outline-none focus:border-accent"
              />
            </label>
          )}
          {err.issue_details && (
            <p className="text-sm text-danger">{err.issue_details}</p>
          )}
        </fieldset>
      </div>

      <div className={box}>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">
            4. Would you use MoneyMap again next week?
          </legend>
          {RETURN.map((o) => (
            <label key={o.value} className={option}>
              <input
                type="radio"
                name="return"
                checked={v.return_intent === o.value}
                onChange={() => set({ return_intent: o.value })}
                className="size-4 accent-[var(--accent)]"
              />
              {o.label}
            </label>
          ))}
          {err.return_intent && (
            <p className="text-sm text-danger">{err.return_intent}</p>
          )}
        </fieldset>
      </div>

      <div className={box}>
        <label htmlFor="comments" className="font-semibold">
          5. What&apos;s your overall feedback? What did you like, and what one
          thing would you improve?
        </label>
        <textarea
          id="comments"
          rows={4}
          maxLength={1000}
          value={v.comments ?? ""}
          onChange={(e) => set({ comments: e.target.value })}
          placeholder="Optional"
          className="rounded-xl border border-border bg-surface px-3 py-2 text-base outline-none focus:border-accent"
        />
        {err.comments && <p className="text-sm text-danger">{err.comments}</p>}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={v.quote_ok}
            onChange={(e) => set({ quote_ok: e.target.checked })}
            className="size-4 accent-[var(--accent)]"
          />
          You may quote this anonymously in our presentation
        </label>
      </div>

      {result.error && (
        <p role="alert" className="text-sm text-danger">
          {result.error}
        </p>
      )}
      <button
        type="submit"
        disabled={!hydrated || pending}
        className={primaryButton}
      >
        {pending ? "Sending…" : "Send feedback"}
      </button>
      <p className="text-center text-xs text-muted">
        Only the MoneyMap team sees your answers. Your name and email
        aren&apos;t shown with them.
      </p>
    </form>
  );
}
