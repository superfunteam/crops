import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, Copy, Sprout } from "lucide-react";
import { api } from "../api";

type Spots = { spots: number; claimed: number; remaining: number };
type Joined = Spots & { joined: boolean; position: number };

const reducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

// Netlify Forms only accept form-encoded posts; the hidden twin in index.html
// lets Netlify detect the "waitlist" form at deploy time.
const netlifySubmit = (email: string) =>
  fetch("/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ "form-name": "waitlist", email }).toString(),
  }).then((r) => {
    if (!r.ok) throw Error("Netlify form submission failed");
  });

export function Waitlist({ onSignIn }: { onSignIn: () => void }) {
  const [spots, setSpots] = useState<Spots | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [joined, setJoined] = useState<Joined | null>(null);
  const [burst, setBurst] = useState<{ x: number; y: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      document.visibilityState === "visible" &&
      api<Spots>("/waitlist")
        .then((s) => active && setSpots(s))
        .catch(() => {});
    load();
    const id = setInterval(load, 20000);
    document.addEventListener("visibilitychange", load);
    return () => {
      active = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    if (data.get("bot-field")) return;
    setBusy(true);
    setError("");
    const address = email.trim();
    const [crops, netlify] = await Promise.allSettled([
      api<Joined>("/waitlist", "POST", { email: address }),
      netlifySubmit(address),
    ]);
    setBusy(false);
    if (crops.status === "rejected" && netlify.status === "rejected") {
      setError((crops.reason as Error).message || "Something went wrong.");
      return;
    }
    const result =
      crops.status === "fulfilled"
        ? crops.value
        : {
            ...(spots ?? { spots: 0, claimed: 0, remaining: 0 }),
            joined: true,
            position: 0,
          };
    setSpots(result);
    setJoined(result);
    const box = button.current?.getBoundingClientRect();
    setBurst(
      box
        ? { x: box.left + box.width / 2, y: box.top + box.height / 2 }
        : { x: innerWidth / 2, y: innerHeight / 2 },
    );
  }

  return (
    <div className="waitlist">
      {burst && <Confetti origin={burst} />}
      <SpotsPill spots={spots} />
      {joined ? (
        <Welcome joined={joined} email={email.trim()} />
      ) : (
        <>
          <h2>Claim your spot.</h2>
          <p>
            Crops is free forever. We’re opening workspaces a few teams at a
            time, so grab a spot before they’re gone.
          </p>
          <form
            name="waitlist"
            method="POST"
            data-netlify="true"
            netlify-honeypot="bot-field"
            onSubmit={submit}
          >
            <input type="hidden" name="form-name" value="waitlist" />
            <label className="waitlist-honeypot" aria-hidden>
              Leave this empty
              <input name="bot-field" tabIndex={-1} autoComplete="off" />
            </label>
            <fieldset disabled={busy} className="waitlist-fields">
              <label className="sr-only" htmlFor="waitlist-email">
                Email address
              </label>
              <input
                id="waitlist-email"
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                placeholder="you@studio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button
                ref={button}
                className="button primary waitlist-submit"
                type="submit"
              >
                {busy ? "Saving your spot…" : "Get early access"}
                <ArrowRight size={16} />
              </button>
            </fieldset>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </form>
          <ul className="waitlist-perks">
            <li>
              <Check size={14} /> Unlimited clients, projects and teammates
            </li>
            <li>
              <Check size={14} /> Web, macOS, Android, API and MCP
            </li>
          </ul>
        </>
      )}
      <p className="auth-switch waitlist-signin">
        Already have an account?{" "}
        <button type="button" className="text-button" onClick={onSignIn}>
          Sign in
        </button>
      </p>
    </div>
  );
}

function SpotsPill({ spots }: { spots: Spots | null }) {
  const remaining = spots?.remaining;
  const full = remaining === 0;
  return (
    <div className={`spots-pill${full ? " is-full" : ""}`} aria-live="polite">
      <span className="spots-dot" aria-hidden />
      {full ? (
        "Waitlist open · next batch soon"
      ) : (
        <>
          <span key={remaining ?? "…"} className="spots-count">
            {remaining ?? 24}
          </span>
          {remaining === 1 ? " spot available" : " spots available"}
        </>
      )}
    </div>
  );
}

function Welcome({ joined, email }: { joined: Joined; email: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="waitlist-welcome" role="status">
      <div className="waitlist-badge" aria-hidden>
        <Sprout size={26} />
      </div>
      <h2>{joined.joined ? "You’re in!" : "You’re already in!"}</h2>
      <p>
        {joined.position > 0 && joined.position <= joined.spots ? (
          <>
            Spot <strong>#{joined.position}</strong> is yours.{" "}
          </>
        ) : joined.position > 0 ? (
          <>
            You’re <strong>#{joined.position}</strong> on the list.{" "}
          </>
        ) : null}
        We’ll email <strong>{email}</strong> when your workspace is ready to
        plant.
      </p>
      <button
        type="button"
        className="button waitlist-share"
        onClick={() => {
          navigator.clipboard
            ?.writeText(location.origin)
            .then(() => setCopied(true))
            .catch(() => {});
        }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied ? "Link copied" : "Share Crops with a friend"}
      </button>
    </div>
  );
}

const COLORS = [
  "#28533e",
  "#769452",
  "#b0c684",
  "#e3efc6",
  "#c9dba2",
  "#fa5d00",
  "#f6f5ef",
];

/** A one-shot confetti burst from the submit button, drawn on a canvas. */
function Confetti({ origin }: { origin: { x: number; y: number } }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx || reducedMotion()) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = innerWidth * dpr;
    el.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const { x: ox, y: oy } = origin;
    const pieces = Array.from({ length: 180 }, (_, i) => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
      const speed = 7 + Math.random() * 11;
      return {
        x: ox,
        y: oy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        w: 6 + Math.random() * 7,
        h: 4 + Math.random() * 6,
        spin: (Math.random() - 0.5) * 0.4,
        turn: Math.random() * Math.PI,
        wobble: Math.random() * 10,
        color: COLORS[i % COLORS.length],
        leaf: i % 5 === 0,
      };
    });
    let frame = 0;
    let raf = 0;
    const draw = () => {
      frame++;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of pieces) {
        p.vy += 0.32;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx + Math.sin((frame + p.wobble) / 9) * 0.8;
        p.y += p.vy;
        p.turn += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.turn);
        ctx.globalAlpha = Math.max(0, 1 - frame / 170);
        ctx.fillStyle = p.color;
        if (p.leaf) {
          ctx.beginPath();
          ctx.ellipse(0, 0, p.w * 0.7, p.h * 0.45, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.scale(1, Math.cos(p.turn * 2));
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }
      if (frame < 170) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [origin]);
  return <canvas ref={canvas} className="confetti" aria-hidden />;
}
