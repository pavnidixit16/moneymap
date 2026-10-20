import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader, Skeleton } from "@/components/ui";
import { defaultTrackingMode, PRESETS } from "@/lib/commitments";
import { CommitmentForm, type CommitmentFormValues } from "../commitment-form";

async function NewForm({ searchParams }: { searchParams: PageProps<"/commitments/new">["searchParams"] }) {
  await connection();
  const { preset: key } = await searchParams;
  const preset = PRESETS.find((p) => p.key === key);
  const kind = preset?.kind ?? "bill";
  const subtype = preset?.subtype ?? "rent";

  const initial: CommitmentFormValues = {
    name: preset?.name ?? "",
    kind,
    subtype,
    tracking_mode: defaultTrackingMode(kind, subtype),
    amount: "",
    amount_is_estimate: preset?.estimate ?? false,
    frequency: preset?.frequency ?? "monthly",
    next_due_date: "",
    end_date: "",
    maturity_date: "",
    notes: "",
  };
  // A fresh key per request: Next.js keeps visited pages alive in the background, and
  // this makes every visit start with an empty form instead of the previous entry.
  return <CommitmentForm key={crypto.randomUUID()} initial={initial} />;
}

export default function NewCommitmentPage({ searchParams }: PageProps<"/commitments/new">) {
  return (
    <>
      <PageHeader
        title="Add commitment"
        action={
          <Link href="/commitments" className="text-sm font-medium text-accent underline">
            Back
          </Link>
        }
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <NewForm searchParams={searchParams} />
      </Suspense>
    </>
  );
}
