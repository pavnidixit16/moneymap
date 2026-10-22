# Input sources and extension points

MoneyMap can propose transactions from several sources, but **only one path saves them**,
and only after the user confirms each draft.

```
source-specific capture ─▶ ProposedTransaction ─▶ review screen ─▶ user confirms ─▶ server: validate,
(text, voice, CSV, …)      (src/lib/capture/      (editable,       (Confirm and      duplicate + card checks,
                            types.ts)              issues shown)    save)             idempotent insert
```

| Piece | File | Responsibility |
|---|---|---|
| Common shape | `src/lib/capture/types.ts` | `ProposedTransaction`: source, sourceRef, amount, date, category, payment method, issues, flags |
| Source registry | `src/lib/capture/sources.ts` | Which sources exist and whether they're available |
| Text / voice reader | `src/lib/capture/parse-text.ts` | Sentences, voice transcripts, pasted bank/UPI SMS and emails |
| Statement reader | `src/lib/capture/parse-csv.ts` | CSV bank/card statements; stable `sourceRef` per row |
| Validation | `src/lib/capture/draft.ts` | Shared schema, re-run on the server for every save |
| Save path | `src/app/(app)/spending/smart/actions.ts` | `checkDraft`, `confirmDraft`, `checkImportDuplicates`, `confirmImport` |
| Database guarantees | `supabase/migrations/…_smart_entry.sql` | `unique (user_id, client_request_id)` and `unique (user_id, source, source_ref)` |

## Guarantees every source gets for free

- Nothing is saved until the user taps **Confirm and save** on a draft.
- Server-side validation (positive amount, real date not more than a year ahead, valid category, known payment method).
- Possible-duplicate warning (same direction and amount within a day); the user can still save a genuinely separate transaction.
- Exactly-once saving per draft (`client_request_id`), even after double taps or lost responses.
- Re-importing the same item never duplicates it (`source` + `source_ref`).
- Credit-card bill payments are not saved as spending; card purchases warn if the card bill is also counted.
- Detected subscriptions are only suggestions until the user saves them under Commitments.
- Row-level security: every read and write runs as the signed-in user.

## Adding a source later (not built in this release)

1. Write a function that returns `ProposedTransaction[]` with `source` set and a **stable `sourceRef`**
   (e.g. Gmail message id, SMS id, bank transaction id). Reuse `parseText` for message bodies.
2. Mark the source available in `src/lib/capture/sources.ts` and add a tab or entry point that
   feeds the proposals into the existing review components.
3. Nothing else changes: validation, duplicate checks, confirmation and saving are shared.

### Source-specific prerequisites (none of these are started)

| Source | What it would need first |
|---|---|
| Gmail | Separate, explicit user consent; the `gmail.readonly` scope is *restricted* and requires Google verification plus an annual security assessment for public use; server-side encrypted token storage; a disconnect/revoke flow. |
| Android SMS | A native Android app (web apps cannot read SMS) and compliance with Google Play's SMS permission policy. iPhone does not allow apps to read SMS at all. |
| Bank accounts | A regulated Account Aggregator (RBI framework) partner and the user's consent through it. |
| UPI payments | Not planned: MoneyMap never initiates payments. |

Until then these sources are listed as **Not available yet** on the Smart add screen.
