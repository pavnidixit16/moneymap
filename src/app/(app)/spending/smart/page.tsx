import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { SmartEntry } from "./smart-entry";

export default function SmartAddPage() {
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
      <SmartEntry />
    </>
  );
}
