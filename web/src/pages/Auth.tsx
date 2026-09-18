import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Check } from "lucide-react";
import { api } from "../api";
import { Brand, Field } from "../components/UI";
import { Pitch } from "../components/Pitch";
import { Waitlist } from "../components/Waitlist";
// On phones the pitch sits above the form, so focusing a field would scroll past it.
const stacked = () =>
  typeof matchMedia === "function" && matchMedia("(max-width: 640px)").matches;
export function Auth({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [signingIn, setSigningIn] = useState(
      () => typeof location !== "undefined" && location.hash === "#sign-in",
    ),
    [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    api<{ registrationEnabled: boolean }>("/health")
      .then((health) => {
        if (active) setRegistrationEnabled(health.registrationEnabled === true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(`/auth/${register ? "register" : "login"}`, "POST", data);
      sessionStorage.removeItem("crops.team");
      await onSignedIn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <div className="auth-story-top">
          <Brand />
          <span>Web · macOS · Android</span>
        </div>
        <Pitch />
      </section>
      <main className="auth-main">
        <nav className="auth-apps" aria-label="Download the apps">
          <a href="/downloads/Crops-macOS.zip" download>
            <AppleIcon /> macOS
          </a>
          <a href="/downloads/Crops-android.apk" download>
            <AndroidIcon /> Android
          </a>
        </nav>
        {!signingIn ? (
          <div className="auth-form">
            <Waitlist onSignIn={() => setSigningIn(true)} />
          </div>
        ) : (
          <div className="auth-form">
            <div className="mobile-brand">
              <Brand />
            </div>
            <h2>{register ? "Plant your first seed." : "Welcome back."}</h2>
            <p>
              {register
                ? "Create your account and give your team a home."
                : "A fresh start for your next bit of good work."}
            </p>
            <form onSubmit={submit}>
              <fieldset disabled={busy}>
                {register && (
                  <>
                    <Field label="Your name">
                      <input
                        autoFocus={!stacked()}
                        name="name"
                        autoComplete="name"
                        required
                        placeholder="Alex Morgan"
                        maxLength={100}
                      />
                    </Field>
                    <Field label="Team name">
                      <input
                        name="teamName"
                        required
                        placeholder="Your studio"
                        maxLength={100}
                      />
                    </Field>
                  </>
                )}
                <Field label="Username">
                  <input
                    name="username"
                    autoComplete="username"
                    autoFocus={!register && !stacked()}
                    required
                    minLength={3}
                    maxLength={80}
                    placeholder="Your username"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </Field>
                <Field label="Password">
                  <input
                    name="password"
                    type="password"
                    autoComplete={
                      register ? "new-password" : "current-password"
                    }
                    required
                    minLength={register ? 8 : undefined}
                    maxLength={128}
                    placeholder={
                      register ? "At least 8 characters" : "Your password"
                    }
                  />
                </Field>
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <button className="button primary auth-submit" type="submit">
                  {busy
                    ? "One moment…"
                    : register
                      ? "Create your workspace"
                      : "Sign in"}
                  <ArrowRight size={16} />
                </button>
              </fieldset>
            </form>
            {registrationEnabled ? (
              <p className="auth-switch">
                {register ? "Already have an account?" : "Starting a new team?"}{" "}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setRegister(!register);
                    setError("");
                  }}
                >
                  {register ? "Sign in" : "Create a workspace"}
                </button>
              </p>
            ) : (
              <p className="auth-switch">
                Need an account? Ask your team admin.
              </p>
            )}
            <p className="auth-switch">
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setSigningIn(false);
                  setRegister(false);
                  setError("");
                }}
              >
                ← Back to early access
              </button>
            </p>
            <div className="auth-note">
              <Check size={16} /> Just time tracking. Beautifully simple.
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.5-1-2.5-3.7zM14.1 5.8c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.7-1.3z" />
    </svg>
  );
}
function AndroidIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M3.5 18a8.5 8.5 0 0 1 17 0z" fill="currentColor" />
      <path
        d="M7.6 10.4 5.6 7.2M16.4 10.4l2-3.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="8.6" cy="14.4" r="1.05" fill="#fff" />
      <circle cx="15.4" cy="14.4" r="1.05" fill="#fff" />
    </svg>
  );
}
