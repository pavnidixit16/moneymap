// Turns a Gmail API message into the plain text the detector reads. Pure: no network,
// no storage, nothing logged.
import type { ISODate } from "../engine/dates";

// Only these senders are searched. Gmail's read permission can't be narrowed by Google,
// so MoneyMap narrows itself: banks, card issuers and common Indian merchants.
export const SENDER_DOMAINS = [
  "hdfcbank.net", "hdfcbank.com", "icicibank.com", "sbi.co.in", "sbicard.com", "axisbank.com",
  "kotak.com", "americanexpress.com", "idfcfirstbank.com", "yesbank.in", "indusind.com",
  "swiggy.in", "zomato.com", "uber.com", "olacabs.com", "rapido.bike", "amazon.in", "flipkart.com",
  "myntra.com", "bigbasket.com", "blinkit.com", "zeptonow.com", "irctc.co.in", "makemytrip.com",
  "bookmyshow.com", "apollo247.com", "netflix.com", "spotify.com",
];

export const LOOKBACK_DAYS = 30;

export function searchQuery(): string {
  return `from:(${SENDER_DOMAINS.join(" OR ")}) newer_than:${LOOKBACK_DAYS}d -in:spam -in:trash`;
}

export interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
}

export interface GmailMessage {
  id: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailPart;
}

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", rupee: "₹" };

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/[ \t\f\r]+/g, " ")
    .replace(/\n\s*/g, "\n")
    .trim();
}

function decode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

function findPart(part: GmailPart | undefined, mime: string): GmailPart | null {
  if (!part) return null;
  if (part.mimeType === mime && part.body?.data) return part;
  for (const p of part.parts ?? []) {
    const found = findPart(p, mime);
    if (found) return found;
  }
  return null;
}

export function header(message: GmailMessage, name: string): string {
  return message.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

// Plain text preferred; HTML converted otherwise. Capped: alerts and receipts are short.
export function messageText(message: GmailMessage): string {
  const plain = findPart(message.payload, "text/plain");
  if (plain) return decode(plain.body!.data!).slice(0, 5000);
  const html = findPart(message.payload, "text/html");
  if (html) return htmlToText(decode(html.body!.data!)).slice(0, 5000);
  return "";
}

// "HDFC Bank InstaAlerts <alerts@hdfcbank.net>" → "HDFC Bank InstaAlerts"
export function senderName(from: string): string {
  const name = from.replace(/<[^>]*>/, "").replace(/"/g, "").trim();
  return name || from.replace(/[<>]/g, "").trim();
}

// The day the email arrived, in Indian time.
export function receivedOn(message: GmailMessage): ISODate | undefined {
  const ms = Number(message.internalDate);
  if (!Number.isFinite(ms) || ms <= 0) return undefined;
  return new Date(ms + 5.5 * 3600 * 1000).toISOString().slice(0, 10) as ISODate;
}
