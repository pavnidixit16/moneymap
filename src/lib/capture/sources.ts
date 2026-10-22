// Which input sources exist and whether they are usable in this release. Future sources
// stay listed as unavailable: adding one means writing a parser that returns
// ProposedTransaction[] (see docs/INTEGRATIONS.md) — the review and save path is shared.
import type { CaptureSource } from "./types";

export interface SourceInfo {
  id: CaptureSource;
  available: boolean;
  note: string;
}

export const SOURCE_REGISTRY: SourceInfo[] = [
  { id: "text", available: true, note: "Type a sentence or paste a bank/UPI SMS or email." },
  { id: "voice", available: true, note: "Uses your browser's speech recognition where supported." },
  { id: "document", available: true, note: "CSV bank or card statements (up to 1 MB)." },
  { id: "gmail", available: false, note: "Not built yet. Would need separate, explicit permission." },
  { id: "sms", available: false, note: "Not possible in a web app; would need a future Android app." },
  { id: "bank", available: false, note: "Not built yet. Would need a regulated account-aggregator partner." },
];
