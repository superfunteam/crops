import { useState } from "react";
import {
  Check,
  Copy,
  Download,
  KeyRound,
  Monitor,
  Smartphone,
} from "lucide-react";
import type { Snapshot } from "../types";
import type { Editor } from "../components/Editors";
import { PageHeading } from "../components/UI";
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
