-- MoneyMap migration 4: richer commitment details and a "bills" expense category.
-- No calculation rule changes:
--   * provider        - card issuer, insurer, bank or fund house (display only)
--   * coverage_paise  - insurance sum insured (display only; never counted anywhere)
--   * transactions.category gains 'bills' for one-off bills that are not commitments
-- Safe to run once on top of migrations 1-3.

alter table public.commitments
  add column if not exists provider text check (char_length(provider) <= 80),
  add column if not exists coverage_paise bigint check (coverage_paise between 0 and 100000000000);

alter table public.transactions drop constraint if exists transactions_category_check;
alter table public.transactions add constraint transactions_category_check check (category in (
  'food', 'groceries', 'shopping', 'transport', 'entertainment', 'healthcare',
  'personal_care', 'education', 'travel', 'bills', 'other', 'income'));
