# MoneyMap — real-user testing kit

Goal: learn whether a forward-looking "what's left until payday" view is useful (H1),
whether people will enter their commitments (H2), and whether the estimate feels right
(H3). Aim for 5–8 testers: working professionals with rent, EMIs, cards, SIPs or
subscriptions. Mix iPhone and Android.

## 1. Invitation (send on WhatsApp or email)

> Hi! I'm building **MoneyMap**, a small app that shows what's already committed (rent,
> EMIs, card bills, SIPs, subscriptions), what's due next, and roughly how much money is
> left until payday. Could you try it for 10–15 minutes and tell me honestly what you think?
>
> **Link:** https://moneymap-ten-bay.vercel.app (open on your phone, sign in with Google)
>
> Good to know:
> - No bank access; it never asks for passwords, PINs or OTPs.
> - Approximate amounts are completely fine. Please don't enter account or card numbers.
> - It's a prototype: as the builder I can technically see what's stored, and I'll delete
>   your data on request.
> - Want a quick look first? Settings → **Load sample data** (and **Clear** it later).
>
> When you're done, please fill in this 3-minute form: <FORM LINK>
> Thank you!

## 2. Tasks to ask testers to try

1. Sign in, then set your take-home pay, payday and a spending budget.
2. Add 3–5 things you pay regularly (rent, an EMI, a credit card, a SIP, a subscription).
3. On Home, read the estimated amount remaining and open **How is this calculated?**
4. Mark one bill as **Paid**.
5. Add one expense from today.
6. Open **Subscriptions** and mark each one Keep, Review or Cancelled.
7. Answer: "Could you spend ₹6,000 this week without touching your SIP?" using the app.

## 3. Feedback form (paste these into Google Forms)

1. What phone did you use? (iPhone / Android)
2. How long did setting up take? (under 5 min / 5–10 / 10–20 / gave up)
3. How many commitments did you add? (0 / 1–2 / 3–5 / 6+)
4. Was the "estimated amount remaining" roughly right? (Yes / Roughly / No — why?)
5. Was "How is this calculated?" clear? (1–5)
6. Task 7: could you answer the ₹6,000 question with the app? (Yes / Not sure / No)
   How would you normally answer it?
7. Which part was most useful? (Home estimate / Upcoming payments / Subscriptions /
   Spending / Other)
8. What was confusing or didn't work? (free text — screenshots welcome)
9. Would you open MoneyMap before your next payday? (1–5)
10. Would you keep entering bills and expenses manually? What would stop you?
11. Would a shared view with a partner be useful? (Yes / No / Maybe)
12. Anything else?

## 4. Observed sessions (2–3 people, 20 minutes each)

Share screens or sit together. Give the tasks above and **don't help**. Note where they
hesitate, what they tap first, and what they say out loud. Ask questions 4, 6 and 9 at
the end.

## 5. Triage

| Priority | Meaning | Action |
|---|---|---|
| P0 | Wrong number, data visible to someone else, or a broken core flow | Fix immediately |
| P1 | A tester couldn't finish a task | Fix before inviting more testers |
| P2 | Confusing wording or layout | Batch and fix |
| P3 | Feature request | Log it; build only if 3+ testers ask |

Log each item with: tester, phone, screen, what happened, screenshot, priority.

## 6. What counts as success (from SPEC §1)

≥70% finish setup with 3+ commitments · median setup under 10 minutes · ≥60% say the
estimate is roughly right · ≥60% answer task 7 faster or more confidently than usual ·
≥40% make a subscription decision · zero confirmed calculation bugs.
