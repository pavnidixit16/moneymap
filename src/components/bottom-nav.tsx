"use client";

import { CalendarClock, ChartPie, House, Repeat, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/overview", label: "Home", icon: House },
  { href: "/commitments", label: "Commitments", icon: CalendarClock },
  { href: "/spending", label: "Spending", icon: ChartPie },
  { href: "/subscriptions", label: "Subscriptions", icon: Repeat },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-md">
        {TABS.map(({ href, label, icon: TabIcon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
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
