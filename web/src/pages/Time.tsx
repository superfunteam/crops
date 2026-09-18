import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  Clock3,
  DollarSign,
  Pencil,
  Play,
  Plus,
  Square,
} from "lucide-react";
import type { Crops } from "../useCrops";
import type { Snapshot, Entry } from "../types";
import type { Editor } from "../components/Editors";
import {
  addDays,
  agentLabel,
  agentWorkTitle,
  clientName,
  duration,
  exportCSV,
  localDate,
  projectFor,
  time,
  today,
  weekDates,
} from "../lib";
import { Empty, PageHeading, Select, Status } from "../components/UI";
export function TimePage({
  s,
  crops,
  edit,
}: {
  s: Snapshot;
  crops: Crops;
  edit: (e: Editor) => void;
}) {
  const [date, setDate] = useState(today()),
    [view, setView] = useState<"day" | "week">("day"),
    [projectId, setProjectId] = useState(""),
    [notes, setNotes] = useState(""),
    [task, setTask] = useState("Build");
  const projects = s.projects.filter((p) => !p.archived),
    selected = projects.find((p) => p.id === projectId) || projects[0],
    running = s.runningEntry,
    own = s.entries.filter((e) => e.userId === s.user.id),
    week = weekDates(date),
    weekEntries = own.filter((e) => week.includes(e.date)),
    visible = (
      view === "day" ? own.filter((e) => e.date === date) : weekEntries
    ).sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        (a.startedAt ? -1 : b.startedAt ? 1 : 0),
    ),
    sum = (entries: Entry[]) =>
      entries.reduce((n, e) => n + duration(e, crops.now), 0),
    total = sum(weekEntries);
  useEffect(() => {
    if (selected && !projectId) setProjectId(selected.id);
  }, [selected, projectId]);
  async function start(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    try {
      await crops.mutate("/timer/start", {
        teamId: s.team.id,
        projectId: selected.id,
        task,
        notes,
        billable: selected.billable,
        date: today(),
      });
      setDate(today());
    } catch {}
  }
  const stop = (entry: Entry) =>
    crops
      .mutate("/timer/stop", { entryId: entry.id, version: entry.version })
      .catch(() => {});
  const resume = (e: Entry) =>
    crops
      .mutate("/timer/start", {
        teamId: e.teamId,
        projectId: e.projectId,
        task: e.task,
        notes: e.notes,
        billable: e.billable,
        entryId: e.id,
      })
      .catch(() => {});
  const activeProject = running ? projectFor(s, running.projectId) : null;
  return (
    <>
      <PageHeading
        eyebrow="A little focus goes a long way."
        title="Time well spent."
        description="Make room for your best work."
        action={
          <button
            type="button"
            className="button"
            onClick={() => edit({ kind: "entry", date })}
          >
            <Plus size={16} />
            Add time
          </button>
        }
      />
      <section
        className={`timer-panel ${running ? "is-running" : ""}`}
        aria-label="Timer"
      >
        {running ? (
          <div className="running-content">
            <div className="timer-description">
              <div className="eyebrow">
                <span className="live-dot" /> You're on the clock
              </div>
              <h2>
                {activeProject?.name ||
                  s.teams.find((t) => t.id === running.teamId)?.name ||
                  "Active timer"}
              </h2>
              <p>
                {running.task}
                {running.notes && ` · ${running.notes}`}
              </p>
            </div>
            <div className="timer-digits" aria-label="Elapsed time">
              {time(duration(running, crops.now), true)}
            </div>
            <button
              type="button"
              className="button primary"
              disabled={crops.busy}
              onClick={() => void stop(running)}
            >
              <Square size={14} fill="currentColor" />
              Stop timer
            </button>
          </div>
        ) : (
          <form className="timer-form" onSubmit={start}>
            <div className="timer-inputs">
              <input
                name="timerNotes"
                aria-label="What are you working on?"
                className="work-input"
                placeholder="What are you working on?"
                value={notes}
                maxLength={4000}
                onChange={(e) => setNotes(e.target.value)}
              />
              <div className="timer-meta">
                <Select
                  name="timerProject"
                  aria-label="Timer project"
                  value={selected?.id || ""}
                  onChange={(e) => setProjectId(e.target.value)}
                  required
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {clientName(s, p)} · {p.name}
                    </option>
                  ))}
                </Select>
                <span className="meta-divider" />
                <Select
                  name="timerTask"
                  aria-label="Timer task"
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                >
                  {[
                    "Build",
                    "Design",
                    "Strategy",
                    "Meeting",
                    "Project management",
                    "Admin",
                  ].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="timer-digits idle">0:00:00</div>
            <button
              type="submit"
              className="button primary"
              disabled={crops.busy || !selected}
            >
              <Play size={14} fill="currentColor" />
              Start timer
            </button>
          </form>
        )}
      </section>
      <div className="section-toolbar">
        <div className="date-controls">
          <div className="button-group">
            <button
              type="button"
              className="icon-button"
              aria-label="Previous week"
              onClick={() => setDate(addDays(date, -7))}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Next week"
              onClick={() => setDate(addDays(date, 7))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <h2>
            {localDate(week[0]).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
            })}{" "}
            –{" "}
            {localDate(week[6]).toLocaleDateString("en-US", {
              month:
                week[0].slice(0, 7) === week[6].slice(0, 7)
                  ? undefined
                  : "short",
              day: "numeric",
            })}
          </h2>
          <button
            className="text-button muted"
            type="button"
            onClick={() => setDate(today())}
          >
            Today
          </button>
        </div>
        <div className="segmented" aria-label="Timesheet view">
          <button
            type="button"
            aria-pressed={view === "day"}
            onClick={() => setView("day")}
          >
            Day
          </button>
          <button
            type="button"
            aria-pressed={view === "week"}
            onClick={() => setView("week")}
          >
            Week
          </button>
        </div>
      </div>
      <div className="week-strip">
        {week.map((d) => (
          <button
            type="button"
            key={d}
            className={`week-day ${d === date ? "selected" : ""} ${d === today() ? "today" : ""}`}
            onClick={() => {
              setDate(d);
              setView("day");
            }}
            aria-label={`${localDate(d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}, ${time(sum(own.filter((e) => e.date === d)))}`}
            aria-pressed={d === date}
          >
            <div>
              {localDate(d).toLocaleDateString("en-US", { weekday: "short" })}
              <span>{localDate(d).getDate()}</span>
            </div>
            <strong>{time(sum(own.filter((e) => e.date === d)))}</strong>
            <div className="day-line">
              <i
                style={
                  {
                    "--progress": `${Math.min(100, sum(own.filter((e) => e.date === d)) / 288)}%`,
                  } as React.CSSProperties
                }
              />
            </div>
          </button>
        ))}
        <div className="week-total">
          <span>Week total</span>
          <strong>{time(total)}</strong>
        </div>
      </div>
      <div className="entries-header">
        <h3>
          {view === "week"
            ? "This week"
            : date === today()
              ? "Today"
              : localDate(date).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
          <span>
            {visible.length} {visible.length === 1 ? "entry" : "entries"}
          </span>
        </h3>
        <button
          className="text-button"
          type="button"
          onClick={() => exportCSV(s, visible, crops.now)}
          disabled={!visible.length}
        >
          <ArrowDownToLine size={14} />
          Export
        </button>
      </div>
      <div className="entries-list">
        {visible.length ? (
          visible.map((e) => {
            const p = projectFor(s, e.projectId),
              isActive = !!e.startedAt;
            return (
              <article
                key={e.id}
                className={`entry-row ${isActive ? "active" : ""}`}
              >
                <div
                  className="project-mark"
                  style={
                    {
                      "--project-color": p?.color || "#527663",
                    } as React.CSSProperties
                  }
                />
                <div className="entry-details">
                  <div className="entry-client">
                    {clientName(s, p)}
                    {view === "week" &&
                      ` · ${localDate(e.date).toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}`}
                  </div>
                  <h3>
                    {p?.name || "Project"}{" "}
                    {!e.agent && <span className="task-tag">{e.task}</span>}
                    {e.agent && (
                      <span
                        className="task-tag"
                        title={`Agent usage${e.agent.model ? ` · ${e.agent.model}` : ""}`}
                      >
                        Agent Usage: {agentLabel(e)}
                      </span>
                    )}
                  </h3>
                  <p>
                    {e.agent
                      ? agentWorkTitle(e.task)
                      : e.notes || "No notes added."}
                  </p>
                </div>
                <div className="entry-meta">
                  {e.status !== "unbilled" ? (
                    <Status status={e.status} />
                  ) : e.billable ? (
                    <DollarSign size={15} aria-label="Billable" />
                  ) : null}
                  {isActive && (
                    <span className="live-label">
                      <span className="live-dot" />
                      Running
                    </span>
                  )}
                  <strong className="entry-time">
                    {time(duration(e, crops.now), isActive)}
                  </strong>
                </div>
                <div className="entry-actions">
                  <button
                    type="button"
                    className={`icon-button ${isActive ? "stop-entry" : ""}`}
                    title={isActive ? "Stop timer" : "Resume timer"}
                    aria-label={`${isActive ? "Stop" : "Resume"} ${p?.name}`}
                    disabled={
                      crops.busy || e.status !== "unbilled" || p?.archived
                    }
                    onClick={() => void (isActive ? stop(e) : resume(e))}
                  >
                    {isActive ? (
                      <Square size={12} fill="currentColor" />
                    ) : (
                      <Play size={15} />
                    )}
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Edit ${p?.name} entry`}
                    disabled={isActive || e.status !== "unbilled"}
                    onClick={() => edit({ kind: "entry", entry: e })}
                  >
                    <Pencil size={15} />
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <Empty
            title="A fresh page for good work."
            action={
              <button
                type="button"
                className="button"
                onClick={() => edit({ kind: "entry", date })}
              >
                <Plus size={16} />
                Add an entry
              </button>
            }
          >
            Start a timer above, or add the time you’ve already spent.
          </Empty>
        )}
      </div>
      <div className="day-total">
        <span>{view === "week" ? "Week" : "Day"} total</span>
        <strong>{time(sum(visible))}</strong>
      </div>
      <div className="time-bottom">
        <section className="weekly-summary">
          <div className="section-label">Your week, at a glance</div>
          <div className="weekly-stats">
            <div>
              <strong>{time(total)}</strong>
              <span>Total hours</span>
            </div>
            <div>
              <strong>
                {time(sum(weekEntries.filter((e) => e.billable)))}
              </strong>
              <span>Billable hours</span>
            </div>
            <div>
              <strong>
                {new Set(weekEntries.map((e) => e.projectId)).size}
              </strong>
              <span>Projects tended</span>
            </div>
          </div>
        </section>
        <aside className="focus-note">
          <SproutNote />
          <div>
            <h3>Little by little, good things grow.</h3>
            <p>Track the work. Keep the momentum.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
function SproutNote() {
  return <Clock3 size={22} />;
}
