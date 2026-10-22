// Reads a typed sentence, a voice transcript, or pasted bank/UPI SMS or email text into a
// ProposedTransaction. Deterministic rules only (no AI service, nothing leaves the app).
// Anything it is not sure about is reported as an issue for the user to review — it never
// silently invents a value.
import { addDays, isISODate, parseISODate, toISODate, type ISODate } from "../engine/dates";
import { formatINR, parseRupees } from "../money";
import type { CaptureSource, PaymentMethod, ProposalIssue, ProposedTransaction } from "./types";

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11,
  november: 11, dec: 12, december: 12,
};
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Keyword → category. Checked in order; first match wins.
const CATEGORY_KEYWORDS: [string, RegExp][] = [
  ["groceries", /\b(grocer(?:y|ies)|bigbasket|big basket|blinkit|zepto|instamart|dmart|d-mart|vegetables?|sabzi|kirana|milk)\b/],
  ["food", /\b(dinner|lunch|breakfast|brunch|food|meal|restaurant|cafe|coffee|tea|snacks?|swiggy|zomato|pizza|burger|biryani|starbucks|dominos|domino's|mcdonald'?s|kfc|eat(?:ing)? out|dining|dine|dined|drinks?)\b/],
  ["transport", /\b(uber|ola|rapido|cab|taxi|auto|rickshaw|metro|bus|petrol|diesel|fuel|parking|toll|fastag)\b/],
  ["travel", /\b(flight|hotel|irctc|train ticket|train|makemytrip|goibibo|airbnb|trip|holiday|indigo|air india)\b/],
  ["shopping", /\b(amazon|flipkart|myntra|ajio|nykaa|meesho|shopping|clothes|shoes|shirt|dress|electronics|gadget|bed ?sheets?|pillows?|curtains?|towels?|furniture|utensils|home decor|decor|appliances?)\b/],
  ["entertainment", /\b(movie|movies|cinema|bookmyshow|pvr|inox|concert|game|gaming|party)\b/],
  ["healthcare", /\b(pharmacy|medicine|medicines|doctor|hospital|clinic|apollo|1mg|pharmeasy|netmeds|lab test|dentist)\b/],
  ["personal_care", /\b(salon|haircut|spa|parlour|parlor|grooming)\b/],
  ["education", /\b(course|books?|tuition|udemy|coursera|exam fee|school fee|college fee)\b/],
  ["bills", /\b(electricity|water bill|gas bill|recharge|broadband|wifi|internet bill|mobile bill|postpaid|dth|bill)\b/],
];

const SUBSCRIPTIONS = /\b(netflix|spotify|prime video|amazon prime|hotstar|jiohotstar|youtube premium|apple music|icloud|google one|zee5|sonyliv|jiocinema|gym)\b/;

const PAYMENT_KEYWORDS: [PaymentMethod, RegExp][] = [
  ["credit_card", /\b(credit card|cc)\b/],
  ["debit_card", /\b(debit card|atm card)\b/],
  ["upi", /\b(upi|gpay|google pay|phonepe|paytm|bhim|vpa)\b|@[a-z]{2,}\b/],
  ["net_banking", /\b(net ?banking|neft|imps|rtgs)\b/],
  ["cash", /\bcash\b/],
];

// Card issuers, including how speech-to-text tends to spell them ("ICIC", "H D F C").
const CARD_ISSUER_WORDS: [string, RegExp][] = [
  ["HDFC", /\bh\s?d\s?f\s?c\b/],
  ["ICICI", /\bi\s?c\s?i\s?c\s?i?\b/],
  ["SBI", /\bs\s?b\s?i\b/],
  ["Axis", /\baxis\b/],
  ["Kotak", /\bkotak\b/],
  ["Amex", /\b(amex|american express)\b/],
  ["IDFC FIRST", /\bidfc\b/],
  ["IndusInd", /\bindusind\b/],
  ["Yes Bank", /\byes bank\b/],
  ["RBL", /\brbl\b/],
  ["HSBC", /\bhsbc\b/],
  ["Standard Chartered", /\b(standard chartered|scb)\b/],
  ["OneCard", /\bone ?card\b/],
  ["Scapia", /\bscapia\b/],
];

// "paid my credit card bill", "ICICI card bill was 20,000", "bill for my HDFC card".
const CARD_BILL =
  /\b(?:credit ?card|cc)\s+(?:bill|dues|outstanding|payment|statement)\b|\bcard\s+(?:bill|dues|outstanding)\b|\b(?:bill|dues)\s+(?:for|of|on)\s+(?:my\s+|the\s+)?(?:[a-z]+\s+){0,2}(?:credit\s*)?card\b/;

const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

export function findDate(lower: string, today: ISODate): { date: ISODate | null; issue?: string; matched?: string } {
  if (/\bday before yesterday\b/.test(lower)) return { date: addDays(today, -2), matched: "day before yesterday" };
  if (/\b(yesterday|last night)\b/.test(lower)) return { date: addDays(today, -1), matched: lower.match(/\b(yesterday|last night)\b/)![0] };
  if (/\b(today|tonight|this morning|this afternoon|this evening)\b/.test(lower)) return { date: today };

  const weekday = lower.match(/\b(?:on |last )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (weekday) {
    const target = WEEKDAYS.indexOf(weekday[1]);
    const { y, m, d } = parseISODate(today);
    const todayIndex = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const back = ((todayIndex - target + 7) % 7) || 7; // most recent past occurrence
    return { date: addDays(today, -back), matched: weekday[0] };
  }

  const { y: thisYear } = parseISODate(today);
  const build = (yy: number, mm: number, dd: number, yearGiven: boolean) => {
    const year = yy < 100 ? 2000 + yy : yy;
    if (mm < 1 || mm > 12 || dd < 1) return null;
    const iso = toISODate(year, mm, dd);
    if (!isISODate(iso)) return null;
    // Without a year, a date later than today most likely means last year.
    if (!yearGiven && iso > today) return toISODate(year - 1, mm, dd);
    return iso;
  };

  const isoMatch = lower.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const date = build(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]), true);
    if (date) return { date, matched: isoMatch[0] };
  }
  // Indian order: day / month / year.
  const numeric = lower.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
  if (numeric) {
    const date = build(numeric[3] ? Number(numeric[3]) : thisYear, Number(numeric[2]), Number(numeric[1]), Boolean(numeric[3]));
    if (date) return { date, matched: numeric[0] };
  }
  const dayMonth = lower.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s-]*(?:of\\s+)?${MONTH_RE}\\b[\\s,-]*(\\d{2,4})?\\b`));
  if (dayMonth) {
    const date = build(dayMonth[3] ? Number(dayMonth[3]) : thisYear, MONTHS[dayMonth[2].slice(0, 3)], Number(dayMonth[1]), Boolean(dayMonth[3]));
    if (date) return { date, matched: dayMonth[0] };
  }
  const monthDay = lower.match(new RegExp(`\\b${MONTH_RE}\\b\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`));
  if (monthDay) {
    const date = build(monthDay[3] ? Number(monthDay[3]) : thisYear, MONTHS[monthDay[1].slice(0, 3)], Number(monthDay[2]), Boolean(monthDay[3]));
    if (date) return { date, matched: monthDay[0] };
  }
  return { date: null };
}

// Lower-cased text with everything that looks like money but isn't the amount removed.
function cleanForAmounts(text: string): string {
  let t = text.toLowerCase();
  // Remove things that look like money but are not the transaction amount.
  t = t.replace(/(?:avl\.?|available|avail\.?|credit)\s*(?:lmt|limit)\.?\s*(?:is|:|-)?\s*(?:rs\.?|inr|₹)?\s*[\d,]+(?:\.\d+)?/g, " ");
  t = t.replace(/(?:avl\.?|available|avail\.?|closing|opening|total)?\s*bal(?:ance)?\.?\s*(?:is|:|-)?\s*(?:rs\.?|inr|₹)?\s*[\d,]+(?:\.\d+)?/g, " ");
  t = t.replace(/(?:a\/c|acct|account|card|ac)\s*(?:no\.?)?\s*(?:ending\s*(?:with|in)?\s*)?[x*]*\d{2,}/g, " ");
  t = t.replace(/[x*]{2,}\d+/g, " ");
  t = t.replace(/\b(?:ref|reference|txn|utr|upi ref)\.?\s*(?:no\.?|id)?\s*:?\s*\w+/g, " ");
  t = t.replace(/\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/g, " ");
  t = t.replace(/\b20\d{2}-\d{1,2}-\d{1,2}\b/g, " ");
  t = t.replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ");
  t = t.replace(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?[\\s-]*(?:of\\s+)?${MONTH_RE}\\b(?:[\\s,-]*(?:19|20)\\d{2})?\\b`, "g"), " ");
  t = t.replace(new RegExp(`\\b${MONTH_RE}\\b\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s*(?:19|20)\\d{2})?\\b`, "g"), " ");
  t = t.replace(/\b(?:in|of|since|year)\s+(?:19|20)\d{2}\b/g, " ");
  t = t.replace(/\b\d{1,2}(?:st|nd|rd|th)\b/g, " ");
  return t;
}

function findAmount(text: string): { paise: number | null; issue?: string } {
  const t = cleanForAmounts(text);

  // Self-corrections, common when speaking: "200, no actually 20,000", "make that 500",
  // "not 200 but 2,000". The amount after the last correction is the one meant.
  const cues = [...t.matchAll(CORRECTION_CUES)];
  if (cues.length > 0) {
    const last = cues[cues.length - 1];
    const after = amountsIn(t.slice(last.index + last[0].length));
    const before = amountsIn(t.slice(0, last.index + last[0].length));
    if (after.length > 0 && before.length > 0) {
      const extra = after.length > 1 ? " More than one amount follows it; check this is the right one." : "";
      return {
        paise: after[0],
        issue: `You corrected the amount (${before.map(formatINR).join(", ")} → ${formatINR(after[0])}); using ${formatINR(after[0])}.${extra}`,
      };
    }
  }

  const unique = amountsIn(t);
  if (unique.length === 0) return { paise: null, issue: "No amount found. Enter the amount." };
  // Never guess between amounts: the user picks.
  if (unique.length > 1) return { paise: null, issue: `Several amounts found (${unique.map(formatINR).join(", ")}). Enter the right one.` };
  return { paise: unique[0] };
}

const CORRECTION_CUES = /\b(?:no+,? (?:no+,? )?(?:actually|wait|sorry|i mean)|actually|i mean|sorry|correction|make (?:that|it)|rather|wait|scratch that|not\s+(?:₹|rs\.?\s*|inr\s*)?[\d,.]+k?\s*(?:rupees|rs)?,?\s*but)\b|,\s*no+\b|\bno+,|\bno+\b(?=\s*(?:₹|rs\b|inr\b|its?\b|it's\b|\d))/g;

// Distinct amounts (in paise, in order of appearance) in already-cleaned text. Amounts with a
// currency marker win; bare numbers are used only when nothing is marked.
function amountsIn(t: string): number[] {
  const tagged: { at: number; value: string }[] = [];
  for (const m of t.matchAll(/(?:₹|\brs\.?|\binr)\s*([\d,]+(?:\.\d{1,2})?)/g)) tagged.push({ at: m.index, value: m[1] });
  for (const m of t.matchAll(/\b([\d,]+(?:\.\d{1,2})?)\s*(?:rupees|rs\b|inr\b|bucks)/g)) tagged.push({ at: m.index, value: m[1] });
  for (const m of t.matchAll(/\b(\d+(?:\.\d)?)\s*k\b/g)) tagged.push({ at: m.index, value: String(Math.round(Number(m[1]) * 1000)) });

  let candidates = tagged.sort((a, b) => a.at - b.at).map((c) => c.value);
  if (candidates.length === 0) {
    // Dates, day numbers ("the 21st") and years were already removed by the caller.
    candidates = [...t.matchAll(/\b(\d[\d,]*(?:\.\d{1,2})?)\b/g)].map((m) => m[1]);
  }
  return [...new Set(candidates.map((c) => parseRupees(c)).filter((p): p is number => p !== null && p > 0))];
}

function findDescription(text: string, lower: string, dateMatched?: string): string | null {
  const vpa = lower.match(/\b([a-z][a-z0-9.]{1,30})@[a-z]{2,}/);
  if (vpa) return titleCase(vpa[1].replace(/[._]/g, " "));
  let scan = lower;
  if (dateMatched) scan = scan.replace(dateMatched, " ");
  const phrase = scan.match(/\b(?:at|to|towards|for|on|from)\s+(?:vpa\s+)?([a-z][a-z0-9&' .-]{1,40}?)(?=\s+(?:on|via|using|ref|from|dated|with|by|for|at|yesterday|today|last|this)\b|[.,;]|\s+\d|$)/);
  if (phrase) {
    const words = phrase[1].trim().replace(/^(the|a|an|my)\s+/, "");
    if (words && !/^(rs|inr|upi|a\/c|account|card)$/.test(words)) return titleCase(words);
  }
  for (const [, re] of CATEGORY_KEYWORDS) {
    const m = lower.match(re);
    if (m) return titleCase(m[1]);
  }
  return null;
}

// Details said once for a whole sentence ("yesterday", "by UPI", "received") that apply to
// each expense split out of it.
interface SharedContext {
  kind: "expense" | "income";
  occurredOn: ISODate | null;
  paymentMethod: PaymentMethod | null;
}

const EXPENSE_WORDS = /\b(debited|spent|spend|paid|pay|purchase|purchased|bought|sent|transferred|withdrawn|charged)\b/;
const INCOME_WORDS = /\b(credited|received|got paid|salary|refund|refunded|cashback)\b/;

export function parseText(input: string, today: ISODate, source: CaptureSource = "text", context?: SharedContext): ProposedTransaction {
  const raw = input.trim().slice(0, 500);
  const lower = raw.toLowerCase().replace(/\s+/g, " ");
  const issues: ProposalIssue[] = [];

  const isExpenseWord = EXPENSE_WORDS.test(lower);
  const isIncomeWord = INCOME_WORDS.test(lower);
  const kind: "expense" | "income" = !isExpenseWord && !isIncomeWord && context ? context.kind : isIncomeWord && !isExpenseWord ? "income" : "expense";
  if (isIncomeWord && isExpenseWord) {
    issues.push({ field: "kind", message: "Both spending and income words found; check whether this is an expense." });
  }

  const amount = findAmount(raw);
  if (amount.issue) issues.push({ field: "amount", message: amount.issue });

  const when = findDate(lower, today);
  let occurredOn = when.date ?? context?.occurredOn ?? null;
  if (!occurredOn) {
    occurredOn = today;
    issues.push({ field: "date", message: "No date mentioned; set to today. Change it if needed." });
  } else if (occurredOn > today) {
    issues.push({ field: "date", message: "This date is in the future; check it." });
  }

  const flags: ProposedTransaction["flags"] = {};
  if (CARD_BILL.test(lower)) flags.cardBillPayment = true;

  let category: string | null = kind === "income" ? "income" : null;
  if (kind === "expense") {
    for (const [cat, re] of CATEGORY_KEYWORDS) {
      // A card bill is not a one-off bill; its purchases are already categorised.
      if (flags.cardBillPayment && cat === "bills") continue;
      if (re.test(lower)) {
        category = cat;
        break;
      }
    }
    if (!category) issues.push({ field: "category", message: "Choose a category." });
  }

  let description = findDescription(raw, lower, when.matched);
  if (flags.cardBillPayment) {
    const issuer = CARD_ISSUER_WORDS.find(([, re]) => re.test(lower));
    description = issuer ? `${issuer[0]} credit card bill` : "Credit card bill";
  }
  if (!description) issues.push({ field: "description", message: "Add a short description." });

  let paymentMethod: PaymentMethod | null = context?.paymentMethod ?? null;
  for (const [method, re] of PAYMENT_KEYWORDS) {
    if (re.test(lower)) {
      paymentMethod = method;
      break;
    }
  }

  const sub = lower.match(SUBSCRIPTIONS);
  if (sub && kind === "expense") {
    const frequency = /\b(year|yearly|annual|annually)\b/.test(lower) ? "yearly" : /\bquarter/.test(lower) ? "quarterly" : "monthly";
    flags.subscriptionHint = { name: titleCase(sub[1]), frequency };
  }

  return {
    source,
    sourceRef: null,
    kind,
    amountPaise: amount.paise,
    description: description ?? "",
    category,
    occurredOn,
    paymentMethod,
    issues,
    flags,
    raw,
  };
}

// Several expenses in one go: "600 on shopping, 250 on cab and 300 on food yesterday".
// Splits on commas, "and", "then", "also", "plus" and semicolons; a piece without an amount
// (", yesterday") stays with the expense before it. Splits only when every piece has exactly
// one amount and nobody corrected themselves; otherwise it's one draft as before.
const SPLIT = /,(?!\d)|;|\s(?:and|then|also|plus|after that)\s/;
const LEADING_JOINERS = /^\s*(?:and|or|then|also|plus|after that)\b\s*/;

export function parseExpenses(input: string, today: ISODate, source: CaptureSource = "text"): ProposedTransaction[] {
  const whole = parseText(input, today, source);
  const raw = input.trim().slice(0, 500);
  if (cleanForAmounts(raw).search(CORRECTION_CUES) >= 0) return [whole];

  const groups: string[] = [];
  let pending = "";
  for (const piece of raw.split(new RegExp(SPLIT, "i"))) {
    const text = piece.replace(LEADING_JOINERS, "").trim();
    if (!text) continue;
    if (amountsIn(cleanForAmounts(text)).length === 0) {
      if (groups.length > 0) groups[groups.length - 1] += `, ${text}`;
      else pending = `${pending} ${text}`.trim();
    } else {
      groups.push(pending ? `${pending} ${text}` : text);
      pending = "";
    }
  }
  if (groups.length < 2 || groups.some((g) => amountsIn(cleanForAmounts(g)).length !== 1)) return [whole];

  const lower = raw.toLowerCase();
  const context: SharedContext = {
    kind: INCOME_WORDS.test(lower) && !EXPENSE_WORDS.test(lower) ? "income" : "expense",
    occurredOn: findDate(lower.replace(/\s+/g, " "), today).date,
    paymentMethod: whole.paymentMethod,
  };
  return groups.map((g) => parseText(g, today, source, context));
}
