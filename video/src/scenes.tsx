import { AbsoluteFill, Easing, interpolate } from "remotion";
import {
  HARVEST_SEAT_YEARLY,
  HARVEST_UNLIMITED_USAGE_YEARLY,
  STORY_SCENARIOS,
  harvestYearly,
} from "../../web/src/harvestPricing";
import { FONT } from "./fonts";
import { Rise, Scene, pop, useSince } from "./motion";
import { BEAT_FRAMES, COLORS, SCENES } from "./timeline";
import {
  Chip,
  Eyebrow,
  GlassShine,
  LiveDot,
  Logo,
  Status,
  Wordmark,
  clock,
  glass,
  headline,
  page,
  paper,
  usd,
} from "./ui";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Words land one at a time, each on its own beat. */
function Words({ words }: { words: [string, number][] }) {
  return (
    <>
      {words.map(([word, at], i) =>
        word === "\n" ? (
          <br key={i} />
        ) : (
          <Rise key={i} at={at} inline y={70} style={{ marginRight: "0.24em" }}>
            {word}
          </Rise>
        ),
      )}
    </>
  );
}

const ACCENT = { color: COLORS.harvest };
export function Intro() {
  const words: [string, number, boolean?][] = [
    ["Private", 0.5], ["equity", 1], ["thinks", 1.5], ["time", 2], ["\n", 0], ["tracking", 2.5],
    ["should", 3], ["cost", 3.25], ["you", 3.5], ["\n", 0],
    ["an", 3.75, true], ["arm", 4, true], ["and", 4.5, true], ["both", 5, true], ["legs.", 5.5, true],
  ];
  return (
    <Scene range={SCENES.intro}>
      <AbsoluteFill style={page}>
        <h1 style={{ ...headline, fontSize: 120, maxWidth: 1550 }}>
          {words.map(([word, at, accent], i) =>
            word === "\n" ? (
              <br key={i} />
            ) : (
              <Rise key={i} at={at} inline y={70} style={{ marginRight: "0.24em", ...(accent ? ACCENT : {}) }}>
                {word}
              </Rise>
            ),
          )}
        </h1>
      </AbsoluteFill>
    </Scene>
  );
}

export function Answer() {
  const [a] = SCENES.answer;
  return (
    <Scene range={SCENES.answer}>
      <AbsoluteFill style={page}>
        <h1 style={{ ...headline, fontSize: 132 }}>
          <Words words={[["Nah,", a], ["I", a + 0.5], ["can", a + 0.75], ["tend", a + 1], ["to", a + 1.25], ["\n", a], ["my", a + 1.5], ["own", a + 1.75]]} />
          <Rise at={a + 2} inline y={90} style={{ whiteSpace: "nowrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 28, verticalAlign: "middle" }}>
              <Logo size={120} />
              <span style={{ color: COLORS.pale }}>
                Crops<span style={{ color: "#b0c684" }}>.</span>
              </span>
            </span>
          </Rise>
        </h1>
      </AbsoluteFill>
    </Scene>
  );
}

export function Title() {
  const [a] = SCENES.title;
  return (
    <Scene range={SCENES.title}>
      <AbsoluteFill style={page}>
        <Rise at={a + 2.5} y={20}>
          <Eyebrow>Free open source alternative to Harvest</Eyebrow>
        </Rise>
        <h1 style={{ ...headline, fontSize: 164 }}>
          <Words words={[["Free", a], ["time", a + 1], ["tracking.", a + 2]]} />
          <br />
          <Words words={[["Room", a + 3], ["to", a + 3.5], ["grow.", a + 4]]} />
        </h1>
        <Rise at={a + 5} y={24}>
          <p style={{ fontSize: 44, lineHeight: 1.4, color: COLORS.sage, margin: "44px 0 0", maxWidth: 1300 }}>
            Simple time tracking for your team, without the private equity 10x price.
          </p>
        </Rise>
      </AbsoluteFill>
    </Scene>
  );
}

const DEVICES = ["Web", "macOS", "Android"];
export function Timer() {
  return (
    <Scene range={SCENES.timer}>
      <AbsoluteFill style={{ ...page, flexDirection: "row", alignItems: "center", gap: 110 }}>
        <div style={{ flex: 1 }}>
          <Rise at={16} y={20}>
            <Eyebrow>Timers</Eyebrow>
          </Rise>
          <h2 style={headline}>
            <Words words={[["One", 16], ["timer.", 16.5]]} />
            <br />
            <Words words={[["Everywhere.", 17]]} />
          </h2>
          <DeviceChips />
        </div>
        <Rise at={16.25} x={160} y={0}>
          <GlassTimer />
        </Rise>
      </AbsoluteFill>
    </Scene>
  );
}
function DeviceChips() {
  const since = useSince(18);
  const active = since < 0 ? -1 : Math.min(2, Math.floor(since / (BEAT_FRAMES / 2)));
  return (
    <div style={{ display: "flex", gap: 16, marginTop: 56 }}>
      {DEVICES.map((d, i) => (
        <Rise key={d} at={17.5 + i * 0.25} y={24}>
          <Chip active={active >= i}>{d}</Chip>
        </Rise>
      ))}
    </div>
  );
}
function GlassTimer() {
  const since = useSince(16);
  const syncs = [18, 18.5, 19].map((b) => useSince(b));
  const flash = Math.max(...syncs.map((s) => (s >= 0 ? Math.exp(-s / 8) : 0)));
  return (
    <div
      style={{
        ...glass,
        width: 780,
        borderRadius: 40,
        padding: "40px 40px 40px 48px",
        display: "flex",
        alignItems: "center",
        gap: 36,
        fontFamily: FONT,
        boxShadow: `${glass.boxShadow}, 0 0 0 ${10 * flash}px rgba(227,239,198,${0.25 * flash})`,
      }}
    >
      <GlassShine />
      <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26, color: "#c4d3b1" }}>
          <LiveDot color="#c9dba2" /> Northwind · Website refresh
        </div>
        <div style={{ fontSize: 36, fontWeight: 560, marginTop: 12 }}>Build the homepage hero</div>
        <div style={{ fontSize: 104, fontWeight: 430, letterSpacing: "-0.04em", marginTop: 18, fontVariantNumeric: "tabular-nums" }}>
          {clock(4328 + Math.max(0, since) / 60)}
        </div>
      </div>
      <div
        style={{
          position: "relative",
          width: 116,
          height: 116,
          borderRadius: 32,
          background: "rgba(255,255,255,0.92)",
          display: "grid",
          placeItems: "center",
          boxShadow: "0 12px 30px rgba(9,26,17,0.25)",
        }}
      >
        <div style={{ width: 34, height: 34, borderRadius: 6, background: COLORS.forest }} />
      </div>
    </div>
  );
}

function Feature({
  range,
  label,
  title,
  children,
}: {
  range: readonly [number, number];
  label: string;
  title: [string, number][];
  children: React.ReactNode;
}) {
  const at = range[0];
  return (
    <Scene range={range}>
      <AbsoluteFill style={{ ...page, flexDirection: "row", alignItems: "center", gap: 100 }}>
        <div style={{ flex: 1 }}>
          <Rise at={at} y={20}>
            <Eyebrow>{label}</Eyebrow>
          </Rise>
          <h2 style={{ ...headline, fontSize: 96 }}>
            <Words words={title} />
          </h2>
        </div>
        <Rise at={at + 0.5} x={140} y={0}>
          <div style={{ ...paper, width: 820, padding: 44 }}>{children}</div>
        </Rise>
      </AbsoluteFill>
    </Scene>
  );
}

const TEAM: [string, string, string, boolean, number][] = [
  ["AM", "Alex", "Brand refresh", true, 2530],
  ["JR", "Jordan", "Mobile app", true, 4175],
  ["SK", "Sam", "Idle", false, 0],
];
export function Teams() {
  const [a] = SCENES.teams;
  return (
    <Feature range={SCENES.teams} label="Teams" title={[["See", a], ["who's", a + 0.5], ["tracking,", a + 1], ["live.", a + 1.5]]}>
      <TeamRows />
    </Feature>
  );
}
function TeamRows() {
  const [a] = SCENES.teams;
  const since = useSince(a);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {TEAM.map(([initials, name, what, live, seconds], i) => (
        <Rise key={name} at={a + 1 + i * 0.5} x={50} y={0}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "76px 170px 1fr auto",
              alignItems: "center",
              gap: 22,
              padding: "18px 0",
              borderTop: i ? "2px solid rgba(39,53,40,0.08)" : undefined,
              fontSize: 34,
            }}
          >
            <span style={{ width: 76, height: 76, borderRadius: 22, background: "#e6eadf", color: "#586c48", display: "grid", placeItems: "center", fontSize: 26, fontWeight: 600 }}>
              {initials}
            </span>
            <strong style={{ fontWeight: 580 }}>{name}</strong>
            <span style={{ display: "flex", alignItems: "center", gap: 14, color: COLORS.muted }}>
              {live && <LiveDot />} {what}
            </span>
            <span style={{ color: live ? COLORS.forest : "#a3aa9c", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
              {live ? clock(seconds + Math.max(0, since) / 60) : "—"}
            </span>
          </div>
        </Rise>
      ))}
      <Rise at={a + 3} y={16}>
        <div style={{ marginTop: 18, display: "inline-flex", alignItems: "center", gap: 14, padding: "12px 20px", borderRadius: 14, background: "#e3eed6", color: "#3d6a2c", fontSize: 28, fontWeight: 500 }}>
          <LiveDot /> 2 tracking now
        </div>
      </Rise>
    </div>
  );
}

const INVOICES: [string, number, number][] = [
  ["Brand refresh", 4200, 0],
  ["Website", 2850, 0.5],
  ["App design", 1340, 1],
];
export function Billing() {
  const [a] = SCENES.billing;
  return (
    <Feature range={SCENES.billing} label="Billing" title={[["Rates", a], ["in.", a + 0.5], ["\n", a], ["Invoices", a + 1], ["out.", a + 1.5]]}>
      <BillingRows />
    </Feature>
  );
}
function BillingRows() {
  const [a] = SCENES.billing;
  const since = useSince(a);
  return (
    <div>
      {INVOICES.map(([name, amount, offset], i) => {
        const invoiced = (1 + offset) * BEAT_FRAMES;
        const paid = (2 + offset) * BEAT_FRAMES;
        const status = since >= paid ? "paid" : since >= invoiced ? "invoiced" : "unbilled";
        const flip = since >= paid ? since - paid : since >= invoiced ? since - invoiced : 99;
        return (
          <Rise key={name} at={a + 0.75 + i * 0.25} x={50} y={0}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto 170px",
                alignItems: "center",
                gap: 28,
                padding: "26px 0",
                borderTop: i ? "2px solid rgba(39,53,40,0.08)" : undefined,
                fontSize: 36,
              }}
            >
              <span>{name}</span>
              <strong style={{ fontWeight: 580, fontVariantNumeric: "tabular-nums" }}>{usd(amount)}</strong>
              <span style={{ justifySelf: "end" }}>
                <Status status={status} scale={0.85 + 0.15 * pop(flip)} />
              </span>
            </div>
          </Rise>
        );
      })}
      <Rise at={a + 2.5} y={16}>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 24, borderTop: "2px solid rgba(39,53,40,0.14)", fontSize: 30, color: COLORS.muted }}>
          <span>Northwind · $150/hr · 120h budget</span>
          <strong style={{ color: COLORS.forest, fontWeight: 580 }}>{usd(8390)}</strong>
        </div>
      </Rise>
    </div>
  );
}

export function Apps() {
  const [a] = SCENES.apps;
  return (
    <Scene range={SCENES.apps}>
      <AbsoluteFill style={{ ...page, flexDirection: "row", alignItems: "center", gap: 100 }}>
        <div style={{ flex: 1 }}>
          <Rise at={a} y={20}>
            <Eyebrow>Native apps</Eyebrow>
          </Rise>
          <h2 style={{ ...headline, fontSize: 96 }}>
            <Words words={[["Native", a], ["on", a + 0.5], ["Mac", a + 1]]} />
            <br />
            <Words words={[["and", a + 1.5], ["Android.", a + 2]]} />
          </h2>
        </div>
        <div style={{ width: 820, display: "flex", flexDirection: "column", gap: 40 }}>
          <Rise at={a + 0.5} x={140} y={0}>
            <MenuBar />
          </Rise>
          <Rise at={a + 2} x={140} y={0}>
            <Notification />
          </Rise>
        </div>
      </AbsoluteFill>
    </Scene>
  );
}
function Sprout({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M32 49V30M32 37C16 39 13 28 14 20c12-1 19 7 18 17ZM32 29c0-12 8-17 19-16 1 12-6 18-19 16Z" />
    </svg>
  );
}
function MenuBar() {
  const since = Math.max(0, useSince(SCENES.apps[0]));
  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ display: "flex", alignItems: "center", gap: 26, padding: "16px 28px", borderRadius: 20, background: "rgba(22,30,25,0.85)", color: "#e8efda", fontSize: 28, boxShadow: "0 30px 60px rgba(9,26,17,0.3)" }}>
        <span style={{ fontWeight: 650 }}>Crops</span>
        <span style={{ opacity: 0.6 }}>File</span>
        <span style={{ opacity: 0.6 }}>Edit</span>
        <span style={{ flex: 1 }} />
        <span style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 14px", borderRadius: 10, background: "rgba(255,255,255,0.14)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          <Sprout size={30} color="#c9dba2" />
          {clock(2592 + since / 60, false)}
        </span>
      </div>
      <div style={{ ...paper, marginTop: 16, marginLeft: "auto", width: 520, padding: "26px 30px", borderRadius: 26 }}>
        <div style={{ fontSize: 24, color: COLORS.muted, display: "flex", alignItems: "center", gap: 12 }}>
          <LiveDot /> Northwind
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 8 }}>
          <strong style={{ fontSize: 32, fontWeight: 580 }}>Website refresh</strong>
          <span style={{ fontSize: 44, color: COLORS.forest, fontVariantNumeric: "tabular-nums" }}>{clock(2592 + since / 60)}</span>
        </div>
      </div>
    </div>
  );
}
function Notification() {
  const since = Math.max(0, useSince(SCENES.apps[0]));
  return (
    <div style={{ ...paper, display: "flex", alignItems: "center", gap: 24, padding: "26px 30px", borderRadius: 30, width: 700 }}>
      <div style={{ width: 70, height: 70, borderRadius: 20, background: COLORS.green, display: "grid", placeItems: "center" }}>
        <Sprout size={44} color="#e5ecc1" />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 30, fontWeight: 580 }}>Crops · Tracking</div>
        <div style={{ fontSize: 26, color: COLORS.muted, fontVariantNumeric: "tabular-nums" }}>Mobile app · {clock(4218 + since / 60)}</div>
      </div>
      <span style={{ fontSize: 26, fontWeight: 650, color: COLORS.forest, letterSpacing: "0.06em" }}>STOP</span>
    </div>
  );
}

const HOURS = [6.5, 7.25, 5.5, 8, 5.25];
export function Reports() {
  const [a] = SCENES.reports;
  return (
    <Feature range={SCENES.reports} label="Reports" title={[["Every", a], ["minute,", a + 0.5], ["accounted", a + 1], ["for.", a + 1.5]]}>
      <WeekChart />
    </Feature>
  );
}
function WeekChart() {
  const [a] = SCENES.reports;
  const since = useSince(a + 0.75);
  const total = interpolate(since, [0, BEAT_FRAMES * 2], [0, 32.5], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ display: "flex", gap: 44, alignItems: "flex-end", height: 330 }}>
      <div style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", gap: 18 }}>
        {HOURS.map((h, i) => {
          const grow = pop(since - i * BEAT_FRAMES * 0.25);
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, height: "100%", justifyContent: "flex-end" }}>
              <div style={{ width: "100%", height: `${(h / 8) * 82 * grow}%`, borderRadius: 14, background: i === 3 ? COLORS.forest : "#b9cf98" }} />
              <span style={{ fontSize: 24, color: "#8b9481" }}>{"MTWTF"[i]}</span>
            </div>
          );
        })}
      </div>
      <div style={{ paddingBottom: 44 }}>
        <div style={{ fontSize: 88, fontWeight: 480, letterSpacing: "-0.04em", color: COLORS.forest, fontVariantNumeric: "tabular-nums" }}>
          {total.toFixed(1)}h
        </div>
        <div style={{ fontSize: 28, color: COLORS.muted }}>this week · 88% billable</div>
        <Rise at={a + 3} y={14}>
          <span style={{ display: "inline-block", marginTop: 20, padding: "8px 16px", border: "2px solid rgba(39,53,40,0.14)", borderRadius: 12, fontSize: 26, color: COLORS.muted }}>
            Export CSV
          </span>
        </Rise>
      </div>
    </div>
  );
}

const [studio, , shop] = STORY_SCENARIOS;
const HARVEST = [
  { at: 40, team: "2-person team", detail: "21 projects · 17 clients", total: harvestYearly(studio).total },
  { at: 42, team: "20-person team", detail: "180 projects · 60 clients", total: harvestYearly(shop).total },
  {
    at: 44,
    team: "“Unlimited” plan",
    detail: "Same 2-person team",
    total: HARVEST_SEAT_YEARLY[studio.plan] * studio.seats + HARVEST_UNLIMITED_USAGE_YEARLY,
  },
];
export function Harvest() {
  const [a] = SCENES.harvest;
  return (
    <Scene range={SCENES.harvest}>
      <AbsoluteFill style={{ ...page, justifyContent: "center" }}>
        <Rise at={a} y={20}>
          <Eyebrow>Harvest vs Crops · per year</Eyebrow>
        </Rise>
        <h2 style={{ ...headline, fontSize: 96 }}>
          <Words words={[["Harvest", a], ["bills", a + 1], ["you", a + 1.5], ["for", a + 2], ["growing.", a + 2.5]]} />
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, marginTop: 70 }}>
          <Rise at={a + 4} x={-120} y={0}>
            <HarvestCard />
          </Rise>
          <Rise at={a + 4.5} x={120} y={0}>
            <CropsCard />
          </Rise>
        </div>
      </AbsoluteFill>
    </Scene>
  );
}
function HarvestCard() {
  const sinces = HARVEST.map((h) => useSince(h.at));
  const stage = Math.max(0, sinces.filter((s) => s >= 0).length - 1);
  const current = HARVEST[stage];
  const prev = HARVEST[Math.max(0, stage - 1)];
  const since = sinces[stage];
  const roll = stage ? interpolate(since, [0, 16], [prev.total, current.total], { ...clamp, easing: Easing.out(Easing.cubic) }) : current.total;
  const swap = pop(since);
  return (
    <div style={{ ...paper, height: 400, padding: "40px 48px", display: "flex", flexDirection: "column" }}>
      <span style={{ fontSize: 30, fontWeight: 650 }}>Harvest</span>
      <div style={{ marginTop: "auto", opacity: interpolate(since, [0, 6], [0.2, 1], clamp), transform: `translateY(${18 * (1 - swap)}px)` }}>
        <div style={{ fontSize: 32, color: COLORS.muted }}>{current.team}</div>
        <div style={{ fontSize: 150, lineHeight: 1.05, fontWeight: 520, letterSpacing: "-0.05em", color: COLORS.harvest, fontVariantNumeric: "tabular-nums" }}>
          {usd(roll)}
        </div>
        <div style={{ fontSize: 30, color: "#8b9481" }}>{current.detail}</div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 30 }}>
        {HARVEST.map((h, i) => (
          <span key={h.at} style={{ width: 44, height: 7, borderRadius: 4, background: i === stage ? COLORS.harvest : "rgba(39,53,40,0.12)" }} />
        ))}
      </div>
    </div>
  );
}
function CropsCard() {
  const punches = [42, 44, 46].map((b) => useSince(b));
  const punch = Math.max(...punches.map((s) => (s >= 0 ? Math.exp(-s / 7) : 0)));
  const stamp = pop(useSince(46));
  return (
    <div style={{ ...glass, fontFamily: FONT, borderRadius: 36, height: 400, padding: "40px 48px", display: "flex", flexDirection: "column" }}>
      <GlassShine />
      <span style={{ position: "relative", fontSize: 30, fontWeight: 650 }}>Crops</span>
      <div style={{ position: "relative", marginTop: "auto" }}>
        <div style={{ fontSize: 32, color: COLORS.sage }}>Any team size</div>
        <div style={{ fontSize: 150, lineHeight: 1.05, fontWeight: 520, letterSpacing: "-0.05em", color: COLORS.pale, transform: `scale(${1 + 0.08 * punch})`, transformOrigin: "left center" }}>
          $0
        </div>
        <div style={{ fontSize: 30, color: "#93a888" }}>Unlimited everything</div>
      </div>
      <div
        style={{
          position: "absolute",
          right: 44,
          top: 40,
          padding: "12px 22px",
          borderRadius: 14,
          background: COLORS.pale,
          color: COLORS.forest,
          fontSize: 30,
          fontWeight: 600,
          opacity: stamp,
          transform: `rotate(${-6 + 6 * (1 - stamp)}deg) scale(${1.6 - 0.6 * stamp})`,
        }}
      >
        Always free
      </div>
    </div>
  );
}

export function Free() {
  const [a] = SCENES.free;
  return (
    <Scene range={SCENES.free}>
      <AbsoluteFill style={{ ...page, alignItems: "center", textAlign: "center" }}>
        <Rise at={a} soft y={30}>
          <div style={{ fontSize: 380, fontWeight: 460, letterSpacing: "-0.06em", lineHeight: 1, color: COLORS.pale }}>$0</div>
        </Rise>
        <Rise at={a + 2} soft y={20}>
          <div style={{ fontSize: 52, color: COLORS.sage, marginTop: 20 }}>Unlimited people, clients and projects.</div>
        </Rise>
      </AbsoluteFill>
    </Scene>
  );
}

const CHIPS: [string, number][] = [
  ["MCP server", 56],
  ["REST API", 56.5],
  ["Agent hooks", 57],
  ["Token expenses", 57.5],
];
export function Agents() {
  const [a] = SCENES.agents;
  return (
    <Scene range={SCENES.agents}>
      <AbsoluteFill style={{ ...page, flexDirection: "row", alignItems: "center", gap: 90 }}>
        <div style={{ flex: 1 }}>
          <Rise at={a} y={20}>
            <Eyebrow>API and MCP for agents</Eyebrow>
          </Rise>
          <h2 style={{ ...headline, fontSize: 92 }}>
            <Words words={[["Get", a], ["your", a + 0.5], ["agent", a + 1]]} />
            <br />
            <Words words={[["paid", a + 2], ["by", a + 2.5], ["the", a + 3]]} />
            <br />
            <Words words={[["client,", a + 3.5], ["too.", a + 4]]} />
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 50, maxWidth: 760 }}>
            {CHIPS.map(([label, at]) => (
              <Rise key={label} at={at} y={24}>
                <Chip>{label}</Chip>
              </Rise>
            ))}
          </div>
        </div>
        <Rise at={a + 1} x={150} y={0}>
          <AgentBill />
        </Rise>
      </AbsoluteFill>
    </Scene>
  );
}
function AgentBill() {
  const [a] = SCENES.agents;
  const since = Math.max(0, useSince(a + 1));
  const humanSeconds = 3 * 3600 + 20 * 60 + since * 9;
  const tokens = 2_412_000 + since * 2600;
  const human = (humanSeconds / 3600) * 150;
  const agent = (tokens / 1_000_000) * 13;
  const invoiced = useSince(62) >= 0;
  const flip = pop(useSince(62));
  const row = (label: string, meta: string, amount: number, i: number) => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 190px 210px", alignItems: "center", gap: 20, padding: "24px 0", borderTop: i ? "2px solid rgba(39,53,40,0.08)" : undefined, fontSize: 34 }}>
      <span style={{ color: "#586c48" }}>{label}</span>
      <span style={{ textAlign: "right", color: COLORS.muted, fontVariantNumeric: "tabular-nums" }}>{meta}</span>
      <strong style={{ textAlign: "right", fontWeight: 580, fontVariantNumeric: "tabular-nums" }}>{usd(amount, true)}</strong>
    </div>
  );
  return (
    <div style={{ ...paper, width: 860, padding: "20px 44px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "24px 0", borderBottom: "2px dashed rgba(39,53,40,0.2)", fontSize: 30, fontWeight: 580 }}>
        <LiveDot />
        <span style={{ flex: 1 }}>Northwind · Website refresh</span>
        <code style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 22, padding: "8px 12px", borderRadius: 10, background: COLORS.ink, color: COLORS.lime }}>
          mcp → start_timer
        </code>
      </div>
      <Rise at={a + 1.5} x={40} y={0}>{row("Your time", clock(humanSeconds), human, 0)}</Rise>
      <Rise at={a + 2} x={40} y={0}>{row("Agent tokens", `${(tokens / 1e6).toFixed(2)}M`, agent, 1)}</Rise>
      <Rise at={a + 3} y={16}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 230px", alignItems: "center", gap: 20, paddingTop: 28, borderTop: "2px solid rgba(39,53,40,0.16)", fontSize: 34, fontWeight: 580 }}>
          <span>Billable to client</span>
          <Status status={invoiced ? "invoiced" : "unbilled"} scale={invoiced ? 0.85 + 0.15 * flip : 1} />
          <strong style={{ textAlign: "right", fontSize: 50, color: COLORS.forest, fontVariantNumeric: "tabular-nums" }}>{usd(human + agent, true)}</strong>
        </div>
      </Rise>
    </div>
  );
}

export function Outro() {
  const [a] = SCENES.outro;
  return (
    <Scene range={SCENES.outro} exit={false}>
      <AbsoluteFill style={{ ...page, alignItems: "center", textAlign: "center" }}>
        <Rise at={a} y={40}>
          <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
            <Logo size={150} />
            <Wordmark size={150} />
          </div>
        </Rise>
        <Rise at={a + 2} y={24}>
          <div style={{ ...headline, fontSize: 80, marginTop: 50 }}>Free time tracking. Room to grow.</div>
        </Rise>
        <Rise at={a + 4} y={20}>
          <div style={{ marginTop: 56, display: "inline-block", padding: "20px 40px", borderRadius: 999, background: COLORS.pale, color: COLORS.forest, fontSize: 44, fontWeight: 600 }}>
            crops.wims.vc
          </div>
        </Rise>
        <Rise at={a + 5} y={16}>
          <div style={{ marginTop: 34, fontSize: 34, color: COLORS.sage }}>Web · macOS · Android · API · MCP</div>
        </Rise>
      </AbsoluteFill>
    </Scene>
  );
}
