import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import type { Client, Entry, Project, Snapshot } from "../types";
import type { Crops } from "../useCrops";
import { clientName, parseDuration, time, today } from "../lib";
import { Field, Modal, Select } from "./UI";
export type Editor =
  | { kind: "entry"; entry?: Entry; date?: string }
  | { kind: "project"; project?: Project }
  | { kind: "client"; client?: Client }
  | { kind: "member" }
  | { kind: "team" }
  | { kind: "password" };
export function Editors({
  editor,
  s,
  crops,
  onClose,
}: {
  editor: Editor;
  s: Snapshot;
  crops: Crops;
  onClose: () => void;
}) {
  const [error, setError] = useState(""),
    [deleting, setDeleting] = useState(false);
  const entry = editor.kind === "entry" ? editor.entry : undefined,
    project = editor.kind === "project" ? editor.project : undefined,
    client = editor.kind === "client" ? editor.client : undefined;
  const title =
    editor.kind === "entry"
      ? entry
        ? "Edit time entry"
        : "Add time"
      : editor.kind === "project"
        ? project
          ? "Edit project"
          : "New project"
        : editor.kind === "client"
          ? client
            ? "Edit client"
            : "New client"
          : editor.kind === "team"
            ? "Create a team"
            : editor.kind === "password"
              ? "Change password"
              : "Add teammate";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      d = Object.fromEntries(form);
    setError("");
    try {
      if (editor.kind === "entry") {
        const body = {
          teamId: s.team.id,
          projectId: d.projectId,
          task: d.task,
          notes: d.notes,
          date: d.date,
          durationSeconds: parseDuration(String(d.duration)),
          billable: form.has("billable"),
        };
        if (entry) {
          const changes = Object.fromEntries(
            Object.entries(body).filter(
              ([key, value]) =>
                key !== "teamId" && value !== entry[key as keyof Entry],
            ),
          );
          if (Object.keys(changes).length)
            await crops.mutate(
              `/entries/${entry.id}`,
              { ...changes, version: entry.version },
              "PATCH",
            );
        } else await crops.mutate("/entries", body);
      } else if (editor.kind === "project") {
        const body = {
          teamId: s.team.id,
          name: d.name,
          clientId: d.clientId || null,
          code: d.code,
          color: d.color,
          billable: form.has("billable"),
          rate: Number(d.rate || 0),
          budgetHours: Number(d.budgetHours || 0),
        };
        if (project) {
          const changes = Object.fromEntries(
            Object.entries(body).filter(
              ([key, value]) =>
                key !== "teamId" && value !== project[key as keyof Project],
            ),
          );
          if (Object.keys(changes).length)
            await crops.mutate(`/projects/${project.id}`, changes, "PATCH");
        } else await crops.mutate("/projects", body);
      } else if (editor.kind === "client")
        await crops.mutate(
          client ? `/clients/${client.id}` : "/clients",
          {
            ...(!client ? { teamId: s.team.id } : {}),
            name: d.name,
            email: d.email,
          },
          client ? "PATCH" : "POST",
        );
      else if (editor.kind === "member")
        await crops.mutate("/members", { teamId: s.team.id, ...d });
      else if (editor.kind === "password")
        await crops.mutate("/auth/password", d);
      else {
        const result = await crops.mutate<{ team: { id: string } }>("/teams", {
          name: d.name,
        });
        crops.switchTeam(result.team.id);
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function remove() {
    if (!entry) return;
    try {
      await crops.mutate(
        `/entries/${entry.id}?version=${entry.version}`,
        undefined,
        "DELETE",
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal
      title={deleting ? "Delete this entry?" : title}
      onClose={onClose}
      onSubmit={deleting ? undefined : submit}
      busy={crops.busy}
      error={error}
      submit={
        entry || project || client
          ? "Save changes"
          : editor.kind === "entry"
            ? "Add time"
            : editor.kind === "member"
              ? "Add teammate"
              : editor.kind === "password"
                ? "Change password"
                : "Create"
      }
      footer={
        entry ? (
          deleting ? (
            <button
              type="button"
              className="button danger"
              disabled={crops.busy}
              onClick={() => void remove()}
            >
              Delete entry
            </button>
          ) : (
            <button
              type="button"
              className="button subtle"
              onClick={() => setDeleting(true)}
            >
              <Trash2 size={16} />
              Delete
            </button>
          )
        ) : null
      }
    >
      {deleting ? (
        <p>
          This removes the {entry?.task || "time"} entry and its tracked time.
          You can cancel to keep it.
        </p>
      ) : (
        <>
          {editor.kind === "entry" && (
            <>
              <Field label="Project">
                <Select
                  name="projectId"
                  defaultValue={entry?.projectId}
                  required
                >
                  {s.projects
                    .filter((p) => !p.archived || p.id === entry?.projectId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {clientName(s, p)} · {p.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Task">
                <input
                  name="task"
                  defaultValue={entry?.task || "Build"}
                  list="tasks"
                  maxLength={120}
                  required
                />
              </Field>
              <Field label="Notes">
                <textarea
                  name="notes"
                  defaultValue={entry?.notes}
                  placeholder="What did you work on?"
                  rows={3}
                  maxLength={4000}
                />
              </Field>
              <div className="form-grid">
                <Field label="Date">
                  <input
                    type="date"
                    name="date"
                    defaultValue={
                      entry?.date ||
                      ("date" in editor ? editor.date : undefined) ||
                      today()
                    }
                    required
                  />
                </Field>
                <Field label="Duration" hint="Hours (1.5) or time (1:30).">
                  <input
                    name="duration"
                    placeholder="1:30"
                    defaultValue={
                      entry ? time(entry.durationSeconds, true) : undefined
                    }
                    required
                    inputMode="decimal"
                  />
                </Field>
              </div>
              <label className="check-label">
                <input
                  type="checkbox"
                  name="billable"
                  defaultChecked={entry?.billable ?? true}
                />
                Billable time
              </label>
            </>
          )}
          {editor.kind === "project" && (
            <>
              <Field label="Project name">
                <input
                  name="name"
                  defaultValue={project?.name}
                  autoFocus
                  placeholder="Website redesign"
                  maxLength={180}
                  required
                />
              </Field>
              <Field label="Client">
                <Select name="clientId" defaultValue={project?.clientId || ""}>
                  <option value="">Internal / no client</option>
                  {s.clients
                    .filter((c) => !c.archived || c.id === project?.clientId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <div className="form-grid">
                <Field label="Project code">
                  <input
                    name="code"
                    defaultValue={project?.code}
                    placeholder="Optional"
                    maxLength={40}
                  />
                </Field>
                <Field label="Color">
                  <input
                    type="color"
                    name="color"
                    defaultValue={project?.color || "#527663"}
                  />
                </Field>
              </div>
              <div className="form-grid">
                <Field label="Hourly rate (USD)">
                  <input
                    type="number"
                    name="rate"
                    defaultValue={project?.rate || 0}
                    min={0}
                    step="0.01"
                    max={1000000}
                  />
                </Field>
                <Field label="Budget (hours)" hint="0 means no budget.">
                  <input
                    type="number"
                    name="budgetHours"
                    defaultValue={project?.budgetHours || 0}
                    min={0}
                    step="0.25"
                  />
                </Field>
              </div>
              <label className="check-label">
                <input
                  type="checkbox"
                  name="billable"
                  defaultChecked={project?.billable ?? true}
                />
                Billable by default
              </label>
            </>
          )}
          {editor.kind === "client" && (
            <>
              <Field label="Client name">
                <input
                  name="name"
                  defaultValue={client?.name}
                  autoFocus
                  placeholder="Acme Studio"
                  maxLength={180}
                  required
                />
              </Field>
              <Field label="Contact email">
                <input
                  type="email"
                  name="email"
                  defaultValue={client?.email}
                  placeholder="hello@example.com"
                  maxLength={254}
                />
              </Field>
            </>
          )}
          {editor.kind === "member" && (
            <>
              <p className="muted">
                Add an existing Crops username, or create an account for a new
                teammate.
              </p>
              <Field label="Username">
                <input
                  name="username"
                  autoFocus
                  required
                  minLength={3}
                  maxLength={80}
                  autoCapitalize="none"
                  autoComplete="off"
                  placeholder="alex"
                />
              </Field>
              <Field label="Name" hint="Required for a new account.">
                <input name="name" placeholder="Alex Morgan" maxLength={100} />
              </Field>
              <Field
                label="Initial password"
                hint="Required for a new account. Share it privately."
              >
                <input
                  name="password"
                  type="password"
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                />
              </Field>
              <Field label="Role">
                <Select name="role" defaultValue="member">
                  <option value="member">Member · track their own time</option>
                  <option value="admin">
                    Admin · manage the team and billing
                  </option>
                </Select>
              </Field>
            </>
          )}
          {editor.kind === "team" && (
            <Field label="Team name">
              <input
                name="name"
                autoFocus
                required
                maxLength={100}
                placeholder="Your studio"
              />
            </Field>
          )}
          {editor.kind === "password" && (
            <>
              <Field label="Current password">
                <input
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </Field>
              <Field
                label="New password"
                hint="At least 8 characters. Other sessions will be signed out."
              >
                <input
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={128}
                />
              </Field>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
