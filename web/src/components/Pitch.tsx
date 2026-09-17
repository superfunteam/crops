import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  UserRound,
  Laptop,
  Smartphone,
  Sprout,
  Square,
} from "lucide-react";
import {
  HARVEST_SEAT_YEARLY,
  HARVEST_UNLIMITED_USAGE_YEARLY,
  STORY_SCENARIOS,
  harvestYearly,
} from "../harvestPricing";
import { money, time } from "../lib";

const SLIDES = ["Crops", "Features", "Pricing", "Agents"];
export const HARVEST_POST = "/blog/the-harvest-has-gone-bad/";
const AUTO_ADVANCE_MS = 9000;
const SHUFFLE_MS = 3200;
const reducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;
const whole = (n: number) => money(n).replace(/\.00$/, "");

function useTick(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function Pitch() {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [stopped, setStopped] = useState(reducedMotion);

  function goTo(index: number) {
    const el = track.current;
    if (!el) return;
    const next = (index + SLIDES.length) % SLIDES.length;
    el.scrollTo({
      left: next * el.clientWidth,
      behavior: reducedMotion() ? "auto" : "smooth",
    });
  }
  function interact(index: number) {
    setStopped(true);
    goTo(index);
  }

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () =>
      setActive(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (stopped || paused) return;
    const id = setTimeout(() => goTo(active + 1), AUTO_ADVANCE_MS);
    return () => clearTimeout(id);
  }, [active, paused, stopped]);

  return (
    <section
      className="pitch"
      aria-roledescription="carousel"
      aria-label="Why teams choose Crops"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") interact(active + 1);
        if (e.key === "ArrowLeft") interact(active - 1);
      }}
    >
      <div
        className="pitch-track"
        ref={track}
        onPointerDown={() => setStopped(true)}
        onWheel={(e) => Math.abs(e.deltaX) > 4 && setStopped(true)}
      >
        {[
          <HeroSlide key="hero" />,
          <FeatureSlide key="features" />,
          <PricingSlide key="pricing" />,
          <AgentSlide key="agents" />,
        ].map((slide, index) => (
          <div
            key={SLIDES[index]}
            className={`pitch-slide${active === index ? " is-active" : ""}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${SLIDES.length}: ${SLIDES[index]}`}
            aria-hidden={active !== index}
            inert={active !== index}
          >
            {slide}
          </div>
        ))}
      </div>
      <div className="pitch-controls">
        <button
          type="button"
          className="pitch-arrow"
          aria-label="Previous"
          onClick={() => interact(active - 1)}
        >
          <ArrowLeft size={15} />
        </button>
        <div className="pitch-dots">
          {SLIDES.map((label, index) => (
            <button
              type="button"
              key={label}
              aria-current={active === index}
              onClick={() => interact(index)}
            >
              <span className="pitch-dot">
                {active === index && !stopped && !paused && (
                  <span
                    className="pitch-dot-fill"
                    style={{ animationDuration: `${AUTO_ADVANCE_MS}ms` }}
                  />
                )}
              </span>
              <span className="pitch-dot-label">{label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="pitch-arrow"
          aria-label="Next"
          onClick={() => interact(active + 1)}
        >
          <ArrowRight size={15} />
        </button>
      </div>
    </section>
  );
}

function HeroSlide() {
  return (
    <div className="auth-message pitch-hero">
      <div className="eyebrow">Free open source alternative to Harvest</div>
      <h1>
        Free time tracking.
        <br />
        Room to grow.
      </h1>
      <p>
        Simple time tracking for your team, without the private equity 10x
        price.
      </p>
      <LiveTimer />
      <p className="pitch-link">
        Always free for every client, project and teammate.{" "}
        <a href={HARVEST_POST}>See what Harvest charges</a>
      </p>
    </div>
  );
}

function LiveTimer() {
  const [started] = useState(
    () => Date.now() - (1 * 3600 + 12 * 60 + 8) * 1000,
  );
  const now = useTick();
  return (
    <div className="pitch-timer">
      <div>
        <div className="pitch-eyebrow">
          <span className="live-dot" /> Northwind · Website refresh
        </div>
        <strong>Build the homepage hero</strong>
      </div>
      <span className="pitch-digits">{time((now - started) / 1000, true)}</span>
      <span className="pitch-stop" aria-hidden>
        <Square size={11} fill="currentColor" />
      </span>
    </div>
  );
}

function FeatureSlide() {
  return (
    <div className="pitch-panel">
      <div className="eyebrow">Everything included</div>
      <h2>Timers, teams, billing and native apps.</h2>
      <div className="pitch-bento">
        <Feature title="Timers">
          <SyncedTimer />
        </Feature>
        <Feature title="Teams">
          <TeamPulse />
        </Feature>
        <Feature title="Billing">
          <BillingStatus />
        </Feature>
        <Feature title="Native apps">
          <NativeApps />
        </Feature>
      </div>
    </div>
  );
}

function Feature({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pitch-feature">
      <div className="pitch-feature-demo">{children}</div>
      <h3>{title}</h3>
    </div>
  );
}

const DEVICES = ["Web", "Mac", "Android"];
function SyncedTimer() {
  const now = useTick();
  return (
    <>
      <span className="pitch-digits small">
        {time(((now / 1000) % 3600) + 2520, true)}
      </span>
      <span className="pitch-chip on">
        {DEVICES[Math.floor(now / 2400) % DEVICES.length]}
      </span>
    </>
  );
}

function TeamPulse() {
  return (
    <>
      <span className="pitch-avatars">
        {["AM", "JR", "SK"].map((initials) => (
          <span key={initials}>{initials}</span>
        ))}
      </span>
      <span className="pitch-chip">
        <span className="live-dot" /> 2 tracking
      </span>
    </>
  );
}

const STATUSES = ["unbilled", "invoiced", "paid"] as const;
function BillingStatus() {
  const status = STATUSES[Math.floor(useTick(2600) / 2600) % STATUSES.length];
  return (
    <>
      <strong className="pitch-amount">$4,200</strong>
      <span key={status} className={`status ${status} pitch-status`}>
        {status[0].toUpperCase() + status.slice(1)}
      </span>
    </>
  );
}

function NativeApps() {
  const now = useTick();
  return (
    <>
      <span className="pitch-menubar">
        <Laptop size={11} />
        <Sprout size={11} />
        {time(((now / 1000) % 3600) + 2592)}
      </span>
      <span className="pitch-chip">
        <Smartphone size={11} /> Stop
      </span>
    </>
  );
}

const [studio, , shop] = STORY_SCENARIOS;
const HARVEST_BILLS = [
  {
    team: "2-person team",
    detail: "21 projects · 17 clients",
    total: harvestYearly(studio).total,
  },
  {
    team: "20-person team",
    detail: "180 projects · 60 clients",
    total: harvestYearly(shop).total,
  },
  {
    team: "“Unlimited” plan",
    detail: "Same 2-person team",
    total:
      HARVEST_SEAT_YEARLY[studio.plan] * studio.seats +
      HARVEST_UNLIMITED_USAGE_YEARLY,
  },
];

function PricingSlide() {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    if (hovered || reducedMotion()) return;
    const id = setTimeout(
      () => setIndex((i) => (i + 1) % HARVEST_BILLS.length),
      SHUFFLE_MS,
    );
    return () => clearTimeout(id);
  }, [index, hovered]);
  const bill = HARVEST_BILLS[index];
  return (
    <div className="pitch-panel">
      <div className="eyebrow">Harvest vs Crops</div>
      <h2>Same timesheets. Very different bill.</h2>
      <div className="pitch-versus">
        <button
          type="button"
          className="pitch-price harvest"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={() => setIndex((i) => (i + 1) % HARVEST_BILLS.length)}
          aria-label={`Harvest, ${bill.team}: ${whole(bill.total)} a year. Show another team.`}
        >
          <span className="pitch-price-name">Harvest</span>
          <span key={index} className="pitch-price-body">
            <span className="pitch-price-team">{bill.team}</span>
            <strong>{whole(bill.total)}</strong>
            <span className="pitch-price-detail">{bill.detail}</span>
          </span>
          <span className="pitch-price-steps" aria-hidden>
            {HARVEST_BILLS.map((b, i) => (
              <span key={b.team} className={i === index ? "on" : ""} />
            ))}
          </span>
        </button>
        <div className="pitch-price crops">
          <span className="pitch-price-name">Crops</span>
          <span className="pitch-price-body">
            <span className="pitch-price-team">Any team size</span>
            <strong>$0</strong>
            <span className="pitch-price-detail">Unlimited everything</span>
          </span>
          <span className="pitch-price-steps" aria-hidden>
            <span className="on" />
          </span>
        </div>
      </div>
      <p className="pitch-fineprint">
        Per year. Harvest billed yearly before tax, at rates from its own
        billing simulator, September 2026.
      </p>
    </div>
  );
}

// Blended agent spend for the demo: roughly $13 per million tokens.
const TOKEN_COST_PER_MILLION = 13;
const HOURLY_RATE = 150;
const AGENT_WAYS = [
  "MCP server",
  "REST API",
  "Agent hooks",
  "Log after the fact",
  "Token expenses",
];

function AgentSlide() {
  const [started] = useState(() => Date.now());
  const elapsed = (useTick() - started) / 1000;
  const humanSeconds = 3 * 3600 + 20 * 60 + elapsed;
  const tokens = 2_412_000 + Math.floor(elapsed * 1850);
  const human = (humanSeconds / 3600) * HOURLY_RATE;
  const agent = (tokens / 1_000_000) * TOKEN_COST_PER_MILLION;
  return (
    <div className="pitch-panel">
      <div className="eyebrow">API and MCP for agents</div>
      <h2>Get your agent paid by the client, too.</h2>
      <div className="pitch-agent">
        <div className="pitch-agent-head">
          <span className="live-dot" />
          <span>Northwind · Website refresh</span>
          <code>mcp → start_timer</code>
        </div>
        <div className="pitch-agent-row">
          <span>
            <UserRound size={13} /> Your time
          </span>
          <span>{time(humanSeconds, true)}</span>
          <strong>{money(human)}</strong>
        </div>
        <div className="pitch-agent-row">
          <span>
            <Bot size={13} /> Agent tokens
          </span>
          <span>{(tokens / 1_000_000).toFixed(2)}M</span>
          <strong>{money(agent)}</strong>
        </div>
        <div className="pitch-agent-total">
          <span>Billable to client</span>
          <span className="status unbilled">Unbilled</span>
          <strong>{money(human + agent)}</strong>
        </div>
      </div>
      <div className="pitch-agent-ways">
        {AGENT_WAYS.map((label) => (
          <span key={label} className="pitch-chip">
            {label}
          </span>
        ))}
      </div>
      <p className="pitch-fineprint">
        Agents start and stop timers, log time after the fact, and attach the
        tokens and cost they report. It all lands on the client’s bill.
      </p>
    </div>
  );
}
