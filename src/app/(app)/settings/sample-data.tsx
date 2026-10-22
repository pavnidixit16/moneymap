"use client";

import { startTransition, useActionState, useState } from "react";
import { clearSampleData, loadSampleData, type SampleState } from "./actions";

export function SampleDataControls({ loaded }: { loaded: boolean }) {
  const [loadState, load, loading] = useActionState<SampleState, FormData>(loadSampleData, {});
  const [clearState, clear, clearing] = useActionState<SampleState, FormData>(clearSampleData, {});
  // Show the result of the button pressed last; the page refresh flips which button is shown.
  const [last, setLast] = useState<"load" | "clear" | null>(null);
  const state = last === "load" ? loadState : last === "clear" ? clearState : {};

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        {loaded
          ? "Sample bills, subscriptions, investments and spending are loaded and marked Sample."
          : "Explore MoneyMap with realistic example bills, subscriptions, investments and spending. Everything is marked Sample and can be removed in one tap."}
      </p>
      <button
        type="button"
        disabled={loading || clearing}
        onClick={() => {
          setLast(loaded ? "clear" : "load");
          startTransition(() => (loaded ? clear(new FormData()) : load(new FormData())));
        }}
        className={`h-10 self-start rounded-full px-4 text-sm font-semibold disabled:opacity-60 ${loaded ? "border border-danger/50 text-danger" : "bg-accent-soft text-accent"}`}
      >
        {loading ? "Loading…" : clearing ? "Clearing…" : loaded ? "Clear sample data" : "Load sample data"}
      </button>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {state.message && <p role="status" className="text-sm text-success">{state.message}</p>}
    </div>
  );
}
