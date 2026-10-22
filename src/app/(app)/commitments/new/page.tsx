import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { IconBubble } from "@/components/icons";
import { PageHeader, Skeleton } from "@/components/ui";
import { COMMITMENT_TYPES, typeByKey } from "@/lib/catalog";
import { FREQUENCIES, type Frequency } from "@/lib/engine/types";
import { paiseToInput, parseRupees } from "@/lib/money";
import { CommitmentForm } from "../commitment-form";

// Older links used ?preset=; map them onto the current type keys.
const LEGACY_PRESETS: Record<string, string> = { electricity: "bill", ott: "subscription" };

function TypePicker() {
  return (
    <ul className="grid grid-cols-1 gap-2">
      {COMMITMENT_TYPES.map((t) => (
        <li key={t.key}>
          <Link href={`/commitments/new?type=${t.key}`} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
            <IconBubble name={t.icon} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold">{t.label}</span>
              <span className="truncate text-xs text-muted">{t.description}</span>
            </span>
            <ChevronRight className="size-4 text-muted" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function NewContent({ searchParams }: { searchParams: PageProps<"/commitments/new">["searchParams"] }) {
  await connection();
  const params = await searchParams;
  const raw = typeof params.type === "string" ? params.type : typeof params.preset === "string" ? params.preset : undefined;
  const type = typeByKey(raw ? (LEGACY_PRESETS[raw] ?? raw) : undefined);
  if (!type) return <TypePicker />;

  // Prefill offered by Smart add ("Add Netflix as a subscription"); still only saved here.
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const prefillName = str(params.name).slice(0, 80);
  const prefillAmount = parseRupees(str(params.amount));
  const prefillFrequency = FREQUENCIES.includes(str(params.frequency) as Frequency) ? (str(params.frequency) as Frequency) : null;

  return (
    <>
      <div className="flex items-center gap-3">
        <IconBubble name={type.icon} />
        <div>
          <p className="font-semibold">{type.label}</p>
          <Link href="/commitments/new" className="text-xs font-semibold text-accent underline">
            Change type
          </Link>
        </div>
      </div>
      {/* A fresh key per request: Next.js keeps visited pages alive in the background, and
          this makes every visit start with an empty form instead of the previous entry. */}
      <CommitmentForm
        key={crypto.randomUUID()}
        initial={{
          variant: type.variant,
          name: prefillName || type.name,
          kind: type.kind,
          subtype: type.subtype,
          tracking_mode: type.mode,
          amount: prefillAmount ? paiseToInput(prefillAmount) : "",
          amount_is_estimate: type.estimate ?? false,
          frequency: prefillFrequency ?? type.frequency,
          next_due_date: "",
          end_date: "",
          maturity_date: "",
          provider: "",
          coverage: "",
          interest_rate: "",
          notes: "",
        }}
      />
    </>
  );
}

export default function NewCommitmentPage({ searchParams }: PageProps<"/commitments/new">) {
  return (
    <>
      <PageHeader
        title="Add commitment"
        subtitle="Bills, EMIs, cards, insurance, subscriptions and savings"
        action={
          <Link href="/commitments" className="text-sm font-semibold text-accent">
            Cancel
          </Link>
        }
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <NewContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
