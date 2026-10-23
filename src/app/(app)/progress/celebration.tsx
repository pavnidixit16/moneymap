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

const SOUND_SRC = "/sounds/milestone.wav";
let shared: HTMLAudioElement | null = null;
let primed = false;
function soundElement(): HTMLAudioElement {
  shared ??= Object.assign(new Audio(SOUND_SRC), { preload: "auto" });
  return shared;
}

// Phones only allow sound that starts during a tap. Saving a check-in takes a moment, so
// the tap "warms up" one shared audio element (and the speech voice) silently; the
// celebration then plays through it once the server has confirmed.
export function primeSound() {
  if (primed) return;
  try {
    const a = soundElement();
    a.muted = true;
    a.play()
      .then(() => {
        a.pause();
        a.currentTime = 0;
        a.muted = false;
        primed = true;
      })
      .catch(() => {
        a.muted = false;
      });
    if ("speechSynthesis" in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
  } catch {
    // sound is optional
  }
}

// A short chime, then (where the device offers it) a spoken line.
async function playCelebration(voice?: string): Promise<PlayResult> {
  try {
    const a = soundElement();
    a.muted = false;
    a.currentTime = 0;
    a.volume = 0.8;
    await a.play();
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

// Shown once per newly earned achievement. Sound plays straight away when the browser
// allows it (after the user's tap), otherwise on the first tap anywhere, or via Play.
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
    if (!soundEnabled) return;
    playCelebration(voice).then((result) => {
      setSound(result);
      // Opened without a tap (e.g. today was counted by saving an entry): the browser
      // blocks sound until the user touches the page, so play on the first tap anywhere.
      if (result !== "blocked") return;
      const onTap = () => {
        document.removeEventListener("pointerdown", onTap, true);
        playCelebration(voice).then(setSound);
      };
      document.addEventListener("pointerdown", onTap, true);
    });
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
