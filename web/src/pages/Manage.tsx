import { useState } from "react";
import {
  Archive,
  Building2,
  FolderOpen,
  MoreHorizontal,
  Plus,
  Search,
  Shield,
  Users,
} from "lucide-react";
import type { Crops } from "../useCrops";
import type { Snapshot } from "../types";
import type { Editor } from "../components/Editors";
import { clientName, duration, initials, money, time } from "../lib";
import { Empty, PageHeading, Select } from "../components/UI";
interface Props {
  s: Snapshot;
  crops: Crops;
  edit: (e: Editor) => void;
}
function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="search-box">
      <Search size={16} />
      <input
        type="search"
        name="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function ProjectsPage({ s, crops, edit }: Props) {
  const [search, setSearch] = useState(""),
    [archived, setArchived] = useState(false),
    admin = s.team.role === "admin";
  const projects = s.projects.filter(
    (p) =>
      p.archived === archived &&
      `${p.name} ${p.code} ${clientName(s, p)}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="A place for every bit of work."
        title="Projects"
        description="Keep an eye on the work you’re growing."
        action={
          admin && (
            <button
              type="button"
              className="button primary"
              onClick={() => edit({ kind: "project" })}
            >
              <Plus size={16} />
              New project
            </button>
          )
        }
      />
      <div className="section-toolbar">
        <div className="underlined-tabs">
          <button
            type="button"
            aria-pressed={!archived}
            onClick={() => setArchived(false)}
          >
            Active <span>{s.projects.filter((p) => !p.archived).length}</span>
          </button>
          <button
            type="button"
            aria-pressed={archived}
            onClick={() => setArchived(true)}
          >
            Archived
          </button>
        </div>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Find a project…"
        />
      </div>
      {projects.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Tracked</th>
                <th>Budget</th>
                <th>Hourly rate</th>
                {admin && (
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const hours =
                    s.entries
                      .filter((e) => e.projectId === p.id)
                      .reduce((n, e) => n + duration(e, crops.now), 0) / 3600,
                  percent = p.budgetHours ? (hours / p.budgetHours) * 100 : 0;
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="name-cell">
                        <div
                          className="project-mark"
                          style={
                            {
                              "--project-color": p.color,
                            } as React.CSSProperties
                          }
                        />
                        <div>
                          <div className="muted small">{clientName(s, p)}</div>
                          <button
                            className="text-button entity-name"
                            type="button"
                            onClick={() =>
                              admin && edit({ kind: "project", project: p })
                            }
                            disabled={!admin}
                          >
                            {p.name}
                          </button>
                          {p.code && (
                            <span className="inline-code">{p.code}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="numeric">{time(hours * 3600)}</td>
                    <td>
                      {p.budgetHours ? (
                        <div className="budget">
                          <div>
                            <span>{Math.round(percent)}%</span>
                            <span className="muted">of {p.budgetHours} h</span>
                          </div>
                          <div
                            className={`progress ${percent > 100 ? "over" : ""}`}
                          >
                            <i
                              style={
                                {
                                  "--progress": `${Math.min(100, percent)}%`,
                                } as React.CSSProperties
                              }
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="muted">No budget</span>
                      )}
                    </td>
                    <td>
                      {p.billable ? (
                        `${money(p.rate)} / h`
                      ) : (
                        <span className="muted">Non-billable</span>
                      )}
                    </td>
                    {admin && (
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Edit ${p.name}`}
                            onClick={() =>
                              edit({ kind: "project", project: p })
                            }
                          >
                            <MoreHorizontal size={18} />
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            disabled={crops.busy}
                            title={
                              archived ? "Restore project" : "Archive project"
                            }
                            aria-label={`${archived ? "Restore" : "Archive"} ${p.name}`}
                            onClick={() =>
                              void crops
                                .mutate(
                                  `/projects/${p.id}`,
                                  { archived: !p.archived },
                                  "PATCH",
                                )
                                .catch(() => {})
                            }
                          >
                            <Archive size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title={
            search
              ? "No matching projects."
              : archived
                ? "Nothing archived."
                : "Room for your next project."
          }
        >
          {search
            ? "Try a different name or client."
            : archived
              ? "Finished projects can live here, with their time kept safe."
              : "Create a project and start growing something good."}
        </Empty>
      )}
      <div className="list-footnote">
        <FolderOpen size={15} />
        {projects.length} {archived ? "archived" : "active"}{" "}
        {projects.length === 1 ? "project" : "projects"}
      </div>
    </>
  );
}
export function ClientsPage({ s, crops, edit }: Props) {
  const [search, setSearch] = useState(""),
    [archived, setArchived] = useState(false),
    admin = s.team.role === "admin";
  const clients = s.clients.filter(
    (c) =>
      c.archived === archived &&
      `${c.name} ${c.email}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="The people behind the projects."
        title="Clients"
        description="Good work starts with good relationships."
        action={
          admin && (
            <button
              type="button"
              className="button primary"
              onClick={() => edit({ kind: "client" })}
            >
              <Plus size={16} />
              New client
            </button>
          )
        }
      />
      <div className="section-toolbar">
        <div className="underlined-tabs">
          <button
            type="button"
            aria-pressed={!archived}
            onClick={() => setArchived(false)}
          >
            Active <span>{s.clients.filter((c) => !c.archived).length}</span>
          </button>
          <button
            type="button"
            aria-pressed={archived}
            onClick={() => setArchived(true)}
          >
            Archived
          </button>
        </div>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Find a client…"
        />
      </div>
      {clients.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Contact</th>
                <th>Projects</th>
                <th>Total time</th>
                {admin && (
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const projects = s.projects.filter((p) => p.clientId === c.id);
                const seconds = s.entries
                  .filter((e) => projects.some((p) => p.id === e.projectId))
                  .reduce((n, e) => n + duration(e, crops.now), 0);
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="name-cell">
                        <div className="client-initial">{initials(c.name)}</div>
                        <button
                          type="button"
                          className="text-button entity-name"
                          disabled={!admin}
                          onClick={() => edit({ kind: "client", client: c })}
                        >
                          {c.name}
                        </button>
                      </div>
                    </td>
                    <td>
                      {c.email ? (
                        <a className="muted" href={`mailto:${c.email}`}>
                          {c.email}
                        </a>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{projects.length}</td>
                    <td className="numeric">{time(seconds)}</td>
                    {admin && (
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Edit ${c.name}`}
                            onClick={() => edit({ kind: "client", client: c })}
                          >
                            <MoreHorizontal size={18} />
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            disabled={crops.busy}
                            aria-label={`${archived ? "Restore" : "Archive"} ${c.name}`}
                            onClick={() =>
                              void crops
                                .mutate(
                                  `/clients/${c.id}`,
                                  { archived: !c.archived },
                                  "PATCH",
                                )
                                .catch(() => {})
                            }
                          >
                            <Archive size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="No clients here yet.">
          Add a client to organize their projects and tracked time.
        </Empty>
      )}
      <div className="list-footnote">
        <Building2 size={15} />
        {clients.length} {clients.length === 1 ? "client" : "clients"}
      </div>
    </>
  );
}
export function TeamPage({ s, crops, edit }: Props) {
  const admin = s.team.role === "admin";
  return (
    <>
      <PageHeading
        eyebrow="Better work, together."
        title="Your team"
        description={`${s.team.name} · ${s.members.length} ${s.members.length === 1 ? "person" : "people"}`}
        action={
          admin && (
            <button
              type="button"
              className="button primary"
              onClick={() => edit({ kind: "member" })}
            >
              <Plus size={16} />
              Add teammate
            </button>
          )
        }
      />
      <div className="team-banner">
        <Users size={22} />
        <div>
          <h3>Small team. Good company.</h3>
          <p>
            Members track their own time. Admins manage projects, timesheets,
            and billing.
          </p>
        </div>
        {admin && <button type="button" className="button subtle" onClick={() => edit({ kind: "team-edit" })}>Edit team</button>}
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Teammate</th>
              <th>Username</th>
              <th>Tracked time{admin ? "" : " visible to you"}</th>
              <th>Role</th>
              {admin && <th><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {s.members.map((m) => (
              <tr key={m.id}>
                <td>
                  <div className="name-cell">
                    <div className="avatar">{initials(m.name)}</div>
                    <div className="entity-name">
                      {m.name}{" "}
                      {m.userId === s.user.id && (
                        <span className="task-tag">You</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="muted">@{m.username}</td>
                <td className="numeric">
                  {admin || m.userId === s.user.id
                    ? time(
                        s.entries
                          .filter((e) => e.userId === m.userId)
                          .reduce((n, e) => n + duration(e, crops.now), 0),
                      )
                    : "Private"}
                </td>
                <td>
                  {admin ? (
                    <Select
                      name={`role-${m.id}`}
                      aria-label={`Role for ${m.name}`}
                      value={m.role}
                      disabled={crops.busy || (m.role === "admin" && s.members.filter(person => person.role === "admin").length === 1)}
                      onChange={(e) =>
                        void crops
                          .mutate(
                            `/members/${m.id}`,
                            { role: e.target.value },
                            "PATCH",
                          )
                          .catch(() => {})
                      }
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </Select>
                  ) : (
                    <span>{m.role === "admin" ? "Admin" : "Member"}</span>
                  )}
                </td>
                {admin && <td><button type="button" className="button subtle" disabled={crops.busy} aria-label={`Edit ${m.name}`} onClick={() => edit({ kind: "member-edit", member: m })}>Edit</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="list-footnote">
        <Shield size={15} />
        Your team’s time stays in your team.
      </div>
    </>
  );
}
