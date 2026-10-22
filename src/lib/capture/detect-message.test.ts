import { describe, expect, it } from "vitest";
import { detectMessage, type IncomingMessage } from "./detect-message";

const TODAY = "2026-10-22";
const email = (m: Partial<IncomingMessage> & { body: string }) => detectMessage({ source: "gmail", messageId: "m1", ...m }, TODAY);

describe("detectMessage: bank alerts", () => {
  it("reads an HDFC debit alert email into a draft tied to the message id", () => {
    const d = email({
      from: "HDFC Bank InstaAlerts <alerts@hdfcbank.net>",
      subject: "You have done a UPI txn. Check details!",
      body: "Dear Customer, Rs.450.00 has been debited from account **1234 to VPA zomato@hdfcbank ZOMATO on 21-10-26. Your UPI transaction reference number is 629412345678.",
    });
    expect(d.type).toBe("transaction");
    if (d.type !== "transaction") return;
    expect(d.provider).toBe("HDFC Bank");
    expect(d.proposal).toMatchObject({ source: "gmail", sourceRef: "m1", kind: "expense", amountPaise: 45000, occurredOn: "2026-10-21", paymentMethod: "upi" });
  });

  it("reads a bank SMS shared from a phone", () => {
    const d = detectMessage({ source: "sms", messageId: "sms-9", from: "VM-ICICIT", body: "ICICI Bank Acct XX123 debited for Rs 1,299.00 on 20-Oct-26; AMAZON credited. UPI:629412345678. Call 18002662 for dispute." }, TODAY);
    expect(d.type === "transaction" && d.proposal.amountPaise).toBe(129900);
  });

  it("uses the message date when the text has none", () => {
    const d = email({ from: "alerts@axisbank.com", body: "INR 320.00 spent on Axis Bank Card XX9876 at UBER INDIA.", receivedOn: "2026-10-19" });
    expect(d.type === "transaction" && d.proposal.occurredOn).toBe("2026-10-19");
  });
});

describe("detectMessage: merchant receipts", () => {
  it("uses the order total, merchant name and category", () => {
    const d = email({
      from: "Swiggy <noreply@swiggy.in>",
      subject: "Your Swiggy order summary",
      body: "Thank you for ordering. Paneer Tikka ₹280 Butter Naan ₹60 Delivery fee ₹35 Order Total: ₹375. Paid via UPI",
      receivedOn: "2026-10-21",
    });
    expect(d.type).toBe("transaction");
    if (d.type !== "transaction") return;
    expect(d.proposal).toMatchObject({ amountPaise: 37500, description: "Swiggy", category: "food", occurredOn: "2026-10-21" });
    expect(d.proposal.issues).toEqual([]);
  });

  it("suggests a subscription for a renewal receipt", () => {
    const d = email({ from: "info@account.netflix.com", subject: "Your Netflix membership payment", body: "We've charged ₹649 for your monthly membership." });
    expect(d.type === "transaction" && d.proposal.flags.subscriptionHint?.name).toBe("Netflix");
  });
});

describe("detectMessage: card statements go to Commitments", () => {
  it("reads total due, minimum due and due date", () => {
    const d = email({
      from: "HDFC Bank Credit Cards <emailstatements.cards@hdfcbank.net>",
      subject: "Your HDFC Bank Credit Card statement for October 2026",
      body: "Total Amount Due: Rs. 12,345.00. Minimum Amount Due: Rs. 620.00. Payment Due Date: 05 Nov 2026.",
    });
    expect(d).toEqual({ type: "card_statement", issuer: "HDFC Bank", totalDuePaise: 1234500, minimumDuePaise: 62000, dueDate: "2026-11-05", messageId: "m1" });
  });

  it("puts a due date without a year in the future", () => {
    const d = detectMessage({ source: "gmail", messageId: "m2", from: "statements@sbicard.com", subject: "SBI Card e-statement", body: "Total Amount Due Rs 8,000 Payment due date 3 Jan" }, "2026-12-20");
    expect(d.type === "card_statement" && d.dueDate).toBe("2027-01-03");
  });
});

describe("detectMessage: what is never proposed", () => {
  it.each([
    ["otp", "Your OTP for transaction of Rs 4,999 at AMAZON is 482913. Do not share it with anyone."],
    ["failed", "Your payment of Rs 1,200 to Uber was declined."],
    ["promotion", "Get up to 50% off on your next purchase! Limited time offer, apply now."],
    ["not_financial", "Your package has been shipped and will arrive on Friday."],
    ["no_amount", "Your transaction is complete. Thank you for paying with UPI."],
  ])("%s", (reason, body) => {
    expect(email({ body })).toEqual({ type: "ignore", reason });
  });
});
