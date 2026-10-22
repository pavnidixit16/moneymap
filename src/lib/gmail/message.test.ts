import { describe, expect, it } from "vitest";
import { htmlToText, messageText, receivedOn, searchQuery, senderName, type GmailMessage } from "./message";

const b64 = (s: string) => Buffer.from(s).toString("base64url");

describe("Gmail message reading", () => {
  it("prefers the plain-text part of a multipart message", () => {
    const m: GmailMessage = {
      id: "1",
      payload: {
        mimeType: "multipart/alternative",
        parts: [
          { mimeType: "text/html", body: { data: b64("<p>HTML Rs 1</p>") } },
          { mimeType: "text/plain", body: { data: b64("Plain Rs 450 debited") } },
        ],
      },
    };
    expect(messageText(m)).toBe("Plain Rs 450 debited");
  });

  it("converts HTML-only receipts, including the rupee sign entity", () => {
    const m: GmailMessage = { id: "2", payload: { mimeType: "text/html", body: { data: b64("<style>p{}</style><table><tr><td>Order Total:</td><td>&#8377;375</td></tr></table>") } } };
    expect(messageText(m)).toContain("Order Total: ₹375");
    expect(htmlToText("a&nbsp;b &amp; c<br>d")).toBe("a b & c\nd");
  });

  it("reads sender names and the Indian date the email arrived", () => {
    expect(senderName('"HDFC Bank InstaAlerts" <alerts@hdfcbank.net>')).toBe("HDFC Bank InstaAlerts");
    expect(senderName("<alerts@hdfcbank.net>")).toBe("alerts@hdfcbank.net");
    // 21 Oct 2026 20:00 UTC is 22 Oct in India.
    expect(receivedOn({ id: "3", internalDate: String(Date.UTC(2026, 9, 21, 20, 0)) })).toBe("2026-10-22");
    expect(receivedOn({ id: "4" })).toBeUndefined();
  });

  it("searches only known senders over the last 30 days", () => {
    expect(searchQuery()).toMatch(/^from:\(hdfcbank\.net OR .* OR spotify\.com\) newer_than:30d -in:spam -in:trash$/);
  });
});
