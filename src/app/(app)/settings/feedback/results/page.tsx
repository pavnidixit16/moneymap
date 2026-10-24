import { Download } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge, Card, ErrorNote, PageHeader, SectionTitle, Skeleton } from "@/components/ui";
import { isAdmin, requireUser } from "@/lib/data";
import { ISSUES, labelOf, summarise, type FeedbackRow } from "@/lib/feedback";
import { formatDate } from "@/lib/format";

function Bars({ items, total }: { items: { value: string; label: string; count: number }[]; total: number }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((i) => (
        <li key={i.value} className="flex flex-col gap-1 text-sm">
          <span className="flex justify-between gap-2">
            <span>{i.label}</span>
            <span className="tabular-nums text-muted">
              {i.count} of {total}
            </span>
          </span>
          <span className="h-2 rounded-full bg-surface-2" aria-hidden>
            <span className="block h-2 rounded-full bg-accent" style={{ width: `${total ? (i.count / total) * 100 : 0}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

async function Results() {
  // Owners/admins only. Anyone else gets "not found", and the database would return only
  // their own response anyway.
  if (!(await isAdmin())) notFound();
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("feedback_responses")
    .select("parts_tried, ease, issues, issue_details, return_intent, comments, quote_ok, created_at, updated_at")
    .order("created_at", { ascending: true });
  if (error) return <ErrorNote>Couldn&apos;t load feedback. Please refresh the page.</ErrorNote>;
  const rows = data as FeedbackRow[];
  if (rows.length === 0) {
    return (
      <Card>
        <p className="font-semibold">No responses yet</p>
        <p className="text-sm text-muted">When testers send feedback from Settings → Share feedback, it appears here.</p>
      </Card>
    );
  }
  const s = summarise(rows);
  return (
    <>
      <Card className="flex items-center justify-between gap-3">
        <p>
          <span className="text-3xl font-bold">{s.responses}</span>{" "}
          <span className="text-muted">response{s.responses === 1 ? "" : "s"}</span>
        </p>
        <a href="/settings/feedback/results/csv" className="flex items-center gap-2 rounded-full bg-accent-soft px-4 py-2 text-sm font-semibold text-accent">
          <Download className="size-4" aria-hidden /> CSV
        </a>
      </Card>
      <Card className="flex flex-col gap-3">
        <SectionTitle>How easy was it to use?</SectionTitle>
        <Bars items={s.ease} total={s.responses} />
      </Card>
      <Card className="flex flex-col gap-3">
        <SectionTitle>Issues reported (testers can pick several)</SectionTitle>
        <Bars items={s.issues} total={s.responses} />
      </Card>
      <Card className="flex flex-col gap-3">
        <SectionTitle>Would use again next week?</SectionTitle>
        <Bars items={s.returning} total={s.responses} />
      </Card>
      <Card className="flex flex-col gap-3">
        <SectionTitle>Parts tried</SectionTitle>
        <Bars items={s.parts} total={s.responses} />
      </Card>
      <Card className="flex flex-col gap-3">
        <SectionTitle>In their words</SectionTitle>
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((r, i) => (
            <li key={i} className="flex flex-col gap-1 py-3 text-sm">
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                Tester {i + 1} · {formatDate(r.created_at.slice(0, 10))}
                {r.quote_ok ? <Badge tone="success">OK to quote</Badge> : <Badge>Don&apos;t quote</Badge>}
              </span>
              {r.comments ? <p className="whitespace-pre-wrap">{r.comments}</p> : <p className="text-muted">No overall comment.</p>}
              {r.issue_details && (
                <p className="text-muted">
                  Issue ({r.issues.filter((x) => x !== "none").map((x) => labelOf(ISSUES, x)).join(", ")}): {r.issue_details}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

export default function FeedbackResultsPage() {
  return (
    <>
      <PageHeader title="What we learned" subtitle="Feedback from testers, visible only to admins" />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Results />
      </Suspense>
    </>
  );
}
