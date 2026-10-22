import { revalidatePath } from "next/cache";

// Call after any successful write. Visited tabs are kept in the browser for a short time
// (next.config.ts staleTimes) so switching back is instant; this clears that memory so
// every screen shows fresh figures after a change.
export function dataChanged() {
  revalidatePath("/", "layout");
}
