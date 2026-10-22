"use client";

import { FileUp, Keyboard, Mic, MicOff, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SuccessNote, inputClass, primaryButton } from "@/components/ui";
import { useHydrated } from "@/components/use-hydrated";
import { detectMessage, IGNORE_LABELS } from "@/lib/capture/detect-message";
import { parseExpenses } from "@/lib/capture/parse-text";
import type { ProposedTransaction } from "@/lib/capture/types";
import { istToday } from "@/lib/engine/dates";
import { formatDate } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { ImportReview } from "./import-review";
import { ReviewCard, valuesFrom, type DraftValues } from "./review-card";

type Tab = "type" | "speak" | "upload";
interface Draft {
  proposal: ProposedTransaction;
  values: DraftValues;
  clientRequestId: string;
  // When one sentence held several expenses: the ones still to review, and where we are.
  queue?: ProposedTransaction[];
  position?: number;
  total?: number;
}

const STORAGE_KEY = "moneymap.smart-draft";

// Plain-language explanations for the browser's speech-recognition error codes.
const VOICE_ERRORS: Record<string, string> = {
  "not-allowed": "Microphone permission was denied. Allow it for this site in your browser settings, or type instead.",
  "service-not-allowed": "Speech recognition is turned off on this device. On iPhone: Settings → General → Keyboard → turn on Enable Dictation. Or type instead.",
  "no-speech": "Didn't catch anything. Tap the microphone and start speaking straight away.",
  "audio-capture": "No microphone was found. Check your microphone, or type instead.",
  network: "The speech service couldn't be reached. Check your connection, or type instead.",
  "language-not-supported": "Speech recognition for Indian English isn't available in this browser. Type instead.",
};

// Browser storage is a convenience only: it keeps an unsaved draft if a save fails or the
// page reloads. It never stands in for saving.
function loadDraft(): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
function storeDraft(d: Draft | null) {
  try {
    if (d) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode): the draft simply lives in memory.
  }
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function speechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function SmartEntry() {
  const hydrated = useHydrated();
  const [tab, setTab] = useState<Tab>("type");
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [restored, setRestored] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  // Pasted text that isn't a transaction (an OTP, a failed payment, an advert, a card
  // statement): explained instead of turned into a wrong draft. The user can still go ahead.
  const [notice, setNotice] = useState<{ message: string; link?: boolean } | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const saved = loadDraft();
    if (saved) {
      // Restoring a draft kept after a failed save or a reload.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from storage
      setDraft(saved);
      setRestored(true);
    }
  }, []);

  function draftFor(proposal: ProposedTransaction, queue: ProposedTransaction[], position: number, total: number): Draft {
    return { proposal, values: valuesFrom(proposal), clientRequestId: crypto.randomUUID(), queue, position, total };
  }

  function startDraft(input: string, source: "text" | "voice", force = false) {
    if (source === "text" && !force) {
      const d = detectMessage({ source: "text", messageId: null, body: input }, istToday());
      if (d.type === "ignore" && (d.reason === "otp" || d.reason === "failed" || d.reason === "promotion")) {
        setNotice({ message: IGNORE_LABELS[d.reason] });
        return;
      }
      if (d.type === "card_statement") {
        const parts = [d.issuer ? `${d.issuer} credit card statement` : "Credit card statement"];
        if (d.totalDuePaise) parts.push(`total due ${formatINR(d.totalDuePaise)}`);
        if (d.dueDate) parts.push(`due ${formatDate(d.dueDate)}`);
        setNotice({ message: `${parts.join(", ")}. A card bill isn't spending: add or update the card under Commitments.`, link: true });
        return;
      }
    }
    setNotice(null);
    const [first, ...rest] = parseExpenses(input, istToday(), source);
    const next = draftFor(first, rest, 1, rest.length + 1);
    setDraft(next);
    storeDraft(next);
    setSuccess(null);
    setRestored(false);
  }

  function updateValues(values: DraftValues) {
    if (!draft) return;
    const next = { ...draft, values };
    setDraft(next);
    storeDraft(next);
  }

  function finish(message: string | null) {
    // Move on to the next expense from the same sentence, if any.
    const [following, ...rest] = draft?.queue ?? [];
    if (draft && following) {
      const next = draftFor(following, rest, (draft.position ?? 1) + 1, draft.total ?? 1);
      setDraft(next);
      storeDraft(next);
      setSuccess(message);
      return;
    }
    setDraft(null);
    storeDraft(null);
    setText("");
    setRestored(false);
    setSuccess(message);
  }

  const Recognition = hydrated ? speechRecognitionCtor() : null;
  function toggleVoice() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    if (!Recognition) return;
    setVoiceError(null);
    const r = new Recognition();
    r.lang = "en-IN";
    // Live results: iPhone Safari often ends a session without a "final" result, so keep
    // whatever was heard as it arrives.
    r.interimResults = true;
    // Keep listening through pauses so several expenses can be said in one go; the user taps
    // stop when done.
    r.continuous = true;
    let heard = "";
    r.onresult = (e) => {
      heard = Array.from(e.results).map((res) => res[0].transcript).join(" ").trim();
      setText(heard);
      if (heard) setVoiceError(null);
    };
    r.onerror = (e) => {
      if (e.error === "aborted") return; // the user tapped stop
      // Safari can report "no speech" after it has already passed on words; keep the words.
      if (heard && e.error === "no-speech") return;
      setVoiceError(`${VOICE_ERRORS[e.error] ?? "Voice input didn't work this time. Try again, or type instead."} (code: ${e.error})`);
    };
    r.onend = () => {
      setListening(false);
      if (heard) setVoiceError(null);
      else setVoiceError((prev) => prev ?? `${VOICE_ERRORS["no-speech"]} (code: no-result)`);
    };
    recognition.current = r;
    setListening(true);
    try {
      r.start();
    } catch {
      setListening(false);
      setVoiceError("Voice input couldn't start. Tap the microphone again, or type instead.");
    }
  }

  const tabs: { key: Tab; label: string; icon: typeof Keyboard }[] = [
    { key: "type", label: "Type", icon: Keyboard },
    { key: "speak", label: "Speak", icon: Mic },
    { key: "upload", label: "Statement", icon: FileUp },
  ];

  if (draft) {
    return (
      <>
        {restored && <p className="rounded-xl bg-surface-2 p-2 text-xs">You have an unsaved draft from earlier. Confirm it or discard it.</p>}
        {success && <SuccessNote>{success}</SuccessNote>}
        {(draft.total ?? 1) > 1 && (
          <p className="text-sm font-semibold">
            Expense {draft.position} of {draft.total} from what you said
          </p>
        )}
        <ReviewCard
          key={draft.clientRequestId}
          proposal={draft.proposal}
          clientRequestId={draft.clientRequestId}
          values={draft.values}
          onChange={updateValues}
          onSaved={(m) => finish(m)}
          onDiscard={() => finish(null)}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {success && (
        <SuccessNote>
          {success}{" "}
          <Link href="/spending" className="font-semibold underline">
            View spending
          </Link>
        </SuccessNote>
      )}

      <nav aria-label="Ways to add" className="grid grid-cols-3 gap-1 rounded-full border border-border bg-surface p-1">
        {tabs.map(({ key, label, icon: TabIcon }) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={`flex items-center justify-center gap-1.5 rounded-full py-2 text-xs font-semibold ${tab === key ? "bg-accent text-accent-foreground" : "text-muted"}`}
          >
            <TabIcon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </nav>

      {tab !== "upload" && (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          {tab === "speak" &&
            (Recognition ? (
              <div className="flex flex-col items-center gap-2 py-2">
                <button
                  type="button"
                  onClick={toggleVoice}
                  aria-label={listening ? "Stop listening" : "Start speaking"}
                  className={`flex size-20 items-center justify-center rounded-full ${listening ? "animate-pulse bg-danger text-white" : "bg-accent text-accent-foreground"}`}
                >
                  {listening ? <MicOff className="size-8" aria-hidden /> : <Mic className="size-8" aria-hidden />}
                </button>
                <p className="text-sm text-muted">{listening ? "Listening… tap the red button when you're done." : "Tap and say what you spent. You can list several, like “450 on dinner and 200 on a cab yesterday”."}</p>
                <p className="text-center text-xs text-muted">
                  Your browser converts speech to text, which may use Apple&apos;s or Google&apos;s speech service. Check the text
                  below before continuing.
                </p>
                {voiceError && <p role="alert" className="text-center text-sm text-danger">{voiceError}</p>}
                <p className="text-center text-xs text-muted">
                  Voice not working? Tap the box below and use the microphone on your phone&apos;s keyboard to dictate. It works
                  in every browser.
                </p>
              </div>
            ) : (
              <p className="rounded-xl bg-surface-2 p-3 text-sm">
                {hydrated ? "Voice input isn't supported in this browser. Type or paste the expense below instead." : "Checking voice support…"}
              </p>
            ))}

          <label className="flex flex-col gap-1 text-sm font-medium">
            {tab === "speak" ? "What you said" : "Describe an expense, or paste a bank / UPI SMS or email"}
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setNotice(null);
              }}
              rows={4}
              maxLength={500}
              placeholder="I spent ₹450 on dinner yesterday"
              className={`${inputClass} h-auto py-2`}
            />
          </label>
          <button
            type="button"
            disabled={!hydrated || text.trim() === ""}
            onClick={() => startDraft(text, tab === "speak" ? "voice" : "text")}
            className={`${primaryButton} flex items-center justify-center gap-2`}
          >
            <Sparkles className="size-5" aria-hidden /> Read it
          </button>
          {notice && (
            <div role="status" className="flex flex-col gap-2 rounded-xl border border-warning/50 p-3 text-sm">
              <p>{notice.message}</p>
              <div className="flex flex-wrap gap-3">
                {notice.link && (
                  <Link href="/commitments?tab=all" className="font-semibold text-accent underline">
                    Go to Commitments
                  </Link>
                )}
                <button type="button" onClick={() => startDraft(text, "text", true)} className="font-semibold text-accent underline">
                  Read it anyway
                </button>
              </div>
            </div>
          )}
          <p className="text-xs text-muted">MoneyMap reads this on your device and shows you a draft. Nothing is saved until you confirm.</p>
        </section>
      )}

      {tab === "upload" && <ImportReview />}

    </div>
  );
}
