import { describe, expect, it } from "vitest";
import { feedbackSchema, summarise, toCsv, type FeedbackRow } from "./feedback";

const valid = { parts_tried: ["dashboard", "voice"], ease: "easy", issues: ["none"], issue_details: "", return_intent: "probably", comments: "  Calm and clear.  ", quote_ok: true };

describe("feedback validation (runs on the server)", () => {
  it("accepts a normal response and tidies text", () => {
    const r = feedbackSchema.parse(valid);
    expect(r).toMatchObject({ issue_details: null, comments: "Calm and clear.", parts_tried: ["dashboard", "voice"] });
  });

  it("needs only the two single-choice answers", () => {
    expect(feedbackSchema.safeParse({ ...valid, parts_tried: [], issues: [], comments: "" }).success).toBe(true);
    const missing = feedbackSchema.safeParse({ ...valid, ease: undefined, return_intent: undefined });
    expect(missing.success).toBe(false);
    expect(missing.error!.issues.map((i) => i.message)).toEqual(["Choose how easy MoneyMap was to use.", "Choose whether you'd use MoneyMap again."]);
  });

  it("rejects unknown options, over-long text, and 'no issues' with an issue", () => {
    expect(feedbackSchema.safeParse({ ...valid, parts_tried: ["bank_login"] }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...valid, comments: "x".repeat(1001) }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...valid, issue_details: "x".repeat(301) }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...valid, issues: ["none", "feature_broken"] }).success).toBe(false);
  });

  it("removes repeated choices", () => {
    expect(feedbackSchema.parse({ ...valid, parts_tried: ["voice", "voice"] }).parts_tried).toEqual(["voice"]);
  });
});

const row = (over: Partial<FeedbackRow>): FeedbackRow => ({
  parts_tried: [], ease: "easy", issues: [], issue_details: null, return_intent: "probably", comments: null, quote_ok: false,
  created_at: "2026-10-24T10:00:00Z", updated_at: "2026-10-24T10:00:00Z", ...over,
});

describe("summary and CSV", () => {
  it("counts only real responses; empty means zero", () => {
    expect(summarise([]).responses).toBe(0);
    const s = summarise([row({ ease: "easy", issues: ["gmail_privacy", "other"] }), row({ ease: "okay", issues: ["gmail_privacy"], return_intent: "definitely" })]);
    expect(s.responses).toBe(2);
    expect(s.ease.find((e) => e.value === "easy")!.count).toBe(1);
    expect(s.issues.find((e) => e.value === "gmail_privacy")!.count).toBe(2);
    expect(s.returning.find((e) => e.value === "definitely")!.count).toBe(1);
  });

  it("numbers testers, quotes commas, and neutralises spreadsheet formulas", () => {
    const csv = toCsv([row({ comments: '=HYPERLINK("x")', issue_details: "slow, then failed" })]);
    const [header, line] = csv.trim().split("\r\n");
    expect(header).toBe("tester,submitted,parts_tried,ease,issues,issue_details,use_again,feedback,ok_to_quote");
    expect(line).toContain("Tester 1");
    expect(line).toContain('"slow, then failed"');
    expect(line).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).not.toMatch(/@|example\.invalid/);
  });
});
