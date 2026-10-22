// Validation for a draft the user has confirmed. Runs on the server for every save (the
// browser's copy is never trusted) and in the browser to enable the Confirm button.
import { z } from "zod";
import type { ISODate } from "../engine/dates";
import { transactionSchema } from "../transactions";
import { PAYMENT_METHODS, SOURCES } from "./types";

export function confirmedDraftSchema(today: ISODate) {
  return z
    .object({
      clientRequestId: z.uuid("Missing request id"),
      source: z.enum(SOURCES),
      sourceRef: z.string().max(200).nullable(),
      kind: z.enum(["expense", "income"]),
      amount: z.string(),
      description: z.string().trim().min(1, "Add a short description").max(280, "Keep the description under 280 characters"),
      category: z.string(),
      occurredOn: z.string(),
      paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
    })
    .transform((v, ctx) => {
      const base = transactionSchema(today).safeParse({
        kind: v.kind,
        amount: v.amount,
        category: v.category,
        occurred_on: v.occurredOn,
        note: v.description,
      });
      if (!base.success) {
        for (const issue of base.error.issues) {
          const field = { occurred_on: "occurredOn", note: "description" }[String(issue.path[0])] ?? String(issue.path[0]);
          ctx.addIssue({ code: "custom", path: [field], message: issue.message });
        }
        return z.NEVER;
      }
      return {
        ...base.data,
        payment_method: v.paymentMethod,
        source: v.source,
        source_ref: v.sourceRef,
        client_request_id: v.clientRequestId,
      };
    });
}

export type ConfirmedDraftInput = z.input<ReturnType<typeof confirmedDraftSchema>>;
export type ConfirmedDraftRow = z.output<ReturnType<typeof confirmedDraftSchema>>;

// Possible duplicates: same direction and amount within a day either side. A warning only;
// the user can still save a genuinely separate transaction.
export const DUPLICATE_WINDOW_DAYS = 1;
