"use client";

import { FileUp, Keyboard, Mic, MicOff, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SuccessNote, inputClass, primaryButton } from "@/components/ui";
import { useHydrated } from "@/components/use-hydrated";
import { parseText } from "@/lib/capture/parse-text";
import { SOURCE_REGISTRY } from "@/lib/capture/sources";
import { SOURCE_LABELS, type ProposedTransaction } from "@/lib/capture/types";
import { istToday } from "@/lib/engine/dates";
import { ImportReview } from "./import-review";
import { ReviewCard, valuesFrom, type DraftValues } from "./review-card";

type Tab = "type" | "speak" | "upload";
interface Draft {
  proposal: ProposedTransaction;
  values: DraftValues;
  clientRequestId: string;
}

const STORAGE_KEY = "moneymap.smart-draft";

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
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
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

  function startDraft(input: string, source: "text" | "voice") {
    const proposal = parseText(input, istToday(), source);
    const next: Draft = { proposal, values: valuesFrom(proposal), clientRequestId: crypto.randomUUID() };
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
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const transcript = Array.from(e.results).map((res) => res[0].transcript).join(" ");
      setText(transcript);
    };
    r.onerror = (e) => setVoiceError(e.error === "not-allowed" ? "Microphone permission was denied. Allow it in your browser settings, or type instead." : "Couldn't hear that. Try again or type instead.");
    r.onend = () => setListening(false);
    recognition.current = r;
    setListening(true);
    r.start();
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
        <ReviewCard
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
                <p className="text-sm text-muted">{listening ? "Listening… say it like “I spent 450 on dinner yesterday”." : "Tap and say what you spent."}</p>
                <p className="text-center text-xs text-muted">
                  Your browser converts speech to text, which may use Apple&apos;s or Google&apos;s speech service. Check the text
                  below before continuing.
                </p>
                {voiceError && <p role="alert" className="text-sm text-danger">{voiceError}</p>}
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
              onChange={(e) => setText(e.target.value)}
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
          <p className="text-xs text-muted">MoneyMap reads this on your device and shows you a draft. Nothing is saved until you confirm.</p>
        </section>
      )}

      {tab === "upload" && <ImportReview />}

      <details className="rounded-2xl border border-border bg-surface p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Other sources</summary>
        <ul className="flex flex-col gap-2 pt-2">
          {SOURCE_REGISTRY.map((s) => (
            <li key={s.id} className="flex justify-between gap-3">
              <span>{SOURCE_LABELS[s.id]}</span>
              <span className={`text-right text-xs ${s.available ? "text-success" : "text-muted"}`}>
                {s.available ? "Available" : "Not available yet"} · {s.note}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
