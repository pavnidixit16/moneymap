import Link from "next/link";
import { Suspense } from "react";
import { PageHeader, Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/data";
import type { FeedbackInput } from "@/lib/feedback";
import { FeedbackForm } from "./feedback-form";

async function FormLoader() {
  const { supabase, userId } = await requireUser();
  // A tester who already sent feedback sees their answers and can update them.
  const { data } = await supabase
    .from("feedback_responses")
    .select("parts_tried, ease, issues, issue_details, return_intent, comments, quote_ok")
    .eq("user_id", userId)
    .maybeSingle();
  return <FeedbackForm key={crypto.randomUUID()} initial={data ? ({ ...data, issue_details: data.issue_details ?? "", comments: data.comments ?? "" } as FeedbackInput) : null} />;
}

export default function FeedbackPage() {
  return (
    <>
      <PageHeader
        title="Share feedback"
        subtitle="Five quick questions, under two minutes"
        action={
          <Link href="/settings" className="text-sm font-semibold text-accent">
            Cancel
          </Link>
        }
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <FormLoader />
      </Suspense>
    </>
  );
}
