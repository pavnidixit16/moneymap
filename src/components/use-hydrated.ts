import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// False during server rendering and before the page becomes interactive, true after.
// Submit buttons stay disabled until then, so an early tap can't fall back to a plain
// browser form submission that would silently discard the input.
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
