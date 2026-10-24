"use client";

import { CalendarClock, ChartPie, Flame, House, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Five tabs fit a 360px phone. Subscriptions are commitments, so their page (reached from
// Home and Commitments) highlights the Commitments tab.
const TABS = [
  { href: "/overview", label: "Home", icon: House, also: ["/afford"] },
  { href: "/commitments", label: "Commitments", icon: CalendarClock, also: ["/subscriptions"] as string[] },
  { href: "/spending", label: "Spending", icon: ChartPie, also: [] },
  { href: "/progress", label: "Progress", icon: Flame, also: [] },
  { href: "/settings", label: "Settings", icon: Settings, also: [] },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-md">
        {TABS.map(({ href, label, icon: TabIcon, also }) => {
          const active = [href, ...also].some((h) => pathname === h || pathname.startsWith(`${h}/`));
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${active ? "text-accent" : "text-muted"}`}
              >
                <span className={`flex h-7 w-12 items-center justify-center rounded-full ${active ? "bg-accent-soft" : ""}`}>
                  <TabIcon className="size-5" aria-hidden strokeWidth={active ? 2.2 : 1.8} />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
