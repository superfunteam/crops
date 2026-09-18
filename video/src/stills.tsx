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
  priceSize = 204,
}: {
  name: string;
  price: string;
  note: string;
  tone: "harvest" | "crops";
  logo?: boolean;
  priceSize?: number;
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
          fontSize: priceSize,
          lineHeight: 0.95,
          whiteSpace: "nowrap",
          position: "relative",
          zIndex: 2,
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
        <PriceCard name="Harvest" price="$19k" priceSize={330} note={`${usd(HARVEST_UNLIMITED)} · 2-person team · billed yearly`} tone="harvest" />
        <Footnote style={{ left: 64, color: "rgba(255,255,255,0.82)" }}>
          Harvest “Unlimited” quote for 2 seats, before tax · Sept 2026
        </Footnote>
      </div>
      <Green style={{ flex: 1, display: "grid", placeItems: "center" }}>
        <div style={{ position: "relative" }}>
          <PriceCard name="Crops" price="$0" priceSize={330} note="Any team size · free forever" tone="crops" logo />
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
          zIndex: 5,
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

const RATE = 150;
const CARD_HEIGHT = 760;
const HUMAN_MINUTES = 45;
const AGENT_MINUTES = 27;
const AGENT_TOKENS = "184K";
const AGENT_COST = 0.48;

type Line = [string, string, string?];
const TERMINAL: Line[] = [
  ["> ", "fix rounding, log to Crops", "prompt"],
  ["● ", "Fixed money() · 4 tests pass"],
  ["● ", "Completed 7 tasks.", "done"],
  ["● ", "crops.log_time", "tool"],
  ["  ⎿ ", `0:${AGENT_MINUTES} · ${AGENT_TOKENS} tokens · $${AGENT_COST.toFixed(2)}`, "dim"],
  ["  ⎿ ", "Logged to Crops ✓", "logged"],
];

function Terminal() {
  const color: Record<string, string> = {
    prompt: "#f3f5e8",
    done: "#e3efc6",
    tool: COLORS.lime,
    dim: "#9aa894",
    logged: "#9fd67a",
  };
  return (
    <div
      style={{
        width: 900,
        height: CARD_HEIGHT,
        display: "flex",
        flexDirection: "column",
        borderRadius: 44,
        background: "#111814",
        border: "3px solid rgba(255,255,255,0.08)",
        boxShadow: "0 70px 140px rgba(6,18,12,0.55)",
        overflow: "hidden",
        fontFamily: MONO,
      }}
    >
      <div style={{ display: "flex", gap: 18, padding: "32px 38px", background: "#1a231e" }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <span key={c} style={{ width: 28, height: 28, borderRadius: "50%", background: c }} />
        ))}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 52px 10px", fontSize: 42, lineHeight: 1.7, whiteSpace: "pre" }}>
        {TERMINAL.map(([lead, text, kind], i) => (
          <div key={i} style={{ marginTop: i === 1 ? 24 : 0 }}>
            <span style={{ color: kind === "prompt" ? COLORS.lime : kind === "dim" || kind === "logged" ? "#5c6b5f" : "#9fd67a" }}>
              {lead}
            </span>
            <span style={{ color: color[kind ?? ""] ?? "#d5e2c2", fontWeight: kind === "done" || kind === "tool" ? 650 : 450 }}>
              {text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PersonIcon({ agent = false }: { agent?: boolean }) {
  return (
    <span
      style={{
        width: 84,
        height: 84,
        borderRadius: 24,
        flexShrink: 0,
        display: "grid",
        placeItems: "center",
        background: agent ? COLORS.ink : "#e6eadf",
        color: agent ? COLORS.lime : "#586c48",
      }}
    >
      <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {agent ? (
          <>
            <rect x="4" y="8" width="16" height="12" rx="3" />
            <path d="M12 8V4M9 13v1M15 13v1" />
          </>
        ) : (
          <>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
          </>
        )}
      </svg>
    </span>
  );
}

function EntryRow({ agent = false }: { agent?: boolean }) {
  const minutes = agent ? AGENT_MINUTES : HUMAN_MINUTES;
  const amount = (minutes / 60) * RATE + (agent ? AGENT_COST : 0);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 28, padding: "34px 44px" }}>
      <PersonIcon agent={agent} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 44, fontWeight: 650, letterSpacing: "-0.03em" }}>{agent ? "Agent" : "Human"}</div>
        <div style={{ marginTop: 10 }}>
          {agent ? (
            <Tag strong>{`${AGENT_TOKENS} tokens · $${AGENT_COST.toFixed(2)}`}</Tag>
          ) : (
            <Tag>Design review</Tag>
          )}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 68, fontWeight: 560, letterSpacing: "-0.04em", color: COLORS.forest, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
          {clock(minutes * 60, false)}
        </div>
        <div style={{ fontSize: 32, color: "#707b64", marginTop: 10, fontVariantNumeric: "tabular-nums" }}>{usd(amount, true)}</div>
      </div>
    </div>
  );
}

function CropsEntry() {
  const total = ((HUMAN_MINUTES + AGENT_MINUTES) / 60) * RATE + AGENT_COST;
  return (
    <div
      style={{
        width: 920,
        height: CARD_HEIGHT,
        display: "flex",
        flexDirection: "column",
        borderRadius: 52,
        background: "#fbfaf5",
        color: COLORS.ink,
        fontFamily: FONT,
        boxShadow: "0 60px 120px rgba(6,18,12,0.45)",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 22, padding: "36px 44px", borderBottom: "3px solid rgba(39,53,40,0.08)" }}>
        <span style={{ width: 12, height: 64, borderRadius: 6, background: "#d9643a" }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 30, color: "#707b64" }}>Northwind</div>
          <div style={{ fontSize: 50, fontWeight: 650, letterSpacing: "-0.03em" }}>Website refresh</div>
        </div>
        <span style={{ fontSize: 28, fontWeight: 600, padding: "10px 18px", borderRadius: 12, background: COLORS.ink, color: COLORS.lime, fontFamily: MONO }}>
          via MCP
        </span>
      </div>
      <EntryRow />
      <div style={{ height: 3, background: "rgba(39,53,40,0.08)", margin: "0 44px" }} />
      <EntryRow agent />
      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 22, padding: "36px 44px 40px", background: "#f1f0e7" }}>
        <span style={{ transform: "scale(1.3)", transformOrigin: "left center", marginRight: 50 }}>
          <Status status="unbilled" />
        </span>
        <span style={{ flex: 1, fontSize: 36, color: "#707b64" }}>Billable</span>
        <strong style={{ fontSize: 64, fontWeight: 650, letterSpacing: "-0.03em", color: COLORS.forest, fontVariantNumeric: "tabular-nums" }}>
          {usd(total, true)}
        </strong>
      </div>
    </div>
  );
}

function Tag({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 32,
        padding: "10px 20px",
        borderRadius: 14,
        background: strong ? "#e3eed6" : "#eef0e8",
        color: strong ? "#3d6a2c" : "#5f6b56",
        fontWeight: strong ? 650 : 500,
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
        <div style={{ fontSize: 40, color: COLORS.lime, fontWeight: 500 }}>Crops for agents · API + MCP</div>
        <div style={{ fontSize: 94, fontWeight: 560, letterSpacing: "-0.025em", wordSpacing: "0.06em", marginTop: 14, whiteSpace: "nowrap", lineHeight: 1.05 }}>
          Time is human. Time is agent. Time is money.
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 30 }}>
          <Terminal />
          <div
            style={{
              width: 130,
              height: 130,
              flexShrink: 0,
              borderRadius: "50%",
              background: COLORS.pale,
              display: "grid",
              placeItems: "center",
              boxShadow: "0 24px 50px rgba(6,18,12,0.35)",
            }}
          >
            <svg width="70" height="70" viewBox="0 0 24 24" fill="none" stroke={COLORS.forest} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </div>
          <CropsEntry />
        </div>
      </AbsoluteFill>
    </Green>
  );
}

export function ShareArmAndLegs() {
  const orange = { color: COLORS.harvest };
  return (
    <Green style={{ width: SHARE.width, height: SHARE.height, fontFamily: FONT }}>
      <AbsoluteFill style={{ padding: "90px 130px 250px", justifyContent: "center" }}>
        <div
          style={{
            fontSize: 200,
            fontWeight: 560,
            letterSpacing: "-0.03em",
            wordSpacing: "0.04em",
            lineHeight: 1.04,
            color: "#f3f5e8",
            maxWidth: 2140,
            textShadow: "0 8px 40px rgba(12,32,22,0.35)",
          }}
        >
          Private equity thinks time tracking should cost{" "}
          <span style={{ ...orange, whiteSpace: "nowrap" }}>an arm and both legs.</span>
        </div>
      </AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 130,
          bottom: 110,
          display: "flex",
          alignItems: "center",
          gap: 22,
          padding: "18px 34px 18px 18px",
          borderRadius: 999,
          background: "rgba(251,250,245,0.96)",
          boxShadow: "0 24px 60px rgba(6,18,12,0.35)",
        }}
      >
        <Img src={staticFile("crops.svg")} style={{ width: 76, height: 76, borderRadius: "50%" }} />
        <span style={{ fontSize: 50, fontWeight: 650, letterSpacing: "-0.04em", color: COLORS.ink }}>
          crops<span style={{ color: "#8aa65a" }}>.</span>
        </span>
        <span style={{ width: 2, height: 44, background: "rgba(39,53,40,0.15)" }} />
        <span style={{ fontSize: 36, fontWeight: 500, color: COLORS.forest }}>Free time tracking</span>
      </div>
    </Green>
  );
}
