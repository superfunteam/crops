import { useState } from "react";
import {
  ArrowDownToLine,
  Check,
} from "lucide-react";
import type { Snapshot, Entry, BillingStatus } from "../types";
import type { Crops } from "../useCrops";
import type { Editor } from "../components/Editors";
import {
  duration,
  exportCSV,
  money,
  personName,
  projectFor,
  time,
  today,
} from "../lib";
import { Empty, PageHeading, Select, Status } from "../components/UI";
export function ReportsPage({
  s,
  crops,
  billing = false,
  edit,
}: {
  s: Snapshot;
  crops: Crops;
  billing?: boolean;
  edit: (e: Editor) => void;
}) {
  const [from, setFrom] = useState(today().slice(0, 7) + "-01"),
    [to, setTo] = useState(today()),
    [person, setPerson] = useState(""),
    [project, setProject] = useState(""),
    [status, setStatus] = useState(""),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [batch, setBatch] = useState(false),
    [notice, setNotice] = useState("");
  const entries = s.entries
    .filter(
      (e) =>
        e.date >= from &&
        e.date <= to &&
        (!person || e.userId === person) &&
        (!project || e.projectId === project) &&
        (!status || e.status === status) &&
        (!billing || e.billable),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const sum = (es: Entry[]) =>
      es.reduce((n, e) => n + duration(e, crops.now), 0),
    amount = (es: Entry[]) =>
      es.reduce(
        (n, e) =>
          n +
          (e.billable
            ? (duration(e, crops.now) / 3600) *
              (projectFor(s, e.projectId)?.rate || 0)
            : 0),
        0,
      ),
    total = sum(entries),
    billableSeconds = sum(entries.filter((e) => e.billable));
  const eligible = entries.filter((e) => !e.startedAt),
    allSelected =
      eligible.length > 0 && eligible.every((e) => selected.has(e.id)),
    selectedEntries = eligible.filter((e) => selected.has(e.id));
  async function mark(next: BillingStatus) {
    setBatch(true);
    setNotice("");
    let count = 0;
    try {
      for (const e of selectedEntries) {
        await crops.mutate(
          `/entries/${e.id}`,
          { version: e.version, status: next },
          "PATCH",
        );
        count++;
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(e.id);
          return next;
        });
      }
      setNotice(
        `${count} ${count === 1 ? "entry" : "entries"} marked ${next}.`,
      );
    } catch {
      setNotice(
        `${count} ${count === 1 ? "entry was" : "entries were"} updated before the request stopped. Review the message above.`,
      );
    } finally {
      setBatch(false);
    }
  }
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  return (
    <>
      <PageHeading
        eyebrow={
          billing
            ? "From good work to getting paid."
            : "See where the time grows."
        }
        title={billing ? "Billing" : "Reports"}
        description={
          billing
            ? "Review billable time. Mark it invoiced, then paid."
            : "A clear view of your team’s time and project progress."
        }
        action={
          <button
            type="button"
            className="button"
            onClick={() => exportCSV(s, entries, crops.now)}
            disabled={!entries.length}
          >
            <ArrowDownToLine size={16} />
            Export CSV
          </button>
        }
      />
      <div className="report-filters">
        <label className="date-filter">
          <span>From</span>
          <input
            type="date"
            name="from"
            aria-label="Start date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <span className="muted date-dash">–</span>
        <label className="date-filter">
          <span>To</span>
          <input
            type="date"
            name="to"
            aria-label="End date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <Select
          name="person"
          aria-label="Filter by teammate"
          value={person}
          onChange={(e) => setPerson(e.target.value)}
        >
          <option value="">
            {s.team.role === "admin" ? "Everyone" : "My time"}
          </option>
          {s.members
            .filter((m) => s.team.role === "admin" || m.userId === s.user.id)
            .map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          {(s.formerMembers ?? []).map((m) => <option key={m.id} value={m.id}>{m.name} · Former member</option>)}
        </Select>
        <Select
          name="project"
          aria-label="Filter by project"
          value={project}
          onChange={(e) => setProject(e.target.value)}
        >
          <option value="">All projects</option>
          {s.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>
      {from > to && (
        <p className="form-error" role="alert">
          Choose an end date on or after the start date.
        </p>
      )}
      <div className="metrics-container">
        <div className="metrics">
          {billing ? (
            <>
              <div>
                <span>Unbilled</span>
                <strong>
                  {money(
                    amount(entries.filter((e) => e.status === "unbilled")),
                  )}
                </strong>
                <small>
                  {time(sum(entries.filter((e) => e.status === "unbilled")))}{" "}
                  hours
                </small>
              </div>
              <div>
                <span>Invoiced</span>
                <strong>
                  {money(
                    amount(entries.filter((e) => e.status === "invoiced")),
                  )}
                </strong>
                <small>Waiting to be paid</small>
              </div>
              <div>
                <span>Paid</span>
                <strong className="green-text">
                  {money(amount(entries.filter((e) => e.status === "paid")))}
                </strong>
                <small>Good work, rewarded</small>
              </div>
            </>
          ) : (
            <>
              <div>
                <span>Total tracked</span>
                <strong>
                  {time(total)}
                  <em> h</em>
                </strong>
                <small>{entries.length} time entries</small>
              </div>
              <div>
                <span>Billable time</span>
                <strong>
                  {time(billableSeconds)}
                  <em> h</em>
                </strong>
                <small>
                  {total ? Math.round((billableSeconds / total) * 100) : 0}% of
                  tracked time
                </small>
              </div>
              <div>
                <span>Billable value</span>
                <strong>{money(amount(entries))}</strong>
                <small>At current project rates</small>
              </div>
            </>
          )}
        </div>
      </div>
      {!billing && entries.length > 0 && (
        <section className="project-breakdown">
          <div className="section-toolbar">
            <h2>Time by project</h2>
            <span className="muted">
              {new Set(entries.map((e) => e.projectId)).size} projects
            </span>
          </div>
          <div
            className="distribution-bar"
            aria-label="Project time distribution"
          >
            {s.projects.map((p) => {
              const sec = sum(entries.filter((e) => e.projectId === p.id));
              return sec > 0 ? (
                <div
                  key={p.id}
                  title={`${p.name}: ${time(sec)}`}
                  style={
                    {
                      "--portion": sec,
                      "--project-color": p.color,
                    } as React.CSSProperties
                  }
                />
              ) : null;
            })}
          </div>
          <div className="breakdown-legend">
            {s.projects.map((p) => {
              const sec = sum(entries.filter((e) => e.projectId === p.id));
              return sec > 0 ? (
                <button
                  type="button"
                  className="legend-item"
                  key={p.id}
                  onClick={() => setProject(p.id)}
                >
                  <i
                    style={
                      { "--project-color": p.color } as React.CSSProperties
                    }
                  />
                  <span>{p.name}</span>
                  <strong>{time(sec)}</strong>
                </button>
              ) : null;
            })}
          </div>
        </section>
      )}
      <div className="section-toolbar">
        <h2>
          {billing ? "Billable entries" : "Time entries"}{" "}
          <span className="count">{entries.length}</span>
        </h2>
        <Select
          name="status"
          aria-label="Filter by billing status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="unbilled">Unbilled</option>
          <option value="invoiced">Invoiced</option>
          <option value="paid">Paid</option>
        </Select>
      </div>
      {billing && selectedEntries.length > 0 && (
        <div className="selection-toolbar">
          <span>{selectedEntries.length} selected</span>
          <div className="row-actions">
            <button
              type="button"
              className="button"
              disabled={batch || crops.busy}
              onClick={() => void mark("unbilled")}
            >
              Mark unbilled
            </button>
            <button
              type="button"
              className="button"
              disabled={batch || crops.busy}
              onClick={() => void mark("invoiced")}
            >
              Mark invoiced
            </button>
            <button
              type="button"
              className="button primary"
              disabled={batch || crops.busy}
              onClick={() => void mark("paid")}
            >
              <Check size={16} />
              Mark paid
            </button>
          </div>
        </div>
      )}
      {notice && (
        <p role="status" className="success-note">
          {notice}
        </p>
      )}
      {entries.length ? (
        <div className="table-scroll">
          <table className="data-table entries-table">
            <thead>
              <tr>
                {billing && (
                  <th>
                    <input
                      type="checkbox"
                      name="selectAll"
                      aria-label="Select all stopped entries"
                      disabled={batch}
                      checked={allSelected}
                      onChange={() =>
                        setSelected(
                          allSelected
                            ? new Set()
                            : new Set(eligible.map((e) => e.id)),
                        )
                      }
                    />
                  </th>
                )}
                <th>Date / teammate</th>
                <th>Project / notes</th>
                <th>Hours</th>
                {billing && <th>Amount</th>}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const p = projectFor(s, e.projectId);
                return (
                  <tr key={e.id}>
                    {billing && (
                      <td>
                        <input
                          type="checkbox"
                          name={`select-${e.id}`}
                          aria-label={`Select ${p?.name} ${e.date}`}
                          disabled={!!e.startedAt || batch}
                          checked={selected.has(e.id)}
                          onChange={() => toggle(e.id)}
                        />
                      </td>
                    )}
                    <td>
                      <div>{e.date}</div>
                      <div className="muted small">
                        {personName(s, e.userId)}
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="text-button entity-name"
                        disabled={!!e.startedAt || e.status !== "unbilled"}
                        onClick={() => edit({ kind: "entry", entry: e })}
                      >
                        {p?.name}
                      </button>
                      <div className="muted small truncate" title={e.notes}>
                        {e.task}
                        {e.notes && ` · ${e.notes}`}
                      </div>
                    </td>
                    <td className="numeric">
                      {time(duration(e, crops.now))}
                      {e.startedAt && (
                        <span className="running-indicator" title="Running" />
                      )}
                    </td>
                    {billing && (
                      <td className="numeric">
                        {money(
                          (duration(e, crops.now) / 3600) * (p?.rate || 0),
                        )}
                      </td>
                    )}
                    <td>
                      <Status status={e.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="Nothing in this patch yet.">
          Time entries will appear here. Try a different date range or clear a
          filter.
        </Empty>
      )}
      {billing && (
        <p className="billing-note">
          Amounts use current project rates in USD. Invoices stay with your
          bank; Crops keeps track of the time. Invoiced and paid entries are
          locked until marked unbilled.
        </p>
      )}
    </>
  );
}
