// Classifies one financial message (an email from Gmail, an SMS shared from a phone, or text
// the user pasted) before anything is proposed. Provider-specific rules come first; the
// general sentence reader (parseText) fills in the details. Pure and deterministic: the
// message never leaves this function, and nothing here saves anything.
import { addDays, type ISODate } from "../engine/dates";
import { parseRupees } from "../money";
import { findDate, parseText } from "./parse-text";
import type { CaptureSource, ProposedTransaction } from "./types";

export interface IncomingMessage {
  source: CaptureSource;
  // Stable id from the source (Gmail message id, SMS id). Becomes the draft's sourceRef, so
  // scanning the same message twice can never save it twice.
  messageId: string | null;
  from?: string; // email address or SMS sender id, e.g. "alerts@hdfcbank.net", "VM-HDFCBK"
  subject?: string;
  body: string;
  receivedOn?: ISODate; // used when the message itself doesn't say when it happened
}

export type Detection =
  | { type: "transaction"; proposal: ProposedTransaction; provider: string | null }
  // A credit-card statement: the bill belongs under Commitments, not spending.
  | { type: "card_statement"; issuer: string | null; totalDuePaise: number | null; minimumDuePaise: number | null; dueDate: ISODate | null; messageId: string | null }
  | { type: "ignore"; reason: IgnoreReason };

export type IgnoreReason = "otp" | "promotion" | "failed" | "no_amount" | "not_financial";

export const IGNORE_LABELS: Record<IgnoreReason, string> = {
  otp: "This is a one-time password message, not a transaction.",
  promotion: "This looks like an offer or advert, not a transaction.",
  failed: "This payment failed or was declined, so no money moved.",
  no_amount: "No amount was found in this message.",
  not_financial: "This doesn't look like a payment, bill or receipt.",
};

// Known senders, matched on the email domain or the SMS sender id (the part after "XX-").
interface Provider {
  name: string;
  match: RegExp;
  category?: string;
  bank?: boolean;
}

const PROVIDERS: Provider[] = [
  { name: "HDFC Bank", match: /hdfcbank|hdfcbk|hdfccc/, bank: true },
  { name: "ICICI Bank", match: /icicibank|icicib|icicit/, bank: true },
  { name: "SBI", match: /sbi\.co\.in|sbicard|sbiinb|sbicrd|sbiupi/, bank: true },
  { name: "Axis Bank", match: /axisbank|axisbk/, bank: true },
  { name: "Kotak", match: /kotak|kotakb/, bank: true },
  { name: "American Express", match: /americanexpress|aexp|amex/, bank: true },
  { name: "IDFC FIRST Bank", match: /idfcfirst|idfcfb/, bank: true },
  { name: "Yes Bank", match: /yesbank|yesbnk/, bank: true },
  { name: "Swiggy", match: /swiggy/, category: "food" },
  { name: "Zomato", match: /zomato/, category: "food" },
  { name: "Uber", match: /uber\.com|\buber\b/, category: "transport" },
  { name: "Ola", match: /olacabs|\bola\b/, category: "transport" },
  { name: "Rapido", match: /rapido/, category: "transport" },
  { name: "Amazon", match: /amazon\.in|amazon\.com/, category: "shopping" },
  { name: "Flipkart", match: /flipkart/, category: "shopping" },
  { name: "Myntra", match: /myntra/, category: "shopping" },
  { name: "BigBasket", match: /bigbasket/, category: "groceries" },
  { name: "Blinkit", match: /blinkit/, category: "groceries" },
  { name: "Zepto", match: /zepto/, category: "groceries" },
  { name: "IRCTC", match: /irctc/, category: "travel" },
  { name: "MakeMyTrip", match: /makemytrip/, category: "travel" },
  { name: "BookMyShow", match: /bookmyshow/, category: "entertainment" },
  { name: "Apollo Pharmacy", match: /apollopharmacy|apollo247/, category: "healthcare" },
  { name: "Netflix", match: /netflix/, category: "entertainment" },
  { name: "Spotify", match: /spotify/, category: "entertainment" },
];

const OTP = /\b(otp|one[- ]time password|verification code|do not share (?:this|it) with anyone)\b/;
const FAILED = /\b(declined|failed|unsuccessful|could not be processed|was not successful)\b/;
const PROMOTION = /\b(offer|pre[- ]?approved|apply now|limited time|win|cashback of up to|up to \d+% off|coupon|voucher code|unsubscribe from (?:these|our) (?:offers|promotions))\b/;
const MONEY_MOVED = /\b(debited|credited|spent|paid|payment of|charged|purchase|transaction|txn|sent|received|withdrawn|order total|amount paid|total paid|grand total|receipt|invoice|refund)\b/;
const STATEMENT = /\b(statement)\b/;
const TOTAL_DUE = /\b(?:total|amount)\s+(?:amount\s+)?due\b/;

function providerFor(from: string): Provider | null {
  const f = from.toLowerCase();
  return PROVIDERS.find((p) => p.match.test(f)) ?? null;
}

// "Total Amount Due: Rs. 12,345.00" → paise. Looks only at the text right after the label.
function amountAfter(text: string, label: RegExp): number | null {
  const m = text.match(new RegExp(`${label.source}[^\\d₹]{0,25}(?:₹|rs\\.?|inr)?\\s*([\\d,]+(?:\\.\\d{1,2})?)`));
  return m ? parseRupees(m[1]) : null;
}

export function detectMessage(message: IncomingMessage, today: ISODate): Detection {
  const subject = (message.subject ?? "").trim();
  const text = `${subject}\n${message.body}`.slice(0, 5000);
  const lower = text.toLowerCase().replace(/\s+/g, " ");
  const provider = message.from ? providerFor(message.from) : null;

  if (OTP.test(lower)) return { type: "ignore", reason: "otp" };
  if (FAILED.test(lower)) return { type: "ignore", reason: "failed" };

  // Card statements: "Your HDFC Bank Credit Card statement… Total Amount Due… Payment Due Date…"
  if (STATEMENT.test(lower) && TOTAL_DUE.test(lower)) {
    const due = lower.match(/\b(?:payment\s+)?due\s+(?:date|by|on)\b[^a-z0-9]{0,5}([^.;\n]{0,25})/);
    return {
      type: "card_statement",
      issuer: provider?.bank ? provider.name : null,
      totalDuePaise: amountAfter(lower, TOTAL_DUE),
      minimumDuePaise: amountAfter(lower, /\b(?:minimum|min\.?)\s+(?:amount\s+)?due\b/),
      dueDate: due ? findDueDate(due[1], today) : null,
      messageId: message.messageId,
    };
  }

  if (!MONEY_MOVED.test(lower)) return { type: "ignore", reason: PROMOTION.test(lower) ? "promotion" : "not_financial" };
  // An advert that mentions money ("get 10% cashback on your next purchase") is not a payment.
  if (PROMOTION.test(lower) && !/\b(debited|credited|order total|amount paid|total paid|grand total)\b/.test(lower)) {
    return { type: "ignore", reason: "promotion" };
  }

  // Merchant receipts: prefer the order total over item prices.
  const receiptTotal = provider && !provider.bank ? amountAfter(lower, /\b(?:order total|grand total|total paid|amount paid|total amount|total)\b/) : null;
  const proposal = parseText(message.body.length > 0 ? `${subject}. ${message.body}` : subject, today, message.source);
  if (receiptTotal) {
    proposal.amountPaise = receiptTotal;
    proposal.issues = proposal.issues.filter((i) => i.field !== "amount");
  }
  if (proposal.amountPaise === null && !proposal.issues.some((i) => i.message.startsWith("Several amounts"))) {
    return { type: "ignore", reason: "no_amount" };
  }
  if (provider && !provider.bank) {
    proposal.description = provider.name;
    proposal.issues = proposal.issues.filter((i) => i.field !== "description");
    if (provider.category && proposal.kind === "expense") {
      proposal.category = provider.category;
      proposal.issues = proposal.issues.filter((i) => i.field !== "category");
    }
  }
  // The message's own timestamp is better than "today" when the text has no date.
  if (message.receivedOn && proposal.issues.some((i) => i.field === "date" && i.message.startsWith("No date"))) {
    proposal.occurredOn = message.receivedOn;
    proposal.issues = proposal.issues.filter((i) => i.field !== "date");
  }
  proposal.sourceRef = message.messageId;
  proposal.raw = text.slice(0, 500);
  return { type: "transaction", proposal, provider: provider?.name ?? null };
}

function findDueDate(fragment: string, today: ISODate): ISODate | null {
  const date = findDate(fragment.toLowerCase(), today).date;
  if (!date) return null;
  // Without a year, "5 Jan" read in December is next January, not last January.
  if (!/\b(19|20)\d{2}\b|\/\d{2,4}\b/.test(fragment) && date < addDays(today, -60)) {
    return `${Number(date.slice(0, 4)) + 1}${date.slice(4)}` as ISODate;
  }
  return date;
}
