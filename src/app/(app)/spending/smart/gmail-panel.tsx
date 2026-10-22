"use client";

import { Mail, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { SuccessNote, primaryButton } from "@/components/ui";
import { useHydrated } from "@/components/use-hydrated";
import { formatDate } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { BatchReview, type BatchItem } from "./batch-review";
import { checkGmail, disconnectGmail, hideGmailMessages, type GmailCheckResult, type GmailItem, type GmailStatus } from "./gmail-actions";

const CONNECT_RESULTS: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Gmail connected. Tap “Check Gmail now” to look for recent payments." },
  denied: { ok: false, text: "You cancelled on Google's screen, so nothing was connected." },
  scope_missing: { ok: false, text: "Gmail access wasn't ticked on Google's screen, so MoneyMap can't read alerts. Try again and leave the Gmail box ticked." },
  expired: { ok: false, text: "That connection attempt expired. Please try again." },
  failed: { ok: false, text: "Couldn't finish connecting to Gmail. Please try again." },
  unavailable: { ok: false, text: "Gmail isn't switched on for MoneyMap yet." },
};

function ConnectForm({ label }: { label: string }) {
  const hydrated = useHydrated();
  return (
    // A plain form post: the server sends the browser on to Google's consent screen.
    <form action="/api/gmail/connect" method="post">
      <button type="submit" disabled={!hydrated} className={`${primaryButton} flex w-full items-center justify-center gap-2`}>
        <Mail className="size-5" aria-hidden /> {label}
      </button>
    </form>
  );
}

function WhatWeRead() {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      <li>
        <strong>Read:</strong> emails from the last 30 days from banks, card issuers and common merchants (like HDFC, ICICI, Swiggy,
        Amazon), only when you tap “Check Gmail now”.
      </li>
      <li>
        <strong>Kept:</strong> only the transactions you confirm. Emails, subjects and previews are never stored.
      </li>
      <li>
        <strong>Never:</strong> sending, deleting or changing your email.
      </li>
      <li>Disconnect any time here, or from your Google Account → Security → Third-party connections.</li>
    </ul>
  );
}

export function GmailPanel({ status, connectResult }: { status: GmailStatus; connectResult?: string }) {
  const router = useRouter();
  const [check, setCheck] = useState<GmailCheckResult | null>(null);
  const [items, setItems] = useState<GmailItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [pending, startTransition] = useTransition();
  const [checking, startCheck] = useTransition();
  const banner = connectResult ? CONNECT_RESULTS[connectResult] : undefined;

  const transactions = useMemo<BatchItem[]>(
    () =>
      items.flatMap((i) =>
        i.detection.type === "transaction"
          ? [
              {
                key: i.messageId,
                proposal: i.detection.proposal,
                details: (
                  <details className="text-xs text-muted">
                    <summary className="cursor-pointer">From {i.sender}</summary>
                    <p className="pt-1 font-medium">{i.subject}</p>
                    <p className="break-words">{i.snippet}</p>
                  </details>
                ),
              },
            ]
          : [],
      ),
    [items],
  );
  const statements = items.filter((i) => i.detection.type === "card_statement");

  function runCheck() {
    setMessage(null);
    startCheck(async () => {
      let r: GmailCheckResult;
      try {
        r = await checkGmail();
      } catch {
        r = { error: "Couldn't reach MoneyMap. Check your connection and try again." };
      }
      setCheck(r);
      setItems(r.items ?? []);
      if (r.needsReconnect) router.refresh();
    });
  }

  function hide(messageId: string) {
    startTransition(async () => {
      const r = await hideGmailMessages([messageId]).catch(() => ({ error: "Couldn't hide that email. Try again." }));
      if (r.error) setMessage(r.error);
      else setItems((list) => list.filter((i) => i.messageId !== messageId));
    });
  }

  function disconnect() {
    startTransition(async () => {
      const r = await disconnectGmail().catch(() => ({ revoked: false, error: "Couldn't reach MoneyMap. Try again." }));
      if (r.error) {
        setMessage(r.error);
        return;
      }
      setCheck(null);
      setItems([]);
      setConfirmDisconnect(false);
      setMessage(
        r.revoked
          ? "Gmail disconnected. MoneyMap's access was removed at Google and its Gmail data deleted. Transactions you confirmed stay."
          : "Gmail disconnected here and MoneyMap's Gmail data deleted. Google couldn't be reached to remove access, so also remove MoneyMap in your Google Account → Security → Third-party connections.",
      );
      router.refresh();
    });
  }

  const conn = status.connection;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      {banner && (banner.ok ? <SuccessNote>{banner.text}</SuccessNote> : <p role="alert" className="text-sm text-danger">{banner.text}</p>)}
      {message && <p role="status" className="rounded-xl bg-surface-2 p-2 text-sm">{message}</p>}

      {!status.available ? (
        <p className="text-sm">Gmail isn&apos;t switched on for MoneyMap yet. Type, speak or upload a statement instead.</p>
      ) : !conn ? (
        <>
          <p className="font-semibold">Find payments in your Gmail</p>
          <WhatWeRead />
          <p className="rounded-xl bg-surface-2 p-2 text-xs">
            MoneyMap is in testing, so Google will say it hasn&apos;t verified the app. Access lasts 7 days; after that you&apos;ll be
            asked to reconnect.
          </p>
          <ConnectForm label="Connect Gmail" />
        </>
      ) : conn.status === "needs_reconnect" ? (
        <>
          <p className="text-sm">
            Gmail access for <strong>{conn.email}</strong> has expired or was removed. Reconnect to check for new payments.
          </p>
          <ConnectForm label="Reconnect Gmail" />
        </>
      ) : (
        <>
          <p className="text-sm">
            Connected as <strong>{conn.email}</strong>
            {conn.lastCheckedAt && <span className="text-muted"> · last checked {formatDate(conn.lastCheckedAt.slice(0, 10))}</span>}
          </p>
          <button type="button" disabled={pending || checking} onClick={runCheck} className={`${primaryButton} flex items-center justify-center gap-2`}>
            <RefreshCw className={`size-5 ${checking ? "animate-spin" : ""}`} aria-hidden /> {checking ? "Checking Gmail…" : "Check Gmail now"}
          </button>
        </>
      )}

      {check?.error && <p role="alert" className="text-sm text-danger">{check.error}</p>}
      {check?.items && (
        <p className="text-sm text-muted">
          Checked {check.checked} email{check.checked === 1 ? "" : "s"}: {check.items.length} to review
          {check.skipped ? `, ${check.skipped} skipped (OTPs, adverts, failed payments)` : ""}
          {check.alreadyHandled ? `, ${check.alreadyHandled} already saved or hidden` : ""}.
        </p>
      )}

      {statements.map((s) =>
        s.detection.type === "card_statement" ? (
          <div key={s.messageId} className="flex flex-col gap-1 rounded-xl border border-warning/50 p-3 text-sm">
            <p className="font-semibold">{s.detection.issuer ?? s.sender}: card statement</p>
            <p>
              {s.detection.totalDuePaise ? `Total due ${formatINR(s.detection.totalDuePaise)}` : "Total due not found"}
              {s.detection.dueDate ? ` by ${formatDate(s.detection.dueDate)}` : ""}. A card bill isn&apos;t spending: add or update the card under Commitments.
            </p>
            <div className="flex gap-3">
              <Link href="/commitments?tab=all" className="font-semibold text-accent underline">
                Go to Commitments
              </Link>
              <button type="button" onClick={() => hide(s.messageId)} className="font-semibold text-muted underline">
                Hide
              </button>
            </div>
          </div>
        ) : null,
      )}

      {transactions.length > 0 && (
        <BatchReview
          source="gmail"
          items={transactions}
          onSaved={(m, keys) => {
            setMessage(m);
            setItems((list) => list.filter((i) => !keys.includes(i.messageId)));
            router.refresh();
          }}
          onHide={hide}
          onDiscard={() => {
            setItems([]);
            setCheck(null);
          }}
          discardLabel="Close (nothing saved)"
        />
      )}
      {check?.items && items.length === 0 && !check.error && <p className="text-sm">Nothing new to review.</p>}

      {conn && status.available && (
        <div className="border-t border-border pt-3 text-sm">
          {confirmDisconnect ? (
            <div className="flex flex-col gap-2">
              <p>Disconnect Gmail? MoneyMap&apos;s access is removed at Google and its Gmail data deleted. Transactions you confirmed stay.</p>
              <div className="flex gap-3">
                <button type="button" disabled={pending} onClick={disconnect} className="font-semibold text-danger underline">
                  Yes, disconnect
                </button>
                <button type="button" onClick={() => setConfirmDisconnect(false)} className="font-semibold underline">
                  Keep connected
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDisconnect(true)} className="font-semibold text-muted underline">
              Disconnect Gmail
            </button>
          )}
        </div>
      )}
    </section>
  );
}
