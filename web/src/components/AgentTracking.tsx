import { useEffect, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import type { Snapshot } from "../types";
import { Field, Select } from "./UI";
import {
  agentTriggers,
  buildAgentPrompt,
  type AgentTrigger,
} from "../agentPrompt";

type Preferences = {
  clientId: string;
  projectId: string;
  trigger: AgentTrigger;
  billable: boolean;
};
export function AgentTracking({ s }: { s: Snapshot }) {
  const storageKey = `crops.agent-prompt.${s.user.id}.${s.team.id}`;
  const [preferences, setPreferences] = useState<Preferences>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      return {
        clientId: typeof saved.clientId === "string" ? saved.clientId : "",
        projectId: typeof saved.projectId === "string" ? saved.projectId : "",
        trigger: Object.hasOwn(agentTriggers, saved.trigger)
          ? saved.trigger
          : "session",
        billable: saved.billable === true,
      };
    } catch {
      return {
        clientId: "",
        projectId: "",
        trigger: "session",
        billable: false,
      };
    }
  });
  const [copyStatus, setCopyStatus] = useState("");
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(preferences));
    } catch {
      /* Preferences still work without browser storage. */
    }
  }, [storageKey, preferences]);
  const clients = s.clients.filter((c) => !c.archived);
  const client = clients.find((c) => c.id === preferences.clientId);
  const validClient = Boolean(client) || preferences.clientId === "unassigned";
  const projects = validClient
    ? s.projects.filter(
        (p) => !p.archived && p.clientId === (client?.id ?? null),
      )
    : [];
  const project = projects.find((p) => p.id === preferences.projectId);
  const prompt = project
    ? buildAgentPrompt({
        origin: location.origin,
        teamId: s.team.id,
        teamName: s.team.name,
        clientId: client?.id ?? null,
        clientName: client?.name ?? "No client",
        projectId: project.id,
        projectName: project.name,
        trigger: preferences.trigger,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        billable: preferences.billable,
      })
    : "";
  function change(update: Partial<Preferences>) {
    setPreferences((p) => ({ ...p, ...update }));
    setCopyStatus("");
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyStatus("Copied. Paste these instructions into your agent.");
    } catch {
      setCopyStatus("Clipboard unavailable. Select and copy the prompt below.");
    }
  }
  function download() {
    const blob = new Blob(
      [
        `---\nname: crops-token-skill\ndescription: Report agent tokens, plan capacity, and allocated subscription cost to the configured Crops client and project at the chosen trigger.\n---\n\n${prompt}`,
      ],
      { type: "text/markdown" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "crops-token-skill.md";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="settings-section agent-tracking">
      <h2>Agent usage tracking</h2>
      <p className="muted">
        Give your agent a ready-to-use prompt to report tokens, plan capacity,
        and subscription cost to {s.team.name}. Choose where the usage belongs
        and when to send it.
      </p>
      <div className="form-grid">
        <Field label="Report usage after">
          <Select
            name="agentTrigger"
            value={preferences.trigger}
            onChange={(e) =>
              change({ trigger: e.target.value as AgentTrigger })
            }
          >
            {Object.entries(agentTriggers).map(([id, trigger]) => (
              <option key={id} value={id}>
                {trigger.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Client">
          <Select
            name="agentClient"
            value={validClient ? preferences.clientId : ""}
            onChange={(e) =>
              change({ clientId: e.target.value, projectId: "" })
            }
          >
            <option value="">Choose a client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="unassigned">No client / internal project</option>
          </Select>
        </Field>
        <Field
          label="Project"
          hint="Crops assigns usage to a client through its project."
        >
          <Select
            name="agentProject"
            value={project?.id ?? ""}
            disabled={!validClient || !projects.length}
            onChange={(e) => change({ projectId: e.target.value })}
          >
            <option value="">Choose a project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cost handling">
          <Select
            name="agentBillable"
            value={String(preferences.billable)}
            onChange={(e) => change({ billable: e.target.value === "true" })}
          >
            <option value="false">Track only · non-billable</option>
            <option value="true">Bill the subscription slice</option>
          </Select>
        </Field>
      </div>
      {validClient && !projects.length && (
        <p role="status" className="muted">
          This client has no active projects. Create one in Projects, then
          select it here.
        </p>
      )}
      <p className="muted">
        These instructions use an access key from the section below. Give the
        key to your agent privately as <code>CROPS_ACCESS_KEY</code>. The prompt
        contains no secret.
      </p>
      <div className="agent-prompt-actions">
        <button
          type="button"
          className="button primary"
          disabled={!prompt}
          onClick={() => void copy()}
        >
          {copyStatus.startsWith("Copied") ? (
            <Check size={16} />
          ) : (
            <Copy size={16} />
          )}{" "}
          Copy agent prompt
        </button>
        <button
          type="button"
          className="button"
          disabled={!prompt}
          onClick={download}
        >
          <Download size={16} /> Download crops-token-skill.md
        </button>
        <span role="status">{copyStatus}</span>
      </div>
      {prompt && (
        <details className="agent-prompt-preview">
          <summary>Read or select the full prompt</summary>
          <textarea
            name="agentPrompt"
            aria-label="Agent tracking prompt"
            readOnly
            value={prompt}
            spellCheck={false}
          />
        </details>
      )}
      <p className="muted agent-prompt-note">
        Saved in this browser for this team. Copy again after changing a
        setting. Your agent follows the trigger; Crops does not install a
        background hook. Reports add zero human hours. Tokens provide context;
        cost is an allocated subscription slice, never an API token price.
      </p>
    </section>
  );
}
