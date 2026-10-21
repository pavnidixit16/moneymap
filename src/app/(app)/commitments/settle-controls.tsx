"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { inputClass } from "@/components/ui";
import { istToday } from "@/lib/engine/dates";
import { paiseToInput } from "@/lib/money";
import { editPayment, markPaid, skipOccurrence, undoPayment, type ActionResult } from "./payment-actions";

// Submits without React's automatic form reset, so typed values survive an error.
function submitWith(action: (data: FormData) => void) {
  return (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const data = new FormData(ev.currentTarget);
    startTransition(() => action(data));
  };
}

function Message({ state }: { state: ActionResult }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {state.error}
    </p>
  );
}

const smallButton = "h-9 rounded-lg px-3 text-sm font-medium disabled:opacity-60";

export function SettleControls({
  commitmentId,
  dueDate,
  expectedPaise,
  label,
}: {
  commitmentId: string;
  dueDate: string;
  expectedPaise: number;
  label: string;
}) {
  const [open, setOpen] = useState<"none" | "paid" | "skip">("none");
  const [paidState, paidAction, paidPending] = useActionState<ActionResult, FormData>(markPaid, {});
  const [skipState, skipAction, skipPending] = useActionState<ActionResult, FormData>(skipOccurrence, {});

  if (open === "paid") {
    return (
      <form onSubmit={submitWith(paidAction)} className="flex flex-col gap-2 pt-2" noValidate>
        <input type="hidden" name="commitment_id" value={commitmentId} />
        <input type="hidden" name="due_date" value={dueDate} />
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Amount paid (₹)
            <input name="amount" inputMode="decimal" defaultValue={expectedPaise > 0 ? paiseToInput(expectedPaise) : ""} aria-label={`Amount paid for ${label}`} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Paid on
            <input name="paid_on" type="date" defaultValue={istToday()} max={istToday()} aria-label={`Paid on for ${label}`} className={inputClass} />
          </label>
        </div>
        <Message state={paidState} />
        <div className="flex gap-2">
          <button type="submit" disabled={paidPending} className={`${smallButton} bg-accent text-accent-foreground`}>
            {paidPending ? "Saving…" : "Save payment"}
          </button>
          <button type="button" onClick={() => setOpen("none")} className={`${smallButton} text-muted`}>
            Close
          </button>
        </div>
      </form>
    );
  }

  if (open === "skip") {
    return (
      <form onSubmit={submitWith(skipAction)} className="flex flex-col gap-2 pt-2">
        <input type="hidden" name="commitment_id" value={commitmentId} />
        <input type="hidden" name="due_date" value={dueDate} />
        <p className="text-sm">Didn&apos;t need to pay this one (paused, waived or not billed)? It won&apos;t be counted.</p>
        <Message state={skipState} />
        <div className="flex gap-2">
          <button type="submit" disabled={skipPending} className={`${smallButton} border border-border`}>
            {skipPending ? "Saving…" : "Yes, skip it"}
          </button>
          <button type="button" onClick={() => setOpen("none")} className={`${smallButton} text-muted`}>
            Close
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex gap-2 pt-2">
      <button type="button" onClick={() => setOpen("paid")} className={`${smallButton} bg-accent text-accent-foreground`} aria-label={`Mark ${label} paid`}>
        Paid
      </button>
      <button type="button" onClick={() => setOpen("skip")} className={`${smallButton} border border-border`} aria-label={`Skip ${label}`}>
        Skip
      </button>
    </div>
  );
}

export function PaymentControls({
  paymentId,
  isPaid,
  amountPaise,
  paidOn,
  canUndo,
  undoBlockedReason,
}: {
  paymentId: string;
  isPaid: boolean;
  amountPaise: number;
  paidOn: string | null;
  canUndo: boolean;
  undoBlockedReason?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editState, editAction, editPending] = useActionState<ActionResult, FormData>(editPayment, {});
  const [undoState, undoAction, undoPending] = useActionState<ActionResult, FormData>(undoPayment, {});

  if (editing) {
    return (
      <form onSubmit={submitWith(editAction)} className="flex flex-col gap-2 pt-2" noValidate>
        <input type="hidden" name="payment_id" value={paymentId} />
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Amount paid (₹)
            <input name="amount" inputMode="decimal" defaultValue={paiseToInput(amountPaise)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Paid on
            <input name="paid_on" type="date" defaultValue={paidOn ?? ""} max={istToday()} className={inputClass} />
          </label>
        </div>
        <Message state={editState} />
        <div className="flex gap-2">
          <button type="submit" disabled={editPending} className={`${smallButton} bg-accent text-accent-foreground`}>
            {editPending ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className={`${smallButton} text-muted`}>
            Close
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-3 text-sm">
        {isPaid && (
          <button type="button" onClick={() => setEditing(true)} className="font-medium text-accent underline">
            Edit
          </button>
        )}
        {canUndo && (
          <form onSubmit={submitWith(undoAction)}>
            <input type="hidden" name="payment_id" value={paymentId} />
            <button type="submit" disabled={undoPending} className="font-medium text-accent underline disabled:opacity-60">
              {undoPending ? "Undoing…" : "Undo"}
            </button>
          </form>
        )}
      </div>
      {!canUndo && undoBlockedReason && <p className="text-xs text-muted">{undoBlockedReason}</p>}
      <Message state={undoState} />
    </div>
  );
}
