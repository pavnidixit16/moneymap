-- MoneyMap migration 1: tables, constraints, row-level security, profile trigger.
-- Run once in the Supabase SQL Editor (see docs/SETUP.md). Safe to read top to bottom:
-- it creates objects only and touches no existing data.

-- ---------------------------------------------------------------------------
-- Private schema: helpers and trigger functions that must not be exposed by the
-- Data API. Signed-in users may call the pure date helpers, nothing else.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- Today's date in India, independent of the server's timezone.
create or replace function private.ist_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Kolkata')::date;
$$;

-- The given day of month, clamped to the month's last day (payday 31 -> 30 Apr).
create or replace function private.clamped_date(y int, m int, d int)
returns date
language sql
immutable
set search_path = ''
as $$
  select make_date(
    y, m,
    least(d, extract(day from (make_date(y, m, 1) + interval '1 month - 1 day'))::int)
  );
$$;

-- First day of the pay cycle that contains `on_date`.
create or replace function private.cycle_start(payday int, on_date date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when private.clamped_date(extract(year from on_date)::int, extract(month from on_date)::int, payday) <= on_date
      then private.clamped_date(extract(year from on_date)::int, extract(month from on_date)::int, payday)
    else private.clamped_date(
      extract(year from (on_date - interval '1 month'))::int,
      extract(month from (on_date - interval '1 month'))::int,
      payday)
  end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.ist_today() to authenticated;
grant execute on function private.clamped_date(int, int, int) to authenticated;
grant execute on function private.cycle_start(int, date) to authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  monthly_income_paise bigint not null default 0
    check (monthly_income_paise between 0 and 10000000000),
  cycle_budget_paise bigint not null default 0
    check (cycle_budget_paise between 0 and 10000000000),
  payday_day smallint not null default 1 check (payday_day between 1 and 31),
  currency text not null default 'INR' check (currency = 'INR'),
  timezone text not null default 'Asia/Kolkata' check (timezone = 'Asia/Kolkata'),
  ui_variant text not null default 'standalone' check (ui_variant in ('standalone', 'payapp')),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Creates the profile row when someone signs up. The only SECURITY DEFINER function.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 80)
  );
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- transactions: ordinary expenses and extra income
-- ---------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('expense', 'income')),
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 1000000000),
  category text not null check (category in (
    'food', 'groceries', 'shopping', 'transport', 'entertainment', 'healthcare',
    'personal_care', 'education', 'travel', 'other', 'income')),
  occurred_on date not null check (occurred_on between '2000-01-01' and '2100-12-31'),
  note text check (char_length(note) <= 280),
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint income_category_matches_kind check ((kind = 'income') = (category = 'income'))
);
create index transactions_user_date_idx on public.transactions (user_id, occurred_on);

-- ---------------------------------------------------------------------------
-- commitments: bills, loans, cards, insurance, subscriptions, investments
-- ---------------------------------------------------------------------------
create table public.commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  kind text not null check (kind in (
    'bill', 'loan', 'credit_card', 'insurance', 'subscription', 'investment', 'other')),
  subtype text not null default 'other' check (subtype in (
    'rent', 'maintenance', 'electricity', 'water', 'gas', 'internet', 'mobile',
    'credit_card', 'home_loan', 'vehicle_loan', 'personal_loan', 'education_loan',
    'health', 'life', 'vehicle', 'ott', 'music', 'software', 'gym', 'education',
    'sip', 'rd', 'fd', 'ppf', 'epf', 'other')),
  tracking_mode text not null check (tracking_mode in ('outflow', 'reminder', 'info')),
  amount_paise bigint not null default 0 check (amount_paise between 0 and 10000000000),
  amount_is_estimate boolean not null default false,
  previous_amount_paise bigint check (previous_amount_paise >= 0),
  amount_changed_on date,
  frequency text not null check (frequency in (
    'one_time', 'weekly', 'monthly', 'quarterly', 'half_yearly', 'yearly')),
  anchor_day smallint check (anchor_day between 1 and 31),
  next_due_date date,
  start_date date,
  end_date date,
  maturity_date date,
  status text not null default 'active' check (status in ('active', 'cancelled', 'ended')),
  review_status text not null default 'unreviewed'
    check (review_status in ('unreviewed', 'keep', 'review')),
  notes text check (char_length(notes) <= 500),
  is_sample boolean not null default false,
  schedule_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commitments_id_user_unique unique (id, user_id),
  constraint active_items_need_due_date
    check (status <> 'active' or tracking_mode = 'info' or next_due_date is not null),
  constraint info_items_have_no_due_date
    check (tracking_mode <> 'info' or next_due_date is null),
  constraint outflow_items_need_amount
    check (tracking_mode <> 'outflow' or amount_paise > 0),
  constraint end_not_before_start
    check (end_date is null or start_date is null or end_date >= start_date)
);
create index commitments_user_due_idx on public.commitments (user_id, next_due_date);

-- Keeps anchor_day, price-change history and schedule_updated_at consistent.
-- Payment functions (migration 2) set moneymap.internal = 'on' when they advance the
-- due date, so that does not count as a user schedule edit.
create or replace function private.commitments_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.frequency in ('monthly', 'quarterly', 'half_yearly', 'yearly')
     and new.anchor_day is null and new.next_due_date is not null then
    new.anchor_day := extract(day from new.next_due_date)::smallint;
  end if;

  if tg_op = 'UPDATE' then
    if new.amount_paise > old.amount_paise then
      new.previous_amount_paise := old.amount_paise;
      new.amount_changed_on := private.ist_today();
    end if;

    if coalesce(current_setting('moneymap.internal', true), '') <> 'on'
       and (new.frequency is distinct from old.frequency
            or new.next_due_date is distinct from old.next_due_date
            or new.anchor_day is distinct from old.anchor_day
            or new.end_date is distinct from old.end_date) then
      new.schedule_updated_at := now();
    end if;
  end if;

  return new;
end;
$$;

create trigger commitments_before_write
  before insert or update on public.commitments
  for each row execute function private.commitments_before_write();

-- ---------------------------------------------------------------------------
-- commitment_payments: how each due date was resolved
-- ---------------------------------------------------------------------------
create table public.commitment_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  commitment_id uuid not null,
  due_date date not null,
  outcome text not null check (outcome in ('paid', 'skipped', 'paid_unrecorded')),
  amount_paise bigint not null default 0 check (amount_paise between 0 and 10000000000),
  paid_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_commitment_owner_fk foreign key (commitment_id, user_id)
    references public.commitments (id, user_id) on delete cascade,
  constraint one_record_per_due_date unique (commitment_id, due_date),
  constraint outcome_fields_consistent check (
    (outcome = 'paid' and amount_paise > 0 and paid_on is not null)
    or (outcome <> 'paid' and amount_paise = 0 and paid_on is null))
);
create index payments_user_paid_on_idx on public.commitment_payments (user_id, paid_on);

-- Rules that need "today" or other rows, so they cannot be CHECK constraints.
create or replace function private.payments_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_today date := private.ist_today();
  v_payday int;
  v_mode text;
  v_status text;
begin
  if new.paid_on is not null and new.paid_on > v_today then
    raise exception 'Paid date cannot be in the future' using errcode = '22023';
  end if;

  select c.tracking_mode, c.status into v_mode, v_status
  from public.commitments c
  where c.id = new.commitment_id and c.user_id = new.user_id;

  if v_mode = 'info' then
    raise exception 'Info-only items cannot be paid' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' and v_status = 'cancelled' then
    raise exception 'Cancelled items cannot receive new payments' using errcode = '22023';
  end if;

  if new.outcome = 'paid_unrecorded' then
    select p.payday_day into v_payday from public.profiles p where p.id = new.user_id;
    if new.due_date >= private.cycle_start(coalesce(v_payday, 1), v_today) then
      raise exception 'Paid earlier (amount not recorded) is only allowed before the current pay cycle'
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create trigger payments_before_write
  before insert or update on public.commitment_payments
  for each row execute function private.payments_before_write();

-- updated_at maintenance
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger transactions_updated_at before update on public.transactions
  for each row execute function private.set_updated_at();
create trigger commitments_updated_at before update on public.commitments
  for each row execute function private.set_updated_at();
create trigger payments_updated_at before update on public.commitment_payments
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges: nothing for anonymous visitors; signed-in users act through RLS.
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.transactions, public.commitments,
  public.commitment_payments from public, anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, monthly_income_paise, cycle_budget_paise, payday_day,
  ui_variant, onboarded_at) on public.profiles to authenticated;
grant select, insert, update, delete on public.transactions, public.commitments,
  public.commitment_payments to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security: every row is visible and writable only by its owner.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.commitments enable row level security;
alter table public.commitment_payments enable row level security;

create policy "Owners can read their profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "Owners can update their profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Owners can read their transactions" on public.transactions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Owners can add transactions" on public.transactions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Owners can update their transactions" on public.transactions
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owners can delete their transactions" on public.transactions
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "Owners can read their commitments" on public.commitments
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Owners can add commitments" on public.commitments
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Owners can update their commitments" on public.commitments
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owners can delete their commitments" on public.commitments
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "Owners can read their payments" on public.commitment_payments
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Owners can add payments" on public.commitment_payments
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Owners can update their payments" on public.commitment_payments
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owners can delete their payments" on public.commitment_payments
  for delete to authenticated using (user_id = (select auth.uid()));
