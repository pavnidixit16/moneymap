-- MoneyMap migration 5: smart expense entry.
-- Additive only: new optional columns and unique constraints. No existing data changes
-- and no calculation rule changes.
--
-- transactions
--   payment_method     how it was paid, when known (display + card double-count warning)
--   source             where the entry came from: manual, text, voice, document, sample
--                      (gmail, sms and bank are reserved for future, unbuilt integrations)
--   source_ref         stable reference from the source, e.g. a statement-row fingerprint;
--                      unique per user, so re-importing the same statement can't duplicate
--   client_request_id  one id per confirmed draft; unique per user, so tapping Confirm
--                      twice or retrying after a timeout saves exactly once
-- commitments
--   interest_rate_bps  optional FD interest rate (basis points), display only

alter table public.transactions
  add column if not exists payment_method text
    check (payment_method in ('upi', 'debit_card', 'credit_card', 'cash', 'net_banking', 'other')),
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'text', 'voice', 'document', 'sample', 'gmail', 'sms', 'bank')),
  add column if not exists source_ref text check (char_length(source_ref) <= 200),
  add column if not exists client_request_id uuid;

-- NULLs never collide, so ordinary manual entries are unaffected.
alter table public.transactions
  add constraint transactions_user_request_unique unique (user_id, client_request_id),
  add constraint transactions_user_source_ref_unique unique (user_id, source, source_ref);

alter table public.commitments
  add column if not exists interest_rate_bps integer check (interest_rate_bps between 0 and 5000);
