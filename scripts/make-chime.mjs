// Generates public/sounds/milestone.wav: a soft, one-second, three-note chime (C6, E6, G6)
// for milestone celebrations. Run once with `node scripts/make-chime.mjs`; no service or
// licence involved. Quiet on purpose: peak about -12 dBFS.
import { writeFileSync } from "node:fs";

const RATE = 22050;
const LENGTH = 1.2; // seconds
const NOTES = [
  { freq: 1046.5, start: 0.0 },
  { freq: 1318.5, start: 0.12 },
  { freq: 1568.0, start: 0.24 },
];
const samples = new Float32Array(Math.round(RATE * LENGTH));
for (const { freq, start } of NOTES) {
  for (let i = Math.round(start * RATE); i < samples.length; i++) {
    const t = i / RATE - start;
    const attack = Math.min(1, t / 0.01);
    const decay = Math.exp(-t * 4);
    // A little second harmonic gives a bell-like tone.
    samples[i] += attack * decay * (Math.sin(2 * Math.PI * freq * t) + 0.25 * Math.sin(4 * Math.PI * freq * t)) * 0.14;
  }
}
const data = Buffer.alloc(samples.length * 2);
samples.forEach((s, i) => data.writeInt16LE(Math.max(-1, Math.min(1, s)) * 32767, i * 2));
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(data.length, 40);
writeFileSync(new URL("../public/sounds/milestone.wav", import.meta.url), Buffer.concat([header, data]));
console.log(`wrote ${44 + data.length} bytes`);
