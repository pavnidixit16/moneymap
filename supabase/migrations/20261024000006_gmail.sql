-- MoneyMap migration 6: Gmail connection (Testing mode).
-- Additive only: two new tables. No existing table, column, row, function or policy changes.
--
-- gmail_connections   one row per user who chose "Connect Gmail". Holds the Google address
--                     and the refresh token ENCRYPTED by the app (AES-256-GCM). The key
--                     lives only in Vercel's environment, never in the database, so this
--                     column is unreadable ciphertext to anyone with database access.
-- gmail_dismissed     ids of Gmail messages the user chose to hide, so the next check
--                     doesn't propose them again. Only the opaque Gmail message id and the
--                     time; never the subject, sender, text or amount.
--
-- No email content is stored anywhere. Emails are read on demand while the user reviews
-- them; a confirmed transaction keeps only the message id (transactions.source_ref) so
-- the same email can never be saved twice.

create table public.gmail_connections (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  google_email text not null check (char_length(google_email) between 3 and 320),
  encrypted_refresh_token text not null check (char_length(encrypted_refresh_token) between 20 and 4096),
  scope text not null check (char_length(scope) <= 500),
  status text not null default 'connected' check (status in ('connected', 'needs_reconnect')),
  connected_at timestamptz not null default now(),
  last_checked_at timestamptz
);

create table public.gmail_dismissed (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  message_id text not null check (message_id ~ '^[0-9a-zA-Z_-]{6,64}$'),
  dismissed_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

-- Privileges: nothing for anonymous visitors; signed-in users act through RLS.
revoke all on public.gmail_connections, public.gmail_dismissed from public, anon, authenticated;
grant select, insert, update, delete on public.gmail_connections to authenticated;
grant select, insert, delete on public.gmail_dismissed to authenticated;

alter table public.gmail_connections enable row level security;
alter table public.gmail_dismissed enable row level security;

create policy "Owners can read their Gmail connection" on public.gmail_connections
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Owners can add their Gmail connection" on public.gmail_connections
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Owners can update their Gmail connection" on public.gmail_connections
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owners can remove their Gmail connection" on public.gmail_connections
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "Owners can read their hidden Gmail messages" on public.gmail_dismissed
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Owners can hide Gmail messages" on public.gmail_dismissed
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Owners can unhide Gmail messages" on public.gmail_dismissed
  for delete to authenticated using (user_id = (select auth.uid()));
