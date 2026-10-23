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
    ["not_financial", "Your transaction is complete. Thank you for paying with UPI."],
  ])("%s", (reason, body) => {
    expect(email({ body })).toEqual({ type: "ignore", reason });
  });
});

describe("detectMessage: balances, footers and confidence (real-inbox fixes)", () => {
  const indusind = "IndusInd Bank <transactionalert@indusind.com>";

  it("never reads the available balance as the amount, however it is worded", () => {
    const bodies = [
      "Dear Customer, your A/c 1234XXXXXX5678 is debited for INR 162.13 on 22-10-2026 towards UPI/zomato@hdfcbank. Available Balance is INR 2,92,221.73.",
      "INR 162.13 has been debited from your account XX5678 on 22/10/26. Your available balance in the account as on 22-10-2026 is ₹ 2,92,221.73",
      "Rs.162.13 debited from A/c **5678. Updated balance: Rs.2,92,221.73. UPI Ref 629412345678",
      "Your A/c XX5678 is debited with ₹162.13. Avl Bal ₹2,92,221.73",
    ];
    for (const body of bodies) {
      const d = email({ from: indusind, body });
      expect(d.type === "transaction" && d.proposal.amountPaise, body).toBe(16213);
    }
  });

  it("reads a credit as income and names it after the bank when the payee is a code", () => {
    const d = email({ from: indusind, body: "Your A/c XX5678 has been credited with INR 3,850.00 by UPI from tmqr61p679@ybl on 22-10-2026. Available Balance: INR 2,92,383.86" });
    expect(d.type).toBe("transaction");
    if (d.type !== "transaction") return;
    expect(d.proposal).toMatchObject({ kind: "income", amountPaise: 385000 });
    expect(d.proposal.description).not.toMatch(/tmqr/i);
  });

  it("ignores the email footer", () => {
    const d = email({
      from: indusind,
      body: "INR 500.00 debited from your A/c XX5678 for UPI txn to swiggy@icici. To reach us, call 1860 267 7777 or write to reachus@indusind.com. Never share your OTP or PIN.",
    });
    expect(d.type === "transaction" && d.proposal.description).not.toMatch(/reach/i);
    expect(d.type === "transaction" && d.proposal.amountPaise).toBe(50000);
  });

  it("pre-ticks only clear-cut, normal-sized amounts", () => {
    const clear = email({ from: indusind, body: "INR 162.13 debited from A/c XX5678 towards zomato@hdfcbank. Avl Bal INR 2,92,221.73" });
    expect(clear.type === "transaction" && clear.proposal.flags.likely).toBe(true);

    const large = email({ from: indusind, body: "INR 2,50,000.00 debited from A/c XX5678 by NEFT to Ravi" });
    expect(large.type === "transaction" && large.proposal.flags.likely).toBeUndefined();

    // A bank email without a debit/credit line isn't a transaction at all.
    const vague = email({ from: indusind, body: "Transaction alert: Rs 450 and Rs 1200 on your account", receivedOn: "2026-10-22" });
    expect(vague).toEqual({ type: "ignore", reason: "not_financial" });

    // A merchant email with two amounts: the user taps the right one.
    const receipt = email({ from: "noreply@flipkart.com", body: "Thank you for your purchase. Shirt ₹799, Shoes ₹1,499." });
    expect(receipt.type === "transaction" && receipt.proposal.flags.likely).toBeUndefined();
    expect(receipt.type === "transaction" && receipt.proposal.flags.amountOptions).toEqual([79900, 149900]);
  });
});

describe("detectMessage: real IndusInd alerts (from testing)", () => {
  const from = "IndusInd Bank <transactionalert@indusind.com>";
  const subject = "IndusInd Bank Transaction Alert";
  const footer = " The available balance in your account is INR 2,92,221.73. For any queries call 1860 267 7777 or write to reachus@indusind.com.";

  it.each([
    ["Debited for INR 20.00 towards UPI/004434195647/DR/SOME/YESB/tmqr61p679@ptys .", "expense", 2000, "IndusInd Bank UPI payment"],
    ["Debited for INR 40.00 towards UPI/951045557272/DR/Hung/YESB/m-51367251@ptys .", "expense", 4000, "UPI to Hung"],
    ["Credited for INR 3850.00 towards UPI/523897431764/CR/PAVN/INDB/871065381-2@ybl/Paym.", "income", 385000, "UPI from Pavn"],
  ])("%s", (line, kind, paise, description) => {
    const d = detectMessage(
      { source: "gmail", messageId: "abc123", from, subject, body: `IndusInd Bank Dear Customer, Thank you for banking with us. Your IndusInd Bank Account No. 15XXXXX5381 has been ${line}${footer}`, receivedOn: "2026-10-21" },
      "2026-10-23",
    );
    expect(d.type).toBe("transaction");
    if (d.type !== "transaction") return;
    expect(d.proposal).toMatchObject({ kind, amountPaise: paise, description, occurredOn: "2026-10-21" });
    expect(d.proposal.flags.amountOptions).toBeUndefined();
    expect(d.proposal.flags.likely).toBe(true);
  });

  it("never offers reference or phone numbers as amounts", () => {
    const d = detectMessage({ source: "gmail", messageId: "abc124", from, subject, body: `Payment reference 951045557272 processed. Call 1860 267 7777.` }, "2026-10-23");
    expect(d).toEqual({ type: "ignore", reason: "not_financial" });
  });

  it("reads small amounts with paise, and never as dates", () => {
    expect(parseAmount("Debited for INR 20.10 on 21-10-2026")).toBe(2010);
    expect(parseAmount("Debited for Rs.5.50")).toBe(550);
  });
});

function parseAmount(body: string) {
  const d = detectMessage({ source: "gmail", messageId: "abc125", from: "alerts@indusind.com", body }, "2026-10-23");
  return d.type === "transaction" ? d.proposal.amountPaise : null;
}

it("a subject ending in 'txn' doesn't hide the amount that follows", () => {
  const d = detectMessage(
    { source: "gmail", messageId: "abc126", from: "HDFC Bank InstaAlerts <alerts@hdfcbank.net>", subject: "You have done a UPI txn", body: "Dear Customer, Rs.640.00 has been debited from account **1234 to VPA zomato@hdfcbank ZOMATO. Your UPI transaction reference number is 629412345678." },
    "2026-10-23",
  );
  expect(d.type === "transaction" && d.proposal.amountPaise).toBe(64000);
});

it("skips bank notices that mention amounts but say nothing was debited or credited", () => {
  const d = detectMessage(
    {
      source: "gmail",
      messageId: "abc127",
      from: "IndusInd Bank <alerts@indusind.com>",
      subject: "Important: Revised Maximum Limits Applicable to Your Debit Card",
      body: "Dear Customer, The maximum permissible daily transaction limits for your Virtual Gold Debit Card will be enhanced effective 15th November 2026. Your revised limits will be ₹1 for ATM and ₹3,00000 for POS/e-commerce transactions.",
    },
    "2026-10-23",
  );
  expect(d).toEqual({ type: "ignore", reason: "not_financial" });
});
