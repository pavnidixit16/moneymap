"use client";

import { startTransition, useActionState } from "react";
import { setReview, type ReviewState } from "./actions";

const OPTIONS = [
  { value: "keep", label: "Keep" },
  { value: "review", label: "Review" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export function ReviewButtons({ id, name, current }: { id: string; name: string; current: "unreviewed" | "keep" | "review" | "cancelled" }) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(setReview, {});
  function choose(decision: string) {
    const data = new FormData();
    data.set("id", id);
    data.set("decision", decision);
    startTransition(() => action(data));
  }

  if (current === "cancelled") {
    return (
      <div className="flex flex-col gap-1 pt-2">
        <button type="button" disabled={pending} onClick={() => choose("reactivate")} className="self-start text-sm font-semibold text-accent underline disabled:opacity-60">
          Reactivate {name}
        </button>
        {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 pt-2">
      <div role="group" aria-label={`Decision for ${name}`} className="flex gap-1 rounded-full bg-surface-2 p-1">
        {OPTIONS.map((o) => {
          const active = current === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              disabled={pending}
              onClick={() => choose(o.value)}
              className={`flex-1 rounded-full py-1.5 text-xs font-semibold disabled:opacity-60 ${
                active ? "bg-accent text-accent-foreground" : "text-muted"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
    </div>
  );
}
