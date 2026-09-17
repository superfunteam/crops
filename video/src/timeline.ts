import beats from "./beats.json";

// Everything is placed on the soundtrack's beat grid (see scripts/analyze-beats.py).
// Beat 0 is the first downbeat; a bar is 4 beats.
export const FPS = 60;
export const DURATION = beats.durationInFrames;
const PERIOD = beats.beatSeconds;
const OFFSET = beats.firstBeat - PERIOD;

export const beat = (n: number) =>
  Math.max(0, Math.round((OFFSET + n * PERIOD) * FPS));
export const BEAT_FRAMES = PERIOD * FPS;
export const KICKS = beats.kicks.map((s) => Math.round(s * FPS));

// Song map: intro riser, drop at bar 1 (beat 4), bright hats at bar 9, break at bar 12,
// last push at bar 13, music ends after bar 16.
export const SCENES = {
  intro: [0, 6],
  answer: [6, 10],
  title: [10, 16],
  timer: [16, 20],
  teams: [20, 24],
  billing: [24, 28],
  apps: [28, 32],
  reports: [32, 36],
  harvest: [36, 48],
  free: [48, 52],
  agents: [52, 64],
  outro: [64, 74],
} as const;

export const COLORS = {
  green: "#294e3c",
  greenDark: "#1d402e",
  cream: "#e8efda",
  paper: "#f6f5ef",
  card: "#fbfaf5",
  ink: "#2b352e",
  muted: "#707b64",
  sage: "#aec0a1",
  lime: "#c9dba2",
  pale: "#e3efc6",
  forest: "#28533e",
  harvest: "#fa5d00",
};
