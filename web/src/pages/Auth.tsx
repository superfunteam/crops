import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Check, Clock3, Sprout } from "lucide-react";
import { api } from "../api";
import { Brand, Field } from "../components/UI";
export function Auth({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [register, setRegister] = useState(false),
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
        <Brand />
        <div className="auth-message">
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
          <div className="auth-timer">
            <Clock3 size={20} />
            <span>Time well spent</span>
            <Sprout size={20} />
          </div>
        </div>
        <div className="auth-bottom">
          One timer. Everywhere.<span>Web · macOS · Android</span>
        </div>
      </section>
      <main className="auth-main">
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
                      autoFocus
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
                  autoFocus={!register}
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
                  autoComplete={register ? "new-password" : "current-password"}
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
            <p className="auth-switch">Need an account? Ask your team admin.</p>
          )}
          <div className="auth-note">
            <Check size={16} /> Just time tracking. Beautifully simple.
          </div>
        </div>
      </main>
    </div>
  );
}
