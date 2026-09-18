import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import {
  HARVEST_SEAT_YEARLY,
  HARVEST_UNLIMITED_USAGE_YEARLY,
  STORY_SCENARIOS,
} from "../../web/src/harvestPricing";
import { FONT, MONO } from "./fonts";
import { COLORS } from "./timeline";
import { Status, clock, usd } from "./ui";

// Social share images: 2400×1350 (16:9, twice X/Twitter's 1200×675 card).
export const SHARE = { width: 2400, height: 1350 };

const studio = STORY_SCENARIOS[0];
const HARVEST_UNLIMITED =
  HARVEST_SEAT_YEARLY[studio.plan] * studio.seats + HARVEST_UNLIMITED_USAGE_YEARLY;

function Pattern({ opacity = 0.9 }: { opacity?: number }) {
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `url(${staticFile("security-pattern.svg")})`,
        backgroundSize: "840px 420px",
        opacity,
      }}
    />
  );
}

function Green({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ position: "relative", overflow: "hidden", background: COLORS.green, ...style }}>
      <AbsoluteFill style={{ background: "radial-gradient(1400px 900px at 35% 40%, #34604a, transparent 70%)" }} />
      <Pattern />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(12,32,22,0.5) 100%)" }} />
      {children}
    </div>
  );
}

function Pill({ children, tone }: { children: ReactNode; tone: "harvest" | "crops" }) {
  return (
    <span
      style={{
        padding: "12px 26px",
        borderRadius: 999,
        fontSize: 34,
        fontWeight: 600,
        background: tone === "harvest" ? "#ffe7d6" : "#e3eed6",
        color: tone === "harvest" ? "#c2410c" : "#3d6a2c",
      }}
    >
      {children}
    </span>
  );
}

function PriceCard({
  name,
  price,
  note,
  tone,
  logo = false,
}: {
  name: string;
  price: string;
  note: string;
  tone: "harvest" | "crops";
  logo?: boolean;
}) {
  const accent = tone === "harvest" ? COLORS.harvest : COLORS.forest;
  return (
    <div
      style={{
        width: 900,
        padding: "64px 72px 70px",
        borderRadius: 56,
        background: "#fffdf8",
        color: COLORS.ink,
        fontFamily: FONT,
        boxShadow: "0 60px 120px rgba(20,24,18,0.28)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        {logo && <Img src={staticFile("crops.svg")} style={{ width: 64, height: 64, borderRadius: 18 }} />}
        <span style={{ fontSize: 54, fontWeight: 700, letterSpacing: "-0.03em" }}>{name}</span>
        <span style={{ flex: 1 }} />
        <Pill tone={tone}>Unlimited</Pill>
      </div>
      <div
        style={{
          marginTop: 70,
          fontSize: 204,
          lineHeight: 0.95,
          fontWeight: 600,
          letterSpacing: "-0.06em",
          color: accent,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {price}
      </div>
      <div style={{ marginTop: 18, fontSize: 56, fontWeight: 500, color: "#6b7466", letterSpacing: "-0.02em" }}>per year</div>
      <div style={{ marginTop: 56, paddingTop: 36, borderTop: "3px solid rgba(39,53,40,0.1)", fontSize: 38, color: "#7b8179" }}>
        {note}
      </div>
    </div>
  );
}

export function SharePrice() {
  return (
    <AbsoluteFill style={{ flexDirection: "row", fontFamily: FONT }}>
      <div
        style={{
          flex: 1,
          display: "grid",
          placeItems: "center",
          background: `radial-gradient(1200px 900px at 40% 40%, #ff7a2e, ${COLORS.harvest} 70%)`,
          position: "relative",
        }}
      >
        <PriceCard name="Harvest" price={usd(HARVEST_UNLIMITED)} note="2-person team · billed yearly" tone="harvest" />
        <Footnote style={{ left: 64, color: "rgba(255,255,255,0.82)" }}>
          Harvest “Unlimited” quote for 2 seats, before tax · Sept 2026
        </Footnote>
      </div>
      <Green style={{ flex: 1, display: "grid", placeItems: "center" }}>
        <div style={{ position: "relative" }}>
          <PriceCard name="Crops" price="$0" note="Any team size · free forever" tone="crops" logo />
        </div>
        <Footnote style={{ right: 64, color: "#c9dba2", fontWeight: 600 }}>crops.wims.vc</Footnote>
      </Green>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 170,
          height: 170,
          borderRadius: "50%",
          background: "#fffdf8",
          border: "10px solid #1d402e",
          display: "grid",
          placeItems: "center",
          fontSize: 64,
          fontWeight: 700,
          letterSpacing: "-0.04em",
          color: COLORS.ink,
          boxShadow: "0 30px 60px rgba(20,24,18,0.3)",
        }}
      >
        vs
      </div>
    </AbsoluteFill>
  );
}

function Footnote({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ position: "absolute", bottom: 52, fontSize: 30, fontFamily: FONT, ...style }}>{children}</div>
  );
}

const COST = 31.4;
const MINUTES = 72;
const RATE = 150;

type Line = [string, string?, string?];
const TERMINAL: Line[] = [
  ["> ", "fix invoice rounding, add tests, log it to Crops", "prompt"],
  [""],
  ["● ", "Read web/src/lib.ts"],
  ["● ", "Update money() to round half-even"],
  ["● ", "Add 4 rounding tests"],
  ["● ", "Run npm test", "ok"],
  ["  ⎿ ", "68 passed · 0 failed", "dim"],
  ["● ", "Completed 7 tasks.", "done"],
  [""],
  ["● ", "crops.log_time", "tool"],
  ["  ⎿ ", "project  Northwind · Website refresh", "dim"],
  ["  ⎿ ", "time     1:12 · tokens 2.41M · cost $31.40", "dim"],
  ["  ⎿ ", "Logged to Crops ✓", "logged"],
];

function Terminal() {
  const color = (kind?: string) =>
    ({
      prompt: "#f3f5e8",
      ok: "#e8efda",
      dim: "#8d9a88",
      done: "#e3efc6",
      tool: COLORS.lime,
      logged: "#9fd67a",
    })[kind ?? ""] ?? "#d5e2c2";
  return (
    <div
      style={{
        width: 1240,
        borderRadius: 40,
        background: "#111814",
        border: "3px solid rgba(255,255,255,0.08)",
        boxShadow: "0 70px 140px rgba(6,18,12,0.55)",
        overflow: "hidden",
        fontFamily: MONO,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "28px 34px", background: "#1a231e" }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <span key={c} style={{ width: 24, height: 24, borderRadius: "50%", background: c }} />
        ))}
        <span style={{ flex: 1, textAlign: "center", marginRight: 108, fontSize: 28, color: "#8d9a88" }}>
          agent — ~/northwind-site
        </span>
      </div>
      <div style={{ padding: "40px 50px 50px", fontSize: 33, lineHeight: 1.6, whiteSpace: "pre" }}>
        {TERMINAL.map(([lead, text = "", kind], i) => (
          <div key={i} style={{ minHeight: "1.6em" }}>
            <span
              style={{
                color: kind === "prompt" ? COLORS.lime : kind === "tool" || kind === "done" || kind === "ok" ? "#9fd67a" : "#5c6b5f",
              }}
            >
              {lead}
            </span>
            <span style={{ color: color(kind), fontWeight: kind === "done" || kind === "tool" ? 600 : 400 }}>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CropsEntry() {
  const hours = MINUTES / 60;
  return (
    <div
      style={{
        width: 700,
        borderRadius: 44,
        background: "#fbfaf5",
        color: COLORS.ink,
        fontFamily: FONT,
        boxShadow: "0 60px 120px rgba(6,18,12,0.45)",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "30px 40px", borderBottom: "2px solid rgba(39,53,40,0.08)" }}>
        <Img src={staticFile("crops.svg")} style={{ width: 52, height: 52, borderRadius: 15 }} />
        <span style={{ fontSize: 34, fontWeight: 650, letterSpacing: "-0.02em" }}>Today</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 24, fontWeight: 600, padding: "8px 16px", borderRadius: 10, background: COLORS.ink, color: COLORS.lime, fontFamily: MONO }}>
          via MCP
        </span>
      </div>
      <div style={{ display: "flex", gap: 26, padding: "40px 40px 34px" }}>
        <span style={{ width: 8, borderRadius: 4, background: "#d9643a" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 28, color: "#707b64" }}>Northwind</div>
          <div style={{ fontSize: 44, fontWeight: 650, letterSpacing: "-0.03em", marginTop: 4 }}>Website refresh</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 22 }}>
            <Tag>Invoice rounding fix</Tag>
            <Tag strong>2.41M tokens · $31.40</Tag>
          </div>
        </div>
        <div style={{ fontSize: 76, fontWeight: 520, letterSpacing: "-0.04em", color: COLORS.forest, fontVariantNumeric: "tabular-nums" }}>
          {clock(MINUTES * 60, false)}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          padding: "30px 40px 36px",
          background: "#f3f2ea",
          fontSize: 30,
        }}
      >
        <Status status="unbilled" />
        <span style={{ flex: 1, color: "#707b64" }}>Billable to client</span>
        <strong style={{ fontSize: 46, fontWeight: 650, color: COLORS.forest, fontVariantNumeric: "tabular-nums" }}>
          {usd(hours * RATE + COST, true)}
        </strong>
      </div>
    </div>
  );
}

function Tag({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return (
    <span
      style={{
        fontSize: 27,
        padding: "9px 16px",
        borderRadius: 11,
        background: strong ? "#e3eed6" : "#eef0e8",
        color: strong ? "#3d6a2c" : "#5f6b56",
        fontWeight: strong ? 600 : 450,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function ShareAgents() {
  return (
    <Green style={{ width: SHARE.width, height: SHARE.height, fontFamily: FONT }}>
      <AbsoluteFill style={{ padding: "90px 110px", color: "#f3f5e8" }}>
        <div style={{ fontSize: 38, color: COLORS.lime, fontWeight: 500 }}>Crops for agents · API + MCP</div>
        <div style={{ fontSize: 92, fontWeight: 500, letterSpacing: "-0.03em", marginTop: 14, lineHeight: 1.05 }}>
          Your agent’s tokens, on the client’s bill.
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 50, marginTop: 30 }}>
          <Terminal />
          <div
            style={{
              width: 118,
              height: 118,
              flexShrink: 0,
              borderRadius: "50%",
              background: COLORS.pale,
              display: "grid",
              placeItems: "center",
              boxShadow: "0 24px 50px rgba(6,18,12,0.35)",
            }}
          >
            <svg width="62" height="62" viewBox="0 0 24 24" fill="none" stroke={COLORS.forest} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </div>
          <CropsEntry />
        </div>
      </AbsoluteFill>
    </Green>
  );
}
