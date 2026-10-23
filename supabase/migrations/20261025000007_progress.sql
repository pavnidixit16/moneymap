-- MoneyMap migration 7: Progress (daily check-ins and achievements).
-- Additive only: two new tables, two trigger functions and one trigger on transactions
-- that only writes to the new check-in table. No existing table, column, row or policy
-- changes, and no money amounts are stored anywhere in this migration.
--
-- daily_checkins   one row per user per India-time day (unique), saying how the user
--                  checked in: 'no_spend' (confirmed they spent nothing) or
--                  'reviewed_activity' (recorded or reviewed their activity). status
--                  'needs_review' = the user withdrew a no-spend declaration and hasn't
--                  recorded the spending yet; such days don't count toward streaks.
-- achievements     milestones earned once and kept, e.g. 'streak_7'. celebrated_at is set
--                  after the celebration has been shown, so it never repeats.

create table public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  local_date date not null,
  kind text not null check (kind in ('no_spend', 'reviewed_activity')),
  status text not null default 'confirmed' check (status in ('confirmed', 'needs_review')),
  confirmed_at timestamptz not null default now(),
  time_zone text not null default 'Asia/Kolkata' check (time_zone = 'Asia/Kolkata'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_checkins_user_day_unique unique (user_id, local_date)
);

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  key text not null check (key in ('money_mindful', 'consistency_builder', 'transaction_detective', 'streak_3', 'streak_7', 'streak_30')),
  earned_at timestamptz not null default now(),
  celebrated_at timestamptz,
  constraint achievements_user_key_unique unique (user_id, key)
);

-- Dates follow India time, like every other date in MoneyMap. A check-in can be made for
-- today only, and corrected for up to 7 days back; the server clock sets the timestamps.
create or replace function private.daily_checkins_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.local_date <> private.ist_today() then
    raise exception 'A check-in can only be made for today (India time)' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (new.local_date <> old.local_date or new.user_id <> old.user_id) then
    raise exception 'A check-in''s day and owner cannot change' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.local_date < private.ist_today() - 7 then
    raise exception 'Check-ins older than 7 days cannot be changed' using errcode = '23514';
  end if;
  new.time_zone := 'Asia/Kolkata';
  new.updated_at := now();
  if tg_op = 'INSERT' or new.kind is distinct from old.kind or new.status is distinct from old.status then
    new.confirmed_at := now();
  end if;
  return new;
end;
$$;

create trigger daily_checkins_before_write before insert or update on public.daily_checkins
  for each row execute function private.daily_checkins_before_write();

-- Recording or reviewing activity counts as today's check-in. Runs as the signed-in user,
-- so row-level security still applies. It never creates or changes a transaction.
--   * any saved entry (except sample data) gives today a 'reviewed_activity' check-in,
--     unless today already has one;
--   * an expense dated on a day marked no-spend, or on a day whose no-spend was withdrawn,
--     turns that day into 'reviewed_activity' (the user recorded what they spent).
create or replace function private.transactions_credit_checkin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source = 'sample' or new.user_id is distinct from auth.uid() then
    return new;
  end if;
  if new.kind = 'expense' and new.occurred_on >= private.ist_today() - 7 then
    update public.daily_checkins
       set kind = 'reviewed_activity', status = 'confirmed'
     where user_id = new.user_id and local_date = new.occurred_on
       and (kind = 'no_spend' or status = 'needs_review');
  end if;
  insert into public.daily_checkins (user_id, local_date, kind)
  values (new.user_id, private.ist_today(), 'reviewed_activity')
  on conflict (user_id, local_date) do nothing;
  return new;
end;
$$;

revoke all on function private.daily_checkins_before_write() from public, anon, authenticated;
revoke all on function private.transactions_credit_checkin() from public, anon, authenticated;

create trigger transactions_credit_checkin after insert on public.transactions
  for each row execute function private.transactions_credit_checkin();

-- Privileges: nothing for anonymous visitors; signed-in users act through RLS.
revoke all on public.daily_checkins, public.achievements from public, anon, authenticated;
grant select, insert, update, delete on public.daily_checkins to authenticated;
grant select, insert, delete on public.achievements to authenticated;
grant update (celebrated_at) on public.achievements to authenticated;

alter table public.daily_checkins enable row level security;
alter table public.achievements enable row level security;

create policy "Owners can read their check-ins" on public.daily_checkins
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Owners can add check-ins" on public.daily_checkins
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Owners can update their check-ins" on public.daily_checkins
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owners can remove their check-ins" on public.daily_checkins
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "Owners can read their achievements" on public.achievements
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Owners can add achievements" on public.achievements
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Owners can mark achievements celebrated" on public.achievements
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owners can remove their achievements" on public.achievements
  for delete to authenticated using (user_id = (select auth.uid()));
