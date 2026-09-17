import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
} from "remotion";
import { DURATION, FPS, KICKS, beat } from "./timeline";

const SceneStart = createContext(0);

// A scene lives between two beats. Children animate on beats relative to the song.
export function Scene({
  range,
  children,
  exit = true,
}: {
  range: readonly [number, number];
  children: ReactNode;
  exit?: boolean;
}) {
  const from = beat(range[0]);
  const to = Math.min(DURATION, beat(range[1]));
  return (
    <Sequence from={from} durationInFrames={to - from} name={`beats ${range[0]}–${range[1]}`}>
      <SceneStart.Provider value={from}>
        <Exit length={to - from} enabled={exit}>
          {children}
        </Exit>
      </SceneStart.Provider>
    </Sequence>
  );
}

function Exit({ length, enabled, children }: { length: number; enabled: boolean; children: ReactNode }) {
  const frame = useCurrentFrame();
  const t = enabled
    ? interpolate(frame, [length - 9, length], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.in(Easing.cubic),
      })
    : 0;
  return (
    <AbsoluteFill
      style={{
        opacity: 1 - t,
        transform: `translateY(${-36 * t}px) scale(${1 - 0.02 * t})`,
        filter: t ? `blur(${10 * t}px)` : undefined,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

/** Frames since beat `n` inside the current scene (negative before it). */
export function useSince(n: number) {
  return useCurrentFrame() + useContext(SceneStart) - beat(n);
}

export function useGlobalFrame() {
  return useCurrentFrame() + useContext(SceneStart);
}

export function pop(since: number, soft = false) {
  return spring({
    frame: since,
    fps: FPS,
    config: soft
      ? { damping: 22, stiffness: 90, mass: 0.9 }
      : { damping: 14, stiffness: 190, mass: 0.6 },
  });
}

/** Rises into place on beat `at`: slide, blur and a little overshoot. */
export function Rise({
  at,
  children,
  y = 48,
  x = 0,
  soft = false,
  style,
  inline = false,
}: {
  at: number;
  children: ReactNode;
  y?: number;
  x?: number;
  soft?: boolean;
  style?: CSSProperties;
  inline?: boolean;
}) {
  const since = useSince(at);
  const p = pop(since, soft);
  const fade = interpolate(since, [0, 7], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        display: inline ? "inline-block" : "block",
        opacity: fade,
        transform: `translate(${x * (1 - p)}px, ${y * (1 - p)}px) scale(${0.94 + 0.06 * p})`,
        filter: fade < 1 ? `blur(${12 * (1 - fade)}px)` : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Decays after each kick drum hit. */
export function kickPulse(frame: number, decay = 5) {
  let last = -Infinity;
  for (const k of KICKS) {
    if (k > frame) break;
    last = k;
  }
  const since = frame - last;
  return since < 40 ? Math.exp(-since / decay) : 0;
}
