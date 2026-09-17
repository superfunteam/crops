import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Check,
  Copy,
  Download,
  KeyRound,
  Monitor,
  Plus,
  Smartphone,
} from "lucide-react";
import type { AccessKey, Snapshot } from "../types";
import type { Editor } from "../components/Editors";
import { Field, Modal, PageHeading } from "../components/UI";
import { api } from "../api";
const shortDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button type="button" className="button" onClick={() => void copy()}>
      {copied ? <Check size={16} /> : <Copy size={16} />}
      {copied ? "Copied" : label}
    </button>
  );
}
function AccessKeys({ s }: { s: Snapshot }) {
  const [keys, setKeys] = useState<AccessKey[] | null>(null);
  const [created, setCreated] = useState<{
    key: AccessKey;
    secret: string;
  } | null>(null);
  const [revoking, setRevoking] = useState<AccessKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revokeError, setRevokeError] = useState("");
  const load = useCallback(async () => {
    try {
      setKeys((await api<{ keys: AccessKey[] }>("/access-keys")).keys);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, s.user.id]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError("");
    try {
      const name = String(new FormData(form).get("name"));
      setCreated(
        await api<{ key: AccessKey; secret: string }>("/access-keys", "POST", {
          name,
        }),
      );
      form.reset();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!revoking) return;
    setBusy(true);
    setRevokeError("");
    try {
      await api(`/access-keys/${revoking.id}`, "DELETE");
      if (created?.key.id === revoking.id) setCreated(null);
      setRevoking(null);
      await load();
    } catch (e) {
      setRevokeError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const origin = location.origin;
  const hook = created && `${origin}/api/hooks/${created.secret}`;
  const projectId =
    s.projects.find((p) => !p.archived)?.id || "your-project-id";
  const snippets = created && [
    { label: "Access key", copy: "Copy key", text: created.secret },
    { label: "Webhook URL", copy: "Copy URL", text: hook! },
    {
      label: "Try it with curl",
      copy: "Copy command",
      text: `curl -X POST ${hook} -H 'Content-Type: application/json' -d '{"action":"toggle","projectId":"${projectId}","timezone":"${Intl.DateTimeFormat().resolvedOptions().timeZone}"}'`,
    },
    {
      label: "Add to Claude Code (MCP)",
      copy: "Copy command",
      text: `claude mcp add crops -e CROPS_URL=${origin} -e CROPS_ACCESS_KEY=${created.secret} -- node /path/to/crops/mcp/crops-mcp.mjs`,
    },
  ];
  return (
    <section className="settings-section">
      <h2>Access keys</h2>
      <p className="muted">
        Let scripts, webhooks, and AI agents track time as you, with your
        permissions. Treat each key like a password.
      </p>
      {created && snippets && (
        <div className="access-key-reveal" role="status">
          <div>
            <h3>“{created.key.name}” is ready</h3>
            <p>
              Copy it now. Crops shows this key once and stores only a hash. The
              webhook URL contains the key, so keep it private too.
            </p>
          </div>
          {snippets.map((snippet) => (
            <div className="access-key-snippet" key={snippet.label}>
              <div>
                <span>{snippet.label}</span>
                <code>{snippet.text}</code>
              </div>
              <CopyButton text={snippet.text} label={snippet.copy} />
            </div>
          ))}
          <button
            type="button"
            className="button subtle"
            onClick={() => {
              setCreated(null);
              void load();
            }}
          >
            Done, I saved it
          </button>
        </div>
      )}
      {keys?.map((key) => (
        <div className="settings-row" key={key.id}>
          <div>
            <h3>{key.name}</h3>
            <p>
              <code className="access-key-prefix">{key.prefix}…</code> · Created{" "}
              {shortDate(key.createdAt)} ·{" "}
              {key.lastUsedAt
                ? `Last used ${shortDate(key.lastUsedAt)}`
                : "Never used"}
            </p>
          </div>
          <button
            type="button"
            className="button"
            onClick={() => {
              setRevokeError("");
              setRevoking(key);
            }}
          >
            Revoke
          </button>
        </div>
      ))}
      {keys && !keys.length && (
        <p className="access-key-empty">No access keys yet.</p>
      )}
      <form className="access-key-form" onSubmit={create}>
        <Field label="New key name">
          <input
            name="name"
            required
            maxLength={100}
            placeholder="Zapier, Stream Deck, Claude Code…"
            disabled={busy}
          />
        </Field>
        <button type="submit" className="button" disabled={busy}>
          <Plus size={16} />
          Create key
        </button>
      </form>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {revoking && (
        <Modal
          title={`Revoke “${revoking.name}”?`}
          onClose={() => setRevoking(null)}
          onSubmit={revoke}
          submit="Revoke key"
          submitDanger
          busy={busy}
          error={revokeError}
        >
          <p>
            Anything using this key, including its webhook URL and MCP setup,
            stops working immediately. This cannot be undone.
          </p>
        </Modal>
      )}
    </section>
  );
}
export function SettingsPage({
  s,
  edit,
}: {
  s: Snapshot;
  edit: (e: Editor) => void;
}) {
  const [copied, setCopied] = useState(false);
  const base = location.origin;
  async function copy() {
    try {
      await navigator.clipboard.writeText(base);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="Make yourself at home."
        title="Your workspace"
        description="A few essentials. Nothing extra."
      />
      <section className="settings-section">
        <h2>Account</h2>
        <div className="settings-row">
          <div>
            <h3>{s.user.name}</h3>
            <p>
              @{s.user.username} ·{" "}
              {s.team.role === "admin" ? "Team admin" : "Team member"}
            </p>
          </div>
          <button
            type="button"
            className="button"
            onClick={() => edit({ kind: "password" })}
          >
            <KeyRound size={16} />
            Change password
          </button>
        </div>
      </section>
      <AccessKeys s={s} />
      <section className="settings-section">
        <h2>Take your timer with you</h2>
        <p className="muted">
          Sign in with the same account on every device. Your timer comes along.
        </p>
        <div className="download-grid">
          <div className="download-option">
            <Monitor size={24} />
            <h3>Crops for macOS</h3>
            <p>A little timer in your menu bar. Always within reach.</p>
            <a className="button" href="/downloads/Crops-macOS.zip" download>
              <Download size={16} />
              Download for Mac
            </a>
            <small>
              macOS 13+ · Apple silicon + Intel · ad hoc signed build
            </small>
          </div>
          <div className="download-option">
            <Smartphone size={24} />
            <h3>Crops for Android</h3>
            <p>Your running timer, right in your notifications.</p>
            <a className="button" href="/downloads/Crops-android.apk" download>
              <Download size={16} />
              Download APK
            </a>
            <small>Android 8+ · debug build for internal testing</small>
          </div>
        </div>
        <div className="server-address">
          <div>
            <h3>Your server address</h3>
            <p>Enter this in the macOS and Android apps.</p>
            <code>{base}</code>
          </div>
          <button type="button" className="button" onClick={() => void copy()}>
            {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
            {copied ? "Copied" : "Copy address"}
          </button>
        </div>
        {["localhost", "127.0.0.1"].includes(location.hostname) && (
          <p className="local-note">
            For another device on your Wi-Fi, use this computer’s LAN address
            with port 8787. A local server must stay running. Once deployed, use
            your HTTPS web address on every device.
          </p>
        )}
      </section>
      <section className="settings-section">
        <h2>Teams</h2>
        {s.teams.map((team) => (
          <div className="settings-row" key={team.id}>
            <div>
              <h3>{team.name}</h3>
              <p>
                {team.role === "admin" ? "Admin" : "Member"}
                {team.id === s.team.id ? " · Current workspace" : ""}
              </p>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="button"
          onClick={() => edit({ kind: "team" })}
        >
          Create another team
        </button>
      </section>
      <div className="about-crops">
        <img src="/crops.svg" width="30" height="30" alt="" />
        <span>
          Crops <span className="muted">· v0.1.0</span>
        </span>
        <p>Simple tools. Good work. Room to grow.</p>
      </div>
    </>
  );
}
