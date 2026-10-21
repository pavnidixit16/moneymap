-- MoneyMap migration 3: settle and undo due dates.
-- Two functions the app calls, both SECURITY INVOKER (they run as the signed-in user,
-- so row-level security still applies) with an empty search_path:
--   public.resolve_occurrences(commitment, items) - Mark paid, Skip and Catch up
--   public.undo_payment(payment)                  - Undo the latest record of an item
-- Editing a payment's amount or paid date is a plain update (RLS + trigger checks).

-- Schedule edits are stamped with the real clock rather than the transaction start, so
-- "recorded before the last schedule edit" is exact even within one transaction.
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
      new.schedule_updated_at := clock_timestamp();
    end if;
  end if;

  return new;
end;
$$;

-- The date after `d` on a schedule, or null for one-time items. Mirrors
-- src/lib/engine/schedule.ts nextOccurrence.
create or replace function private.next_occurrence(d date, frequency text, anchor_day int)
returns date
language sql
immutable
set search_path = ''
as $$
  select case frequency
    when 'one_time' then null
    when 'weekly' then d + 7
    else private.clamped_date(
      ((extract(year from d)::int * 12 + extract(month from d)::int - 1
        + case frequency when 'monthly' then 1 when 'quarterly' then 3 when 'half_yearly' then 6 else 12 end) / 12),
      ((extract(year from d)::int * 12 + extract(month from d)::int - 1
        + case frequency when 'monthly' then 1 when 'quarterly' then 3 when 'half_yearly' then 6 else 12 end) % 12) + 1,
      coalesce(anchor_day, extract(day from d)::int))
  end;
$$;
revoke all on function private.next_occurrence(date, text, int) from public, anon, authenticated;
grant execute on function private.next_occurrence(date, text, int) to authenticated;

-- Moves next_due_date forward past dates that already have a record, ending the item
-- when its schedule runs out. Caller must hold the row lock.
create or replace function private.refresh_next_due(p_commitment_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  c public.commitments%rowtype;
  d date;
  steps int := 0;
begin
  select * into c from public.commitments where id = p_commitment_id;
  d := c.next_due_date;
  while d is not null
        and exists (select 1 from public.commitment_payments p where p.commitment_id = c.id and p.due_date = d)
        and steps < 1000 loop
    d := private.next_occurrence(d, c.frequency, c.anchor_day);
    if d is not null and c.end_date is not null and d > c.end_date then
      d := null;
    end if;
    steps := steps + 1;
  end loop;

  perform set_config('moneymap.internal', 'on', true);
  if d is null then
    update public.commitments set next_due_date = null, status = 'ended' where id = c.id;
  else
    update public.commitments set next_due_date = d where id = c.id;
  end if;
  perform set_config('moneymap.internal', '', true);
end;
$$;
revoke all on function private.refresh_next_due(uuid) from public, anon, authenticated;
grant execute on function private.refresh_next_due(uuid) to authenticated;

-- Records one or more due dates of a commitment as paid / skipped / paid_unrecorded.
-- p_items: [{"due_date":"2026-10-05","outcome":"paid","amount_paise":100000,"paid_on":"2026-10-06"}, ...]
-- Every date must be on the item's schedule and not yet resolved. All or nothing.
create or replace function public.resolve_occurrences(p_commitment_id uuid, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c public.commitments%rowtype;
  item jsonb;
  v_due date;
  d date;
  steps int;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Nothing to record' using errcode = '22023';
  end if;

  -- Row lock: a double tap waits here, then fails on the duplicate check below.
  select * into c from public.commitments where id = p_commitment_id for update;
  if not found then
    raise exception 'Commitment not found' using errcode = 'P0002';
  end if;
  if c.status <> 'active' then
    raise exception 'Only active items can be updated' using errcode = '22023';
  end if;
  if c.tracking_mode = 'info' or c.next_due_date is null then
    raise exception 'This item has no due dates' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_items) loop
    v_due := (item ->> 'due_date')::date;

    if exists (select 1 from public.commitment_payments x where x.commitment_id = c.id and x.due_date = v_due) then
      raise exception 'That date is already recorded' using errcode = '23505';
    end if;

    -- On the schedule: reachable from next_due_date by whole steps, within the end date.
    d := c.next_due_date;
    steps := 0;
    while d is not null and d < v_due and steps < 1000 loop
      d := private.next_occurrence(d, c.frequency, c.anchor_day);
      steps := steps + 1;
    end loop;
    if d is distinct from v_due or (c.end_date is not null and v_due > c.end_date) then
      raise exception 'That date is not on this item''s schedule' using errcode = '22023';
    end if;

    insert into public.commitment_payments (commitment_id, due_date, outcome, amount_paise, paid_on)
    values (
      c.id,
      v_due,
      item ->> 'outcome',
      case when item ->> 'outcome' = 'paid' then (item ->> 'amount_paise')::bigint else 0 end,
      case when item ->> 'outcome' = 'paid' then (item ->> 'paid_on')::date else null end
    );
  end loop;

  perform private.refresh_next_due(c.id);
end;
$$;

-- Removes the latest record (by due date) of a commitment and reopens that date.
-- Refused for records made before the item's schedule was last edited, because the
-- reopened date might not fit the new schedule; those can still be edited.
create or replace function public.undo_payment(p_payment_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  p public.commitment_payments%rowtype;
  c public.commitments%rowtype;
begin
  select * into p from public.commitment_payments where id = p_payment_id;
  if not found then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;

  select * into c from public.commitments where id = p.commitment_id for update;

  if exists (select 1 from public.commitment_payments x
             where x.commitment_id = c.id and x.due_date > p.due_date) then
    raise exception 'Only the latest payment can be undone' using errcode = '22023';
  end if;
  if p.created_at < c.schedule_updated_at then
    raise exception 'The schedule changed after this payment, so it can only be edited' using errcode = '22023';
  end if;

  delete from public.commitment_payments where id = p.id;

  perform set_config('moneymap.internal', 'on', true);
  update public.commitments
  set next_due_date = case when next_due_date is null or next_due_date > p.due_date then p.due_date else next_due_date end,
      status = case when status = 'ended' then 'active' else status end
  where id = c.id;
  perform set_config('moneymap.internal', '', true);
end;
$$;

revoke all on function public.resolve_occurrences(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.undo_payment(uuid) from public, anon, authenticated;
grant execute on function public.resolve_occurrences(uuid, jsonb) to authenticated;
grant execute on function public.undo_payment(uuid) to authenticated;
