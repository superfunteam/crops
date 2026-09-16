import type { Entry, Project, Snapshot } from "./types";
export const today = () => dateKey(new Date());
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function localDate(s: string) {
  return new Date(`${s}T12:00:00`);
}
export function addDays(s: string, n: number) {
  const d = localDate(s);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
export function weekDates(s: string) {
  const d = localDate(s),
    offset = (d.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => addDays(s, i - offset));
}
export function duration(e: Entry, now: number) {
  return (
    e.durationSeconds +
    (e.startedAt
      ? Math.max(0, Math.floor((now - Date.parse(e.startedAt)) / 1000))
      : 0)
  );
}
export function time(s: number, seconds = false) {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}${seconds ? `:${String(s % 60).padStart(2, "0")}` : ""}`;
}
export function decimal(s: number) {
  return (s / 3600).toFixed(2);
}
export function parseDuration(v: string) {
  if (/^\d+:\d{2}(:\d{2})?$/.test(v)) {
    const [h, m, sec = 0] = v.split(":").map(Number);
    if (m > 59 || sec > 59)
      throw Error("Minutes and seconds must be between 00 and 59.");
    return h * 3600 + m * 60 + sec;
  }
  if (!/^\d+(\.\d+)?$/.test(v))
    throw Error("Enter hours like 1.5 or a duration like 1:30.");
  return Math.round(Number(v) * 3600);
}
export function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}
export function projectFor(s: Snapshot, id: string) {
  return s.projects.find((p) => p.id === id);
}
export function clientName(s: Snapshot, p?: Project) {
  return s.clients.find((c) => c.id === p?.clientId)?.name || "Internal";
}
export function personName(s: Snapshot, id: string) {
  return s.members.find((m) => m.userId === id)?.name || "Team member";
}
export const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
export function exportCSV(s: Snapshot, entries: Entry[], now: number) {
  const cells = (row: unknown[]) =>
    row
      .map((v) => {
        let text = String(v ?? "");
        if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
        return `"${text.replaceAll('"', '""')}"`;
      })
      .join(",");
  const rows = [
    cells([
      "Date",
      "Person",
      "Client",
      "Project",
      "Task",
      "Notes",
      "Hours",
      "Billable",
      "Status",
      "Amount (USD)",
    ]),
    ...entries.map((e) => {
      const p = projectFor(s, e.projectId);
      return cells([
        e.date,
        personName(s, e.userId),
        clientName(s, p),
        p?.name,
        e.task,
        e.notes,
        decimal(duration(e, now)),
        e.billable ? "Yes" : "No",
        e.status,
        e.billable
          ? ((duration(e, now) / 3600) * (p?.rate || 0)).toFixed(2)
          : "0.00",
      ]);
    }),
  ];
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + rows.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `crops-${today()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
