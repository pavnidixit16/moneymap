// Tester feedback: the five questions, their answer codes, validation (run on the server
// for every submission) and the owner's summary. Only fixed answer codes and two short
// optional texts are stored: no amounts, account details or email contents.
import { z } from "zod";

export const PARTS = [
  { value: "dashboard", label: "Dashboard and estimated money remaining" },
  { value: "gmail", label: "Gmail integration" },
  { value: "voice", label: "Voice expense entry" },
  { value: "document", label: "Document upload" },
  { value: "commitments", label: "Commitments and upcoming payments" },
  { value: "progress", label: "Progress/check-in section" },
] as const;

export const EASE = [
  { value: "very_easy", label: "Very easy" },
  { value: "easy", label: "Easy" },
  { value: "okay", label: "Okay" },
  { value: "difficult", label: "Difficult" },
  { value: "very_difficult", label: "Very difficult" },
] as const;

export const ISSUES = [
  { value: "incorrect_transaction", label: "Incorrect or duplicate transaction" },
  { value: "gmail_privacy", label: "Gmail permissions or privacy concerns" },
  { value: "estimate_unclear", label: "Estimated money remaining was unclear" },
  { value: "hard_to_find", label: "Something was difficult to find or understand" },
  { value: "feature_broken", label: "A feature didn't work" },
  { value: "none", label: "No issues — everything seemed fine" },
  { value: "other", label: "Other" },
] as const;

export const RETURN = [
  { value: "definitely", label: "Definitely yes" },
  { value: "probably", label: "Probably yes" },
  { value: "not_sure", label: "Not sure" },
  { value: "probably_not", label: "Probably not" },
] as const;

const values = <T extends readonly { value: string }[]>(list: T) => list.map((o) => o.value) as [T[number]["value"], ...T[number]["value"][]];
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((s) => (s === "" ? null : s));

export const feedbackSchema = z
  .object({
    parts_tried: z.array(z.enum(values(PARTS))).max(PARTS.length),
    ease: z.enum(values(EASE), { error: "Choose how easy MoneyMap was to use." }),
    issues: z.array(z.enum(values(ISSUES))).max(ISSUES.length),
    issue_details: optionalText(300, "Keep the details under 300 characters."),
    return_intent: z.enum(values(RETURN), { error: "Choose whether you'd use MoneyMap again." }),
    comments: optionalText(1000, "Keep your feedback under 1,000 characters."),
    quote_ok: z.boolean(),
  })
  .refine((v) => !(v.issues.includes("none") && v.issues.length > 1), {
    path: ["issues"],
    message: "“No issues” can't be combined with other issues.",
  })
  .transform((v) => ({ ...v, parts_tried: [...new Set(v.parts_tried)], issues: [...new Set(v.issues)] }));

export type FeedbackInput = z.input<typeof feedbackSchema>;
export type FeedbackRow = z.output<typeof feedbackSchema> & { created_at: string; updated_at: string };

export const labelOf = (list: readonly { value: string; label: string }[], value: string) => list.find((o) => o.value === value)?.label ?? value;

// Counts for the owner's "What we learned" view, straight from the saved responses.
export function summarise(rows: FeedbackRow[]) {
  const tally = (list: readonly { value: string; label: string }[], pick: (r: FeedbackRow) => string[]) =>
    list.map((o) => ({ ...o, count: rows.filter((r) => pick(r).includes(o.value)).length }));
  return {
    responses: rows.length,
    ease: tally(EASE, (r) => [r.ease]),
    issues: tally(ISSUES, (r) => r.issues),
    returning: tally(RETURN, (r) => [r.return_intent]),
    parts: tally(PARTS, (r) => r.parts_tried),
  };
}

// CSV for download. Cells starting with = + - @ are prefixed so spreadsheets never run them
// as formulas; testers are numbered, not named.
export function toCsv(rows: FeedbackRow[]): string {
  const cell = (v: string) => {
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const header = ["tester", "submitted", "parts_tried", "ease", "issues", "issue_details", "use_again", "feedback", "ok_to_quote"];
  const lines = rows.map((r, i) =>
    [
      `Tester ${i + 1}`,
      r.created_at.slice(0, 10),
      r.parts_tried.map((p) => labelOf(PARTS, p)).join("; "),
      labelOf(EASE, r.ease),
      r.issues.map((p) => labelOf(ISSUES, p)).join("; "),
      r.issue_details ?? "",
      labelOf(RETURN, r.return_intent),
      r.comments ?? "",
      r.quote_ok ? "yes" : "no",
    ]
      .map(cell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\r\n") + "\r\n";
}
