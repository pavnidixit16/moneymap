# MoneyMap — Specification v3 (approved)

This is the single source of truth for the six-day MVP. If code and this document
disagree, the document wins until it is deliberately changed.

Tags: **[MVP]** required for the working product · **[EXP]** only for the optional
entry-screen experiment · **[LATER]** deferred.

---

## 1. Product

**Promise:** Know what's already committed, what's due next, and roughly how much of
your money remains until payday.

**Problem hypothesis (unvalidated):** Working professionals in India manage rent,
EMIs, card bills, insurance, subscriptions and SIPs/RDs across many places and cannot
easily see what is already committed before payday.

**Target users:** salaried professionals in India, 20–36, with three or more recurring
commitments. One account per person.

**Positioning:** a forward-looking commitments planner, not a backward-looking expense
tracker. We do **not** claim "everything in one place", automation, or affiliation with
any payment app.

**Hypotheses**

- H1 (primary): a forward-looking overview answers "can I afford this before payday?"
  better than the user's current method.
- H2: users will spend ~10 minutes entering 5+ commitments.
- H3: a transparent estimate is believable and useful even though it is not a balance.
- H4: annualised subscription costs prompt at least one review decision.
- H5 [EXP]: a familiar payment-app-style entry point improves discoverability. This
  says nothing about trust.

**Success metrics (5–10 testers):** ≥70% finish setup with 3+ commitments in the first
session; median time to a useful overview under 10 minutes; ≥60% say the estimate is
roughly right; ≥60% answer the affordability task faster or more confidently than with
their current method; ≥40% make a review decision; zero confirmed calculation bugs.

### Out of scope for the six-day build

Gmail integration, bank / Account Aggregator data, phone OTP, PhonePe or any real
payment-app integration, automatic transaction detection, payment processing, live
market data, tax, advice, household sharing, push/email reminders.

---

## 2. Main user journey [MVP]

1. Sign in with Google.
2. Setup: take-home income, payday (1–31), spending budget per pay cycle.
3. Add commitments via quick-add chips; sensible tracking-mode defaults.
4. Bring status up to date: Mark paid, Skip, or Catch up for missed dates.
5. Optionally log ordinary expenses.
6. Overview: **Estimated amount remaining after recorded spending and commitments**,
   with its breakdown; then due next / overdue, planned investments, spending vs
   budget, coming up (maturities and renewals).
7. Review: subscriptions with yearly cost; Keep / Review / Cancelled.

---

## 3. Screens

Five essential screens [MVP]. Add/edit forms are bottom sheets, not screens.

| # | Screen | Content | States |
|---|---|---|---|
| 1 | Sign-in | Promise; privacy note (no bank access; never asks for passwords, PINs or OTPs; the app owner can technically see stored data during testing); "Independent prototype, not affiliated with any payment app"; Google button | OAuth error; signed-in users redirected |
| 2 | Overview | Hero estimate + breakdown → due next (overdue first) → planned investments → spending vs cycle budget by category → coming up (60 days) → review nudge | First-run setup; guided empty state; skeleton; error with retry (never a fake ₹0) |
| 3 | Commitments | Tabs: Upcoming / All / Review; per-item payment history | Empty state with chips; badges: Estimate, Reminder only, Info only |
| 4 | Spending | Cycle list and total; cycle switcher | Empty: "Optional — your commitments still drive the estimate" |
| 5 | Settings | Income, payday, cycle budget, name; sample data; sign out; delete my data | Validation |

Optional [EXP] screen 6 — payment-app-style home. Built only after every MVP acceptance
criterion passes on production; omitted if time is short. See §11.

---

## 4. Prioritisation

### Must-have [MVP]

1. Google sign-in/out; automatic profile; protected routes redirect to sign-in.
2. Access control per §6, verified by the two-user SQL test and Supabase advisors.
3. Settings: take-home income, payday (1–31), spending budget per pay cycle.
4. Commitments CRUD: bills, rent, utilities, loans, credit cards, insurance,
   subscriptions, investments (SIP, RD, FD, PPF, EPF, other); six frequencies; next
   due / end / maturity dates; Outflow / Reminder / Info with defaults; estimate flag;
   notes; cancel; delete with warning.
5. Settling: Mark paid (editable amount and date), Skip, Catch up (§8), Undo latest,
   edit any payment, payment history.
6. Expenses CRUD; rent and utilities are not expense categories.
7. Pay-cycle engine R1–R10 with automated tests for both worked examples and every
   edge case in §7.
8. Overview as described in §3 with breakdown and bank-balance disclaimer.
9. Upcoming tab: overdue plus next 60 days.
10. Review: monthly/yearly equivalents; Keep / Review / Cancelled; provider disclaimer.
11. Empty, loading and error states; validation.
12. GitHub repo; Vercel production deploy; works at 360px width.

### Should-have, in order

1. Load/clear sample data (required if the experiment runs).
2. Factual review flags: price increased, several items of the same subtype, small
   payments total.
3. Extra income entries (the engine already supports them).
4. Delete my data.
5. Previous-cycle view.
6. "Did you mean to mark X paid?" hint when adding an expense.

### Cut order if behind

[EXP] → Should-haves bottom-up → category chart as plain list → Upcoming limited to
"until payday". **Never cut:** access control, correct calculations, Paid / Undo /
Catch up, the breakdown and its disclaimer.

---

## 5. Data model

Conventions: money as `bigint` paise; dates as `date` in Asia/Kolkata; enumerations as
`text` + `CHECK`; every user row has `user_id default auth.uid()`, `created_at`,
`updated_at`. Currency fixed to INR.

### profiles
`id` (PK, → auth.users, cascade) · `display_name` · `monthly_income_paise` ≥ 0 ·
`cycle_budget_paise` ≥ 0 · `payday_day` 1–31 default 1 · `currency` = 'INR' ·
`timezone` = 'Asia/Kolkata' · `ui_variant` ('standalone' | 'payapp') [EXP] ·
`onboarded_at`. Created only by a trigger on `auth.users`.

### transactions
`kind` ('expense' | 'income') · `amount_paise` > 0 · `category` (food, groceries,
shopping, transport, entertainment, healthcare, personal_care, education, travel,
other; `income` iff kind = income) · `occurred_on` · `note` ≤ 280 · `is_sample`.

### commitments
`name` 1–80 · `kind` (bill, loan, credit_card, insurance, subscription, investment,
other) · `subtype` · `tracking_mode` (outflow | reminder | info) · `amount_paise` ·
`amount_is_estimate` · `previous_amount_paise`, `amount_changed_on` · `frequency`
(one_time, weekly, monthly, quarterly, half_yearly, yearly) · `anchor_day` 1–31 ·
`next_due_date` · `start_date` · `end_date` (last instalment) · `maturity_date` ·
`status` (active, cancelled, ended) · `review_status` (unreviewed, keep, review) ·
`notes` ≤ 500 · `is_sample` · `schedule_updated_at`.

Rules:
- Active outflow/reminder items must have `next_due_date`.
- Info items never have `next_due_date` and cannot be paid.
- Outflow items need `amount_paise` > 0.
- Defaults: credit_card → reminder; fd, epf → info; everything else → outflow.

### commitment_payments
`commitment_id` (composite FK with `user_id` → commitments, cascade) · `due_date` ·
`outcome` (paid | skipped | paid_unrecorded) · `amount_paise` · `paid_on`.
- paid ⇒ amount > 0 and `paid_on` set (not in the future, IST).
- skipped / paid_unrecorded ⇒ amount 0 and no `paid_on`.
- paid_unrecorded only for due dates before the current pay cycle.
- One row per (commitment, due date).

---

## 6. Access control

- RLS enabled on all four tables; every policy is `user_id = (select auth.uid())`
  (profiles: `id`), with matching `WITH CHECK` on insert/update.
- `anon` has no table privileges. Profiles: select/update by the owner only; no
  client insert or delete.
- The composite FK makes a payment against another user's commitment impossible.
- Write functions (mark paid, skip, catch up, undo, edit payment) are `SECURITY
  INVOKER`, with `search_path = ''`; they lock the commitment row and validate inputs.
  Execute is granted to `authenticated` only.
- The profile trigger is the only `SECURITY DEFINER` function; it lives in a
  non-exposed `private` schema and only inserts the profile row.
- Server code verifies identity with `auth.getClaims()` / `auth.getUser()`, never an
  unverified cookie.
- Only the project URL and publishable/anon key reach the browser. No service-role key
  in the MVP (Delete my data, if built, runs server-side only).
- Verification: two-user SQL test committed to the repo; Supabase security advisor
  shows no errors; auth redirects limited to the production URL and localhost.

---

## 7. Calculation rules

**Pay cycle:** `cycle_start` = latest payday on or before today (IST), with the payday
clamped to the month's last day; `cycle_end` = the day before the next payday.

**Buckets:** Investments = kind `investment` with mode outflow. Obligations = every
other kind with mode outflow. Reminder and Info never count in any total.

**Occurrence states (derived):** paid, skipped, paid unrecorded, overdue (before today,
unresolved, active), due today, upcoming.

| Figure | Rule |
|---|---|
| R1 Income | `monthly_income` + income transactions in the cycle |
| R2 Ordinary spending | expense transactions in the cycle |
| R3 Budget left | `cycle_budget − R2` (negative shown as "over by") |
| R4 Obligations paid | `paid` payments with `paid_on` in the cycle, Obligations |
| R5 Investments contributed | same, Investments |
| R6 Obligations still due | unresolved projected occurrences of active Obligations dated ≤ `cycle_end`, including overdue from earlier cycles, at expected amount |
| R7 Investments still due | same, Investments |
| R8 Estimated amount remaining | R1 − R2 − R4 − R5 − R6 − R7 |
| R9 Planned investments | R5 + R7 |
| R10 Subscription equivalents | weekly ×52÷12, monthly ×1, quarterly ÷3, half-yearly ÷6, yearly ÷12; one-time excluded; yearly = monthly × 12 |

**Label for R8:** "Estimated amount remaining after recorded spending and commitments".
Always shown with: "This is an estimate based only on what you've recorded in
MoneyMap. It is not your bank balance. It excludes your opening balance, savings left
over from earlier cycles and investment returns." Plus "Includes estimated amounts"
when R6/R7 contain estimates, and "Your commitments leave less than your remaining
budget" when R8 < R3. The breakdown lists every line so the figure can be checked.

**No double counting:** spending lives only in `transactions`; commitment money lives
only in payments (past) or projections (future); a date is either resolved or
projected, never both; card bills default to reminder; EPF and FD default to info.

**Payments count in the cycle of `paid_on`** (D4); `due_date` is preserved.

### Worked example 1 (today 20 Oct 2026, payday 1 → cycle 1–31 Oct)

Income ₹80,000; budget ₹20,000; expenses 4,000 + 2,500 + 1,500 → R2 = 8,000, R3 = 12,000.
Rent 22,000 paid 5 Oct + car EMI 9,500 paid 10 Oct → R4 = 31,500. SIP 5,000 paid 15 Oct
→ R5 = 5,000. Electricity ~1,800 (estimate) due 25 Oct + Netflix 649 due 28 Oct →
R6 = 2,449. RD 2,000 due 10 Oct unpaid → R7 = 2,000 (overdue). Credit card ₹14,000 due
22 Oct (reminder) not counted. EPF (info) not counted. Health insurance due 12 Mar 2027
outside cycle. FD ₹1,00,000 maturing 15 Nov in "coming up" only.
**R8 = 31,051; R9 = 7,000.**

### Worked example 2 (today 20 Oct 2026, payday 25 → cycle 25 Sep – 24 Oct)

Income ₹60,000; budget ₹15,000; expenses ₹9,000 → R3 = 6,000.
Broadband ₹1,000 due on the 5th: 5 Aug → paid unrecorded; 5 Sep → paid ₹1,000 on 6 Sep
(previous cycle); 5 Oct unresolved → R6 = 1,000; next due = 5 Oct.
Rent ₹18,000 due on the 1st: 1 Oct paid 30 Sep; 1 Nov paid early 19 Oct → R4 = 36,000;
next due 1 Dec. SIP ₹3,000 due on the 30th: 30 Sep paid 30 Sep → R5 = 3,000; 30 Oct is
after cycle end → R7 = 0. Credit card ₹9,000 due 22 Oct (reminder) not counted.
**R8 = 11,000.**

### Recurring-date edge cases (automated tests)

| Case | Expected |
|---|---|
| Monthly, anchor 31, from 31 Oct 2026 | 30 Nov, 31 Dec, 31 Jan, 28 Feb 2027, 31 Mar |
| Quarterly, anchor 31, from 31 Jan 2027 | 30 Apr, 31 Jul, 31 Oct |
| Yearly, anchor 29 Feb 2028 | 28 Feb 2029 … 29 Feb 2032 |
| Weekly | +7 days |
| Payday 31, today 20 Oct 2026 | cycle 30 Sep – 30 Oct; next 31 Oct – 29 Nov |
| Payday 30 around February 2027 | 30 Jan – 27 Feb; 28 Feb – 29 Mar |
| End date | nothing projected after it; resolving the last date → ended |
| One-time | single occurrence; resolving it → ended |
| Gaps | projections skip any date that already has a payment row |
| Double tap | one row per date |
| "Today" | IST everywhere, including between 00:00 and 05:30 IST |
| Runaway | at most 120 projected dates per item |
| Schedule edited | projection restarts from the new next due date; history kept |

---

## 8. Catch up, Undo and payment edits

**Catch up** appears when an item has two or more unresolved past dates. One row per
missed date, oldest first, **nothing pre-selected**. Per row the user picks:

- **Paid** — amount (prefilled with the expected amount) and paid date (prefilled with
  the due date, not later than today). Counts in the cycle of the paid date.
- **Didn't need to pay** — recorded as skipped. Counts nowhere.
- **Paid earlier, amount not recorded** — only for dates before the current cycle;
  counts nowhere.
- **Leave unresolved** (default) — stays overdue and stays in "still due".

Nothing is ever marked paid automatically. Only chosen rows are saved. `next_due_date`
becomes the earliest unresolved date. When adding an item, a first due date more than
one period in the past triggers a warning suggesting the next upcoming date.

**Undo** removes the most recent payment of an item and reopens its date
(`next_due_date = least(current, undone date)`). Payments recorded before the latest
schedule edit cannot be undone, only edited.

**Edit** changes the amount or paid date of any payment; it never touches the schedule.

Copy: "Undo removes the latest payment and marks that bill unpaid again. To fix an
older payment, edit its amount or date."

---

## 9. Acceptance criteria

**Auth & security** — A1 new Google user signs in on production and gets exactly one
profile. A2 signed-out access to a protected route redirects to sign-in. A3 user B
cannot read/update/delete user A's rows in any table (UI or REST). A4 anon key alone
returns nothing. A5 payment against another user's commitment fails. A6 no secret in the
client bundle or git history; `.env*` ignored.

**Settings** — S1 values persist and update the overview. S2 payday 31 gives correct
cycles in 30-day months and February.

**Expenses** — X1 CRUD persists and updates R2/R3. X2 invalid amount (≤ 0, non-numeric,
> ₹1 crore), missing date/category, or date > 1 year ahead rejected inline. X3 no rent
or utilities category.

**Commitments** — K1 every kind × frequency can be created; active outflow/reminder
without a due date rejected. K2 defaults: credit card → reminder, FD/EPF → info. K3
month-end anchoring per §7. K4 overdue / due today / upcoming shown correctly. K5 Mark
paid with edited amount records it and advances; Undo restores. K6 double tap → one
payment. K7 Skip advances without changing totals. K8 Catch up saves only the user's
choices; unresolved rows remain overdue; paid unrecorded unavailable for current-cycle
dates. K9 one-time paid → ended. K10 nothing after end date. K11 cancelled leaves
projections, history still counts. K12 delete warns and offers cancel.

**Overview** — O1 worked examples reproduce exactly. O2 all unit tests pass. O3 every
figure labelled; breakdown sums to R8; disclaimer always visible. O4 maturities and
renewals within 60 days listed; reminder/info never change totals. O5 empty state shows
guidance; failed fetch shows error and retry.

**Review** — V1 equivalents and totals correct. V2 statuses persist; Cancelled removes
from projections and shows the provider disclaimer. V3 the words "unnecessary" and
"waste" never appear.

**Deployment** — D1 push to `main` deploys to production. D2 full journey works on
Android Chrome and iOS Safari at 360px without horizontal scroll.

**Experiment [EXP]** — E1 variant set from invite link and persists; switchable in
Settings. E2 Money Tracker opens the same overview with the same numbers. E3 every
visible action works; no fake or disabled tiles. E4 no third-party names, logos or
brand colours; "not affiliated" note visible.

---

## 10. Delivery

One primary coding agent. Milestone-based (availability varies), each milestone
verified before the next starts:

1. Foundations: scaffold, migration 1 (tables, RLS, profile trigger), local RLS test,
   Google sign-in, production deploy. Exit: A1, A2, A3, A4, A6 on production.
2. Engine + settings + commitments CRUD. Exit: S1, S2, K1–K3, O2.
3. Payment functions (migration 2), Upcoming, Catch up, expenses. Exit: X1–X3, K4–K12.
4. Overview + Review. Exit: O1, O3–O5, V1–V3. Feature freeze.
5. Hardening on production, mobile check, sample data; [EXP] only if every MVP
   criterion passes.
6. Testers and feedback.

---

## 11. Optional entry-screen experiment [EXP]

Start only after every MVP acceptance criterion passes on production; omit if time is
short.

- Neutral colours; our own icons; no third-party names, logos or brand colours; footer
  "MoneyMap — independent prototype, not affiliated with any payment app".
- A prominent Money Tracker card (estimate preview and payments due this week) that
  opens the Overview. **No fake or disabled tiles.**
- **Equivalence:** to test interface familiarity alone, both variants expose the same
  set of actions (the same shortcuts are present in both, only the layout differs). If
  the variants end up exposing different actions, the result is reported honestly as a
  comparison of overall navigation experience, not familiarity.
- Variant from the invite link (`?v=standalone` / `?v=payapp`), stored on the profile,
  switchable in Settings. No analytics.
- Sessions: 6–8 participants, sample data on test logins; each starts with an assigned
  variant (counterbalanced) then tries the other. Tasks: find the estimate; next and
  overdue payments; mark electricity paid at ₹1,950; "can you afford ₹6,000 this week
  without touching your SIP?" (also compared with their current method); find a
  subscription to review. Measures: success, time to first correct tap, wrong taps,
  1–7 ease rating, preference and reason, trust/privacy remarks recorded as
  observations only. A signal needs a consistent difference in ≥5 of 8 participants.

---

## 12. Changes agreed after v3 (v3.1, 22 Oct 2026)

None of these change the calculation rules R1–R10 or the database access rules.

- **Navigation:** five tabs — Home (dashboard), Commitments (Upcoming / All), Spending,
  Subscriptions (the Review screen from §3, promoted to its own tab), Settings.
- **Visual design:** purple MoneyMap identity inspired by familiar payment-app navigation;
  no third-party names, logos or affiliation.
- **Type-specific commitment forms:** credit card (issuer list with example variants and
  "Other / enter manually"; payment behaviour maps to reminder-only vs outflow), insurance
  (insurer, premium, separate cover), SIP, RD, FD (already deposited = info-only; planned
  deposit = one-time outflow), PPF/EPF.
- **Migration 4:** `commitments.provider`, `commitments.coverage_paise` (display only, never
  counted) and a `bills` expense category labelled "One-off bills" for bills that are not
  set up as commitments; the form tells users to keep recurring bills under Commitments.
- **Early payments (rule D4, unchanged):** a payment counts in the cycle it is made. The
  Paid form now warns when a date is after the next payday, and the breakdown states how
  much of "already paid" was paid early.
- **Sample data:** Settings can load a sample set (all rows `is_sample`, shown with a
  "Sample" badge) and clear it without touching the user's own records.
- **Forms:** submit buttons stay disabled until the page is interactive, and forms post,
  so an early tap can never silently discard input or put values in the URL.
