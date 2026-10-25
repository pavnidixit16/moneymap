"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useHydrated } from "@/components/use-hydrated";
import { loadSampleData } from "../settings/actions";

// Loads the existing sample records (all marked Sample) so a first-time visitor sees a
// full dashboard before entering anything. Their own settings are never changed.
export function ExploreSampleButton() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={!hydrated || pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            let r: { error?: string };
            try {
              r = await loadSampleData();
            } catch {
              r = { error: "Couldn't reach MoneyMap. Please try again." };
            }
            // Already loaded (e.g. another tab) is fine: just show the dashboard.
            if (r.error && r.error !== "Sample data is already loaded.") setError(r.error);
            else router.refresh();
          })
        }
        className="inline-flex h-11 items-center rounded-full border border-white/60 px-5 font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Loading sample…" : "Explore with sample data first"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-white">
          {error}
        </p>
      )}
    </div>
  );
}
