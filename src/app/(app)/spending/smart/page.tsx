import Link from "next/link";
import { Suspense } from "react";
import { PageHeader, Skeleton } from "@/components/ui";
import { getGmailStatus } from "./gmail-actions";
import { SmartEntry } from "./smart-entry";

async function SmartEntryLoader({ searchParams }: { searchParams: Promise<{ tab?: string; gmail?: string }> }) {
  const [params, gmail] = await Promise.all([searchParams, getGmailStatus()]);
  const tab = params.tab === "gmail" && gmail.available ? "gmail" : "type";
  return <SmartEntry key={params.gmail ?? "smart"} gmail={gmail} initialTab={tab} gmailResult={params.gmail} />;
}

export default function SmartAddPage({ searchParams }: { searchParams: Promise<{ tab?: string; gmail?: string }> }) {
  return (
    <>
      <PageHeader
        title="Smart add"
        subtitle="Type, speak or upload. You check everything before it's saved."
        action={
          <Link href="/spending" className="text-sm font-semibold text-accent">
            Cancel
          </Link>
        }
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <SmartEntryLoader searchParams={searchParams} />
      </Suspense>
    </>
  );
}
