"use client";

import { Award, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ACHIEVEMENTS, type AchievementKey } from "@/lib/progress";
import { markCelebrated } from "./actions";

// Celebration sounds are a per-device preference (on by default). Stored in this browser
// only; if storage is unavailable, sounds simply stay on for the visit.
const SOUND_KEY = "moneymap.sound";
const listeners = new Set<() => void>();
function soundOn(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}
export function useSoundPreference(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    soundOn,
    () => true,
  );
  const set = (value: boolean) => {
    try {
      window.localStorage.setItem(SOUND_KEY, value ? "on" : "off");
    } catch {
      // storage blocked: the change lasts until the page is closed
    }
    listeners.forEach((cb) => cb());
  };
  return [on, set];
}

type PlayResult = "played" | "blocked" | "unavailable";

// A short chime, then (where the device offers it) a spoken line. Browsers only allow
// sound after a tap, so a celebration found on page load offers a Play button instead.
async function playCelebration(voice?: string): Promise<PlayResult> {
  try {
    const audio = new Audio("/sounds/milestone.wav");
    audio.volume = 0.8;
    await audio.play();
  } catch (e) {
    return e instanceof DOMException && e.name === "NotAllowedError" ? "blocked" : "unavailable";
  }
  if (voice && "speechSynthesis" in window) {
    window.setTimeout(() => {
      try {
        const line = new SpeechSynthesisUtterance(voice);
        line.lang = "en-IN";
        line.rate = 1;
        window.speechSynthesis.speak(line);
      } catch {
        // spoken line is optional
      }
    }, 900);
  }
  return "played";
}

export function SoundToggle() {
  const [on, set] = useSoundPreference();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => set(!on)}
      className="flex items-center gap-2 self-start text-sm font-semibold text-muted"
    >
      {on ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
      Celebration sounds: {on ? "on" : "off"}
    </button>
  );
}

// Shown once per newly earned achievement. `fromTap` means it follows the user's own tap,
// so sound may play straight away; otherwise the user can play it.
export function Celebration({ keys, fromTap, onDone }: { keys: AchievementKey[]; fromTap: boolean; onDone: () => void }) {
  const [soundEnabled] = useSoundPreference();
  const [sound, setSound] = useState<PlayResult | "idle">("idle");
  const started = useRef(false);
  const items = ACHIEVEMENTS.filter((a) => keys.includes(a.key));
  const voice = [...items].reverse().find((a) => a.voice)?.voice;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Mark first, so leaving or refreshing never shows this celebration again.
    markCelebrated(keys).catch(() => undefined);
    if (fromTap && soundEnabled) playCelebration(voice).then(setSound);
  }, [keys, fromTap, soundEnabled, voice]);

  if (!items.length) return null;
  return (
    <section
      role="status"
      aria-live="polite"
      aria-label="New achievement"
      className="flex animate-[mm-rise_300ms_ease-out] flex-col gap-3 rounded-2xl border border-accent/30 bg-accent-soft p-4"
    >
      {items.map((a) => (
        <div key={a.key} className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Award className="size-5" aria-hidden />
          </span>
          <div>
            <p className="font-semibold">New achievement: {a.title}</p>
            <p className="text-sm text-muted">{a.voice ?? a.description}</p>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {soundEnabled && sound !== "played" && (
          <button type="button" onClick={() => playCelebration(voice).then(setSound)} className="flex items-center gap-1 font-semibold text-accent underline">
            <Volume2 className="size-4" aria-hidden /> Play sound
          </button>
        )}
        {sound === "played" && (
          <button type="button" onClick={() => playCelebration(voice).then(setSound)} className="flex items-center gap-1 font-semibold text-accent underline">
            <Volume2 className="size-4" aria-hidden /> Replay
          </button>
        )}
        {sound === "unavailable" && <span className="text-muted">Sound isn&apos;t available on this device right now.</span>}
        <button type="button" onClick={onDone} className="font-semibold underline">
          Done
        </button>
      </div>
    </section>
  );
}
