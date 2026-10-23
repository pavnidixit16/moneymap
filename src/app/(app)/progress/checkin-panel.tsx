"use client";

import { CircleCheck, NotebookPen, ReceiptText, Sparkles, WalletMinimal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { primaryButton, SuccessNote } from "@/components/ui";
import { useHydrated } from "@/components/use-hydrated";
import type { ISODate } from "@/lib/engine/dates";
import type { AchievementKey, CheckinKind, CheckinStatus } from "@/lib/progress";
import { checkIn, withdrawNoSpend, type CheckinResult } from "./actions";
import { Celebration } from "./celebration";

type Step = "choose" | "confirm_no_spend" | "record" | "confirm_reviewed" | "confirm_withdraw";

const SUCCESS: Record<CheckinKind, string> = {
  no_spend: "Check-in complete! A no-spend day is logged. You're keeping your money routine going.",
  reviewed_activity: "Check-in complete! Today's activity is reviewed. You're keeping your money routine going.",
};

function RecordLinks() {
  return (
    <div className="flex flex-col gap-2">
      <Link href="/spending/new" className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-semibold">
        <ReceiptText className="size-5 text-accent" aria-hidden /> Add an expense
      </Link>
      <Link href="/spending/smart" className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-semibold">
        <Sparkles className="size-5 text-accent" aria-hidden /> Smart add: type, speak, upload or check Gmail
      </Link>
      <p className="text-xs text-muted">Today counts as soon as you save or confirm an entry.</p>
    </div>
  );
}

export function CheckinPanel({
  today,
  todayCheckin,
  uncelebrated,
}: {
  today: ISODate;
  todayCheckin: { kind: CheckinKind; status: CheckinStatus } | null;
  uncelebrated: AchievementKey[];
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [step, setStep] = useState<Step>("choose");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; retry: () => void } | null>(null);
  // Achievements found on page load celebrate without sound until tapped; ones earned by
  // this tap may play straight away.
  const [celebrate, setCelebrate] = useState<{ keys: AchievementKey[]; fromTap: boolean } | null>(
    uncelebrated.length ? { keys: uncelebrated, fromTap: false } : null,
  );

  function submit(kind: CheckinKind) {
    setError(null);
    startTransition(async () => {
      let r: CheckinResult;
      try {
        r = await checkIn(kind);
      } catch {
        r = { error: "Couldn't reach MoneyMap. Check your connection; tapping again won't check you in twice." };
      }
      if (!r.ok) {
        setError({ text: r.error ?? "Couldn't save your check-in.", retry: () => submit(kind) });
        return;
      }
      // Success is shown only now, after the server has saved (or found) today's check-in.
      setMessage(r.alreadyCheckedIn ? "You'd already checked in today, so nothing changed." : SUCCESS[r.kind ?? kind]);
      if (r.newAchievements?.length) setCelebrate({ keys: r.newAchievements, fromTap: true });
      setStep("choose");
      router.refresh();
    });
  }

  function withdraw() {
    setError(null);
    startTransition(async () => {
      let r: { ok?: boolean; error?: string };
      try {
        r = await withdrawNoSpend(today);
      } catch {
        r = { error: "Couldn't reach MoneyMap. Nothing was changed; please try again." };
      }
      if (!r.ok) {
        setError({ text: r.error ?? "Couldn't change your check-in.", retry: withdraw });
        return;
      }
      setMessage("No-spend check-in removed. Record what you spent and today will count again. Your entries weren't changed.");
      setStep("record");
      router.refresh();
    });
  }

  const busy = !hydrated || pending;
  const checkedIn = todayCheckin?.status === "confirmed";

  return (
    <section aria-labelledby="checkin-title" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <h2 id="checkin-title" className="font-semibold">
        Today&apos;s check-in
      </h2>

      {celebrate && <Celebration keys={celebrate.keys} fromTap={celebrate.fromTap} onDone={() => setCelebrate(null)} />}
      {message && <SuccessNote>{message}</SuccessNote>}
      {error && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl border border-danger/40 p-3 text-sm text-danger">
          <p>{error.text}</p>
          <button type="button" disabled={busy} onClick={error.retry} className="self-start font-semibold underline">
            Try again
          </button>
        </div>
      )}

      {checkedIn ? (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-sm">
            <CircleCheck className="size-5 text-success" aria-hidden />
            Checked in today: {todayCheckin.kind === "no_spend" ? "no-spend day" : "activity recorded or reviewed"}.
          </p>
          {todayCheckin.kind === "no_spend" &&
            (step === "confirm_withdraw" ? (
              <div className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3 text-sm">
                <p>Remove today&apos;s no-spend check-in? Record what you spent and today will count again. No entries are changed.</p>
                <div className="flex gap-3">
                  <button type="button" disabled={busy} onClick={withdraw} className="font-semibold text-accent underline">
                    Yes, I spent something
                  </button>
                  <button type="button" onClick={() => setStep("choose")} className="font-semibold underline">
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setStep("confirm_withdraw")} className="self-start text-sm font-semibold text-muted underline">
                Actually, I spent something today
              </button>
            ))}
        </div>
      ) : step === "confirm_no_spend" ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            Please confirm you made <strong>no purchases or payments today</strong> (India time), including UPI, card, cash and
            subscriptions. This records a check-in only: no amount is saved and nothing is counted as savings.
          </p>
          <button type="button" disabled={busy} onClick={() => submit("no_spend")} className={primaryButton}>
            {pending ? "Saving…" : "Yes, it's a no-spend day"}
          </button>
          <button type="button" onClick={() => setStep("choose")} className="h-11 rounded-full border border-border text-sm font-semibold">
            Cancel
          </button>
        </div>
      ) : step === "confirm_reviewed" ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">Please confirm you&apos;ve recorded or reviewed today&apos;s spending in MoneyMap.</p>
          <button type="button" disabled={busy} onClick={() => submit("reviewed_activity")} className={primaryButton}>
            {pending ? "Saving…" : "Yes, I've reviewed today"}
          </button>
          <button type="button" onClick={() => setStep("choose")} className="h-11 rounded-full border border-border text-sm font-semibold">
            Cancel
          </button>
        </div>
      ) : step === "record" || todayCheckin?.status === "needs_review" ? (
        <div className="flex flex-col gap-3">
          {todayCheckin?.status === "needs_review" && !message && (
            <p className="text-sm">You said you spent something today. Record it and today will count.</p>
          )}
          <RecordLinks />
          <button type="button" onClick={() => setStep("confirm_reviewed")} className="self-start text-sm font-semibold text-muted underline">
            I&apos;ve already reviewed today&apos;s activity
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">How was today? One check-in a day keeps your routine going.</p>
          {[
            { step: "confirm_no_spend" as const, icon: WalletMinimal, label: "I didn't spend anything today" },
            { step: "record" as const, icon: ReceiptText, label: "I have spending to record or review" },
            { step: "confirm_reviewed" as const, icon: NotebookPen, label: "I've already reviewed today's activity" },
          ].map((o) => (
            <button
              key={o.step}
              type="button"
              disabled={busy}
              onClick={() => {
                setMessage(null);
                setStep(o.step);
              }}
              className="flex items-center gap-3 rounded-xl border border-border p-3 text-left text-sm font-semibold transition-colors hover:border-accent/50"
            >
              <o.icon className="size-5 shrink-0 text-accent" aria-hidden /> {o.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
