import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { FONT } from "./fonts";
import { kickPulse } from "./motion";
import { COLORS, DURATION, SCENES, beat } from "./timeline";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Green field with the checking security pattern. It sweeps in with the intro,
 *  breathes with the kick, clears out for the break, and sweeps back for the finale. */
export function Background() {
  const frame = useCurrentFrame();
  const sweepIn = interpolate(frame, [0, beat(4)], [-30, 150], {
    ...clamp,
    easing: Easing.in(Easing.quad),
  });
  const breakOut = interpolate(frame, [beat(SCENES.free[0]) - 6, beat(SCENES.free[0]) + 50], [0, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const dropIn = interpolate(frame, [beat(SCENES.agents[0]) - 4, beat(SCENES.agents[0]) + 26], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const endOut = interpolate(frame, [DURATION - 150, DURATION - 20], [0, 1], {
    ...clamp,
    easing: Easing.in(Easing.cubic),
  });
  const radius = frame < beat(SCENES.free[0])
    ? sweepIn
    : frame < beat(SCENES.agents[0]) - 4
      ? 150 - 180 * breakOut
      : -30 + 180 * dropIn - 180 * endOut;
  const pulse = frame < beat(SCENES.outro[0]) + 60 ? kickPulse(frame) : 0;
  const drift = frame * 0.35;
  const mask = `radial-gradient(circle at 42% 50%, #000 ${radius}%, transparent ${radius + 28}%)`;
  return (
    <AbsoluteFill style={{ background: COLORS.green, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1200px 800px at ${30 + 6 * Math.sin(frame / 240)}% ${40 + 8 * Math.cos(frame / 300)}%, #34604a 0%, transparent 70%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -120,
          top: -120,
          width: "calc(100% + 240px)",
          height: "calc(100% + 240px)",
          backgroundImage: `url(${staticFile("security-pattern.svg")})`,
          backgroundSize: "840px 420px",
          backgroundPosition: `${-drift}px ${drift * 0.3}px`,
          opacity: 0.8 + 0.35 * pulse,
          transform: `scale(${1.02 + 0.012 * pulse})`,
          WebkitMaskImage: mask,
          maskImage: mask,
        }}
      />
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse at center, transparent 55%, rgba(12, 32, 22, 0.55) 100%)",
        }}
      />
    </AbsoluteFill>
  );
}

/** A white flash on the big drops. */
export function Flash({ at }: { at: number }) {
  const frame = useCurrentFrame();
  const since = frame - beat(at);
  const o = since >= 0 ? interpolate(since, [0, 14], [0.16, 0], clamp) : 0;
  return <AbsoluteFill style={{ background: "#f3f5e8", opacity: o, pointerEvents: "none" }} />;
}

export const page: CSSProperties = {
  fontFamily: FONT,
  color: COLORS.cream,
  padding: "0 150px",
  justifyContent: "center",
  fontFeatureSettings: '"tnum"',
};

export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ fontSize: 34, fontWeight: 450, color: COLORS.lime, marginBottom: 28, letterSpacing: "-0.01em", ...style }}>
      {children}
    </div>
  );
}

export const headline: CSSProperties = {
  fontSize: 104,
  fontWeight: 480,
  letterSpacing: "-0.045em",
  lineHeight: 1.04,
  margin: 0,
  color: "#f3f5e8",
};

export function Logo({ size }: { size: number }) {
  return (
    <Img
      src={staticFile("crops.svg")}
      style={{ width: size, height: size, borderRadius: size * 0.28, boxShadow: "0 0 0 2px #b2c79c30" }}
    />
  );
}

export function Wordmark({ size, letters = 6 }: { size: number; letters?: number }) {
  const text = "crops.";
  return (
    <span style={{ fontFamily: FONT, fontSize: size, fontWeight: 560, letterSpacing: "-0.05em", color: "#f3f5e8" }}>
      {text.slice(0, Math.min(5, letters))}
      {letters >= 6 && <span style={{ color: "#b0c684" }}>.</span>}
    </span>
  );
}

export function LiveDot({ size = 14, color = "#769452" }: { size?: number; color?: string }) {
  const frame = useCurrentFrame();
  const ring = (Math.sin(frame / 9) + 1) / 2;
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 0 ${size * 0.5 * ring}px ${color}33`,
        flexShrink: 0,
      }}
    />
  );
}

export const glass: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  color: "#f3f5e8",
  background: "linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.05) 55%, rgba(255,255,255,0.1))",
  border: "2px solid rgba(255,255,255,0.22)",
  backdropFilter: "blur(28px) saturate(170%)",
  WebkitBackdropFilter: "blur(28px) saturate(170%)",
  boxShadow:
    "inset 0 2px 0 rgba(255,255,255,0.38), inset 0 -2px 0 rgba(255,255,255,0.08), 0 50px 100px rgba(9,26,17,0.35)",
};

export function GlassShine() {
  return (
    <div
      style={{
        position: "absolute",
        inset: "-40% 40% 45% -10%",
        background: "radial-gradient(closest-side, rgba(255,255,255,0.24), transparent)",
        pointerEvents: "none",
      }}
    />
  );
}

export const paper: CSSProperties = {
  background: COLORS.card,
  color: COLORS.ink,
  borderRadius: 36,
  boxShadow: "0 50px 100px rgba(9,26,17,0.32)",
  fontFamily: FONT,
};

const STATUS = {
  unbilled: { background: "#f5f1e4", color: "#856d2d", label: "Unbilled" },
  invoiced: { background: "#edf0f5", color: "#586e87", label: "Invoiced" },
  paid: { background: "#eaf2e5", color: "#517739", label: "Paid" },
};
export function Status({ status, scale = 1 }: { status: keyof typeof STATUS; scale?: number }) {
  const s = STATUS[status];
  return (
    <span
      style={{
        display: "inline-block",
        minWidth: 150,
        textAlign: "center",
        padding: "10px 18px",
        borderRadius: 12,
        fontSize: 26,
        fontWeight: 500,
        background: s.background,
        color: s.color,
        transform: `scale(${scale})`,
      }}
    >
      {s.label}
    </span>
  );
}

export function Chip({ children, active = false, style }: { children: ReactNode; active?: boolean; style?: CSSProperties }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 24px",
        borderRadius: 16,
        fontSize: 30,
        fontWeight: 480,
        background: active ? "#e3efc6" : "rgba(255,255,255,0.07)",
        color: active ? COLORS.forest : "#d5e2c2",
        border: `2px solid ${active ? "#e3efc6" : "rgba(178,199,156,0.22)"}`,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function clock(seconds: number, withSeconds = true) {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  return `${Math.floor(s / 3600)}:${mm}${withSeconds ? `:${String(s % 60).padStart(2, "0")}` : ""}`;
}

export const usd = (n: number, cents = false) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(n);
