import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileDown,
  Laptop,
  Pause,
  Smartphone,
  Sprout,
  Square,
} from "lucide-react";
import {
  HARVEST_SEAT_YEARLY,
  HARVEST_UNLIMITED_USAGE_YEARLY,
  LANDER_SCENARIOS,
  RESOURCE_LABELS,
  harvestYearly,
} from "../harvestPricing";
import { money, time } from "../lib";

const SLIDES = ["Crops", "Features", "Pricing", "Then & now"];
const AUTO_ADVANCE_MS = 9000;
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

function useCountUp(target: number, run: boolean) {
  const [value, setValue] = useState(run ? 0 : target);
  const from = useRef(0);
  useEffect(() => {
    if (!run) return;
    if (reducedMotion()) {
      setValue(target);
      from.current = target;
      return;
    }
    const start = performance.now(),
      origin = from.current;
    let frame = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 900),
        eased = 1 - Math.pow(1 - p, 3),
        next = Math.round(origin + (target - origin) * eased);
      setValue(next);
      from.current = next;
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, run]);
  return value;
}

export function Pitch() {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [seen, setSeen] = useState(() => new Set([0]));
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
    const onScroll = () => {
      const index = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
      setActive(index);
      setSeen((s) => (s.has(index) ? s : new Set(s).add(index)));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Stacked below the form on phones, the track follows the visible slide's height.
  useEffect(() => {
    const el = track.current,
      slide = el?.children[active] as HTMLElement | undefined;
    if (!el || !slide || typeof ResizeObserver === "undefined") return;
    const narrow = matchMedia("(max-width: 640px)");
    const fit = () => {
      el.style.height = narrow.matches ? `${slide.scrollHeight}px` : "";
    };
    const observer = new ResizeObserver(fit);
    observer.observe(slide);
    narrow.addEventListener("change", fit);
    fit();
    return () => {
      observer.disconnect();
      narrow.removeEventListener("change", fit);
    };
  }, [active]);

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
          <HeroSlide key="hero" onPricing={() => interact(2)} />,
          <FeatureSlide key="features" />,
          <PricingSlide key="pricing" live={seen.has(2)} />,
          <HistorySlide key="history" live={seen.has(3)} />,
        ].map((slide, index) => (
          <div
            key={SLIDES[index]}
            className={`pitch-slide${active === index ? " is-active" : ""}${seen.has(index) ? " is-seen" : ""}`}
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

function HeroSlide({ onPricing }: { onPricing: () => void }) {
  return (
    <div className="auth-message pitch-hero">
      <div className="eyebrow">A little focus goes a long way.</div>
      <h1>
        Good work.
        <br />
        Room to grow.
      </h1>
      <p>
        Simple time tracking for your team.
        <br />
        Every project. Every minute. Together.
      </p>
      <LiveTimer />
      <button type="button" className="pitch-link" onClick={onPricing}>
        Free for every client, project and teammate. See what Harvest charges
        <ArrowRight size={14} />
      </button>
    </div>
  );
}

function LiveTimer() {
  const [started] = useState(
    () => Date.now() - (1 * 3600 + 12 * 60 + 8) * 1000,
  );
  const now = useTick();
  return (
    <div className="pitch-card pitch-timer">
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
      <div className="eyebrow">Everything you need. Nothing metered.</div>
      <h2>Timers, teams, billing and native apps. All included.</h2>
      <div className="pitch-bento">
        <Feature title="Timers" note="Start on the web, stop on your phone.">
          <SyncedTimer />
        </Feature>
        <Feature title="Teams" note="See who's tracking right now.">
          <TeamPulse />
        </Feature>
        <Feature title="Billing" note="Rates, unbilled, invoiced and paid.">
          <BillingRows />
        </Feature>
        <Feature
          title="Native apps"
          note="A menu-bar clock and a live notification."
        >
          <NativeApps />
        </Feature>
        <Feature title="Reports" note="Filter anything. Export to CSV." wide>
          <WeekBars />
        </Feature>
      </div>
    </div>
  );
}

function Feature({
  title,
  note,
  children,
  wide = false,
}: {
  title: string;
  note: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`pitch-card pitch-feature${wide ? " wide" : ""}`}>
      <div className="pitch-feature-demo">{children}</div>
      <div>
        <h3>{title}</h3>
        <p>{note}</p>
      </div>
    </div>
  );
}

function SyncedTimer() {
  const now = useTick();
  const device = Math.floor(now / 2400) % 3;
  return (
    <div className="pitch-sync">
      <span className="pitch-digits small">
        {time(((now / 1000) % 3600) + 2520, true)}
      </span>
      <div className="pitch-devices">
        {["Web", "Mac", "Android"].map((name, index) => (
          <span key={name} className={index === device ? "on" : ""}>
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

function TeamPulse() {
  return (
    <div className="pitch-team">
      {[
        ["AM", "Alex", "Brand refresh", true],
        ["JR", "Jordan", "Mobile app", true],
        ["SK", "Sam", "Idle", false],
      ].map(([initials, name, what, live]) => (
        <div key={initials as string}>
          <span className="pitch-avatar">{initials}</span>
          <span className="pitch-team-name">{name}</span>
          <span className="pitch-team-what">
            {live && <span className="live-dot" />}
            {what}
          </span>
        </div>
      ))}
    </div>
  );
}

const STATUSES = ["unbilled", "invoiced", "paid"] as const;
function BillingRows() {
  const now = useTick(2600);
  const step = Math.floor(now / 2600);
  return (
    <div className="pitch-billing">
      {[
        ["Brand refresh", 4200, 2],
        ["Website", 2850, 1],
        ["App design", 1340, 0],
      ].map(([name, amount, offset]) => {
        const status = STATUSES[(step + (offset as number)) % 3];
        return (
          <div key={name as string}>
            <span>{name}</span>
            <strong>{whole(amount as number)}</strong>
            <span key={status} className={`status ${status} pitch-status`}>
              {status[0].toUpperCase() + status.slice(1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function NativeApps() {
  const now = useTick();
  return (
    <div className="pitch-native">
      <div className="pitch-menubar">
        <Laptop size={12} />
        <span className="spacer" />
        <Sprout size={12} />
        <span className="pitch-menubar-clock">
          {time(((now / 1000) % 3600) + 2592)}
        </span>
      </div>
      <div className="pitch-notification">
        <Smartphone size={13} />
        <div>
          <strong>Crops · Tracking</strong>
          <span>Mobile app · {time(((now / 1000) % 3600) + 1260, true)}</span>
        </div>
        <span className="pitch-notification-action">
          <Pause size={10} /> Stop
        </span>
      </div>
    </div>
  );
}

function WeekBars() {
  const hours = [6.5, 7.25, 5.5, 8, 5.25, 0, 0];
  return (
    <div className="pitch-week">
      <div className="pitch-bars">
        {hours.map((h, index) => (
          <span key={index} title={`${h}h`}>
            <span
              style={{
                height: `${Math.max(4, (h / 8) * 100)}%`,
                animationDelay: `${index * 70}ms`,
              }}
            />
            <small>{"MTWTFSS"[index]}</small>
          </span>
        ))}
      </div>
      <div className="pitch-week-total">
        <strong>32.5h</strong>
        <span>this week · 88% billable</span>
        <span className="pitch-csv">
          <FileDown size={12} /> CSV
        </span>
      </div>
    </div>
  );
}

function PricingSlide({ live }: { live: boolean }) {
  const [scenarioId, setScenarioId] = useState(LANDER_SCENARIOS[0].id);
  const [invoicing, setInvoicing] = useState(true);
  const scenario = LANDER_SCENARIOS.find((s) => s.id === scenarioId)!;
  const bill = harvestYearly(scenario, invoicing);
  const total = useCountUp(bill.total, live);
  return (
    <div className="pitch-panel">
      <div className="eyebrow">The same year of work</div>
      <h2>Harvest bills you for growing. Crops is free.</h2>
      <div className="pitch-options">
        <div
          className="pitch-segmented"
          role="radiogroup"
          aria-label="Team size"
        >
          {LANDER_SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={s.id === scenarioId}
              onClick={() => setScenarioId(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
        <label className="pitch-switch">
          <input
            type="checkbox"
            checked={invoicing}
            onChange={(e) => setInvoicing(e.target.checked)}
          />
          <span aria-hidden />
          Invoicing in Harvest
        </label>
      </div>
      <div className="pitch-compare">
        <div className="pitch-card pitch-receipt">
          <div className="pitch-receipt-head">
            <span>Harvest Teams</span>
            <small>{scenario.summary}</small>
          </div>
          <div className="pitch-line">
            <span>
              {scenario.seats} seats × {whole(HARVEST_SEAT_YEARLY.teams)}
            </span>
            <strong>{whole(bill.seats)}</strong>
          </div>
          {bill.lines.map((line) => (
            <div
              key={`${scenario.id}-${line.resource}`}
              className={`pitch-line${line.yearly ? " is-charged" : ""}`}
            >
              <span>
                {RESOURCE_LABELS[line.resource]} ·{" "}
                {line.resource === "invoiced"
                  ? `$${line.count / 1000}K`
                  : line.count}
              </span>
              <strong>{line.yearly ? `+${whole(line.yearly)}` : "$0"}</strong>
            </div>
          ))}
          <div className="pitch-total">
            <span>Every year</span>
            <strong>{whole(total)}</strong>
          </div>
        </div>
        <div className="pitch-card pitch-crops">
          <img src="/crops.svg" alt="" width="28" height="28" />
          <strong className="pitch-free">$0</strong>
          <span>every year, at any size</span>
          <ul>
            {[
              "Unlimited clients & projects",
              "Unlimited teammates",
              "Web, macOS & Android",
              "Rates, budgets & billing status",
            ].map((item) => (
              <li key={item}>
                <Check size={13} /> {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="pitch-fineprint">
        Harvest Teams billed yearly, before tax. Usage rates from Harvest's own
        billing simulator, September 2026. Their fixed-price “Unlimited” usage
        package adds {whole(HARVEST_UNLIMITED_USAGE_YEARLY)} a year.
      </p>
    </div>
  );
}

const HISTORY = [
  {
    year: "2016",
    label: "Harvest Business",
    note: "Unlimited clients, projects & invoices",
    amount: 1188,
  },
  {
    year: "2025",
    label: "Harvest Pro",
    note: "About $11 a seat, still unlimited",
    amount: 1320,
  },
  {
    year: "2026",
    label: "Teams + usage",
    note: "20 clients · 50 projects",
    amount: harvestYearly(LANDER_SCENARIOS[1]).total,
  },
  {
    year: "2026",
    label: "Teams + “Unlimited”",
    note: "The no-surprises option",
    amount: HARVEST_SEAT_YEARLY.teams * 10 + HARVEST_UNLIMITED_USAGE_YEARLY,
  },
];

function HistorySlide({ live }: { live: boolean }) {
  const max = Math.max(...HISTORY.map((h) => h.amount));
  return (
    <div className="pitch-panel">
      <div className="eyebrow">A 10-person team, per year</div>
      <h2>It used to be $99 a month. For everything.</h2>
      <div className={`pitch-history${live ? " is-live" : ""}`}>
        {HISTORY.map((row, index) => (
          <div key={row.label} className="pitch-history-row">
            <div className="pitch-history-label">
              <span>{row.year}</span>
              <strong>{row.label}</strong>
              <small>{row.note}</small>
            </div>
            <div className="pitch-history-bar">
              <span
                style={{
                  width: `max(6px, calc((100% - 76px) * ${row.amount / max}))`,
                  transitionDelay: `${index * 140}ms`,
                }}
              />
              <strong>{whole(row.amount)}</strong>
            </div>
          </div>
        ))}
        <div className="pitch-history-row is-crops">
          <div className="pitch-history-label">
            <span>Today</span>
            <strong>Crops</strong>
            <small>Everything, for everyone</small>
          </div>
          <div className="pitch-history-bar">
            <span />
            <strong>$0</strong>
          </div>
        </div>
      </div>
      <p className="pitch-fineprint">
        After Bending Spoons bought Harvest in July 2025, per-seat pricing
        gained metered fees for projects, clients, tasks and invoices.
      </p>
    </div>
  );
}
