import { FREQUENCY_LABELS } from "./commitments";
import type { Frequency } from "./engine/types";

// "2026-10-05" -> "5 Oct 2026", in calendar terms (no timezone shift).
export function formatDate(iso: string, withYear = true): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

export function frequencyLabel(f: Frequency): string {
  return FREQUENCY_LABELS[f];
}
