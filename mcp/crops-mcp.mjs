#!/usr/bin/env node
// Crops MCP server: stdio JSON-RPC 2.0 (newline-delimited), no dependencies.
// Env: CROPS_URL (default https://crops.wims.vc), and CROPS_ACCESS_KEY (create one in
// Crops Settings), or a CROPS_TOKEN session, or CROPS_USERNAME + CROPS_PASSWORD.
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";

const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const base = (process.env.CROPS_URL || "https://crops.wims.vc")
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/api$/, "");
let token = process.env.CROPS_ACCESS_KEY || process.env.CROPS_TOKEN || "";
let signingIn;

class ToolError extends Error {}
const send = (message) => process.stdout.write(JSON.stringify(message) + "\n");

async function request(path, method = "GET", body, retry = true) {
  if (!token)
    await (signingIn ||= login().finally(() => (signingIn = undefined)));
  const headers = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method === "POST") headers["Idempotency-Key"] = randomUUID();
  const attempt = () =>
    fetch(`${base}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  let response;
  try {
    response = await attempt();
  } catch {
    // POST retries reuse the Idempotency-Key, so the server replays one result.
    if (method === "PATCH" || method === "DELETE")
      throw new ToolError(`Could not reach Crops at ${base}.`);
    try {
      response = await attempt();
    } catch {
      throw new ToolError(`Could not reach Crops at ${base}.`);
    }
  }
  const data = await response.json().catch(() => null);
  if (response.status === 401 && retry && process.env.CROPS_USERNAME) {
    token = "";
    return request(path, method, body, false);
  }
  if (!response.ok) {
    const error = new ToolError(
      data?.error || `Crops request failed (${response.status}).`,
    );
    error.code = data?.code;
    throw error;
  }
  return data;
}

async function login() {
  const { CROPS_USERNAME: username, CROPS_PASSWORD: password } = process.env;
  if (!username || !password)
    throw new ToolError(
      "Set CROPS_ACCESS_KEY (create one in Crops Settings), or CROPS_USERNAME and CROPS_PASSWORD, for the Crops MCP server.",
    );
  let response;
  try {
    response = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ToolError(`Could not reach Crops at ${base}.`);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.token)
    throw new ToolError(
      data?.error || `Crops sign-in failed (${response.status}).`,
    );
  token = data.token;
}

async function teamStates() {
  const first = await request("/state");
  const rest = await Promise.all(
    first.teams
      .filter((t) => t.id !== first.team.id)
      .map((t) => request(`/state?teamId=${encodeURIComponent(t.id)}`)),
  );
  return [first, ...rest];
}
async function findProject(projectId) {
  if (typeof projectId !== "string" || !projectId)
    throw new ToolError(
      "projectId is required. Use list_projects to find one.",
    );
  for (const s of await teamStates()) {
    const project = s.projects.find((p) => p.id === projectId);
    if (project) return { s, project };
  }
  throw new ToolError(
    `Project ${projectId} was not found. Use list_projects to find one.`,
  );
}
async function findEntry(entryId) {
  if (typeof entryId !== "string" || !entryId)
    throw new ToolError("entryId is required. Use list_entries to find one.");
  for (const s of await teamStates()) {
    const entry = s.entries.find((e) => e.id === entryId);
    if (entry) return { s, entry };
  }
  throw new ToolError(
    `Entry ${entryId} was not found. Use list_entries to find one.`,
  );
}
// Load the entry's current version, and retry once if it changes meanwhile.
async function withVersion(entryId, change) {
  for (let tries = 0; ; tries++) {
    const found = await findEntry(entryId);
    try {
      return await change(found);
    } catch (error) {
      if (error.code !== "version_conflict" || tries >= 1) throw error;
    }
  }
}
function isoDate(value, name) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new ToolError(`${name} must be a YYYY-MM-DD date.`);
  return value;
}
function seconds(args, required) {
  const value =
    args.durationSeconds !== undefined
      ? args.durationSeconds
      : typeof args.durationMinutes === "number"
        ? Math.round(args.durationMinutes * 60)
        : args.durationMinutes;
  if (value === undefined && !required) return undefined;
  if (!Number.isInteger(value) || value < 0)
    throw new ToolError(
      "Provide durationMinutes or durationSeconds as a nonnegative number.",
    );
  return value;
}
const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function usage(value, name = "agent") {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ToolError(`${name} must be an object with tokens and cost.`);
  const { tokens, cost, model } = value;
  if (!Number.isInteger(tokens) || tokens < 0)
    throw new ToolError(`${name}.tokens must be a nonnegative integer.`);
  if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0)
    throw new ToolError(`${name}.cost must be a nonnegative USD amount.`);
  if (model !== undefined && model !== null && typeof model !== "string")
    throw new ToolError(`${name}.model must be a string.`);
  // Crops stores cents; round the agent's own estimate to the nearest cent.
  return {
    tokens,
    cost: Math.round(cost * 100) / 100,
    ...(model ? { model: model.trim().slice(0, 100) } : {}),
  };
}
const optional = (args, keys) =>
  Object.fromEntries(
    keys.filter((k) => args[k] !== undefined).map((k) => [k, args[k]]),
  );
function describe(s, entry) {
  if (!entry) return null;
  const project = s?.projects.find((p) => p.id === entry.projectId);
  const elapsed = entry.startedAt
    ? Math.max(
        0,
        Math.floor(
          (Date.parse(s?.serverTime || new Date().toISOString()) -
            Date.parse(entry.startedAt)) /
            1000,
        ),
      )
    : 0;
  return {
    ...entry,
    project: project?.name,
    client: s?.clients.find((c) => c.id === project?.clientId)?.name,
    elapsedSeconds: entry.durationSeconds + elapsed,
  };
}

const agentSchema = {
  type: "object",
  description: "Usage the agent computed itself. Crops does not meter tokens.",
  properties: {
    tokens: { type: "integer", minimum: 0, description: "Total tokens used." },
    cost: {
      type: "number",
      minimum: 0,
      description: "Cost in USD; rounded to cents.",
    },
    model: {
      type: "string",
      maxLength: 100,
      description: "Model name, optional.",
    },
  },
  required: ["tokens", "cost"],
  additionalProperties: false,
};
const entryFields = {
  task: {
    type: "string",
    maxLength: 200,
    description: "Short task label, e.g. Build.",
  },
  notes: { type: "string", maxLength: 4000, description: "What the work was." },
  billable: {
    type: "boolean",
    description: "Defaults to the project's billable setting.",
  },
};
const tools = [
  {
    name: "list_projects",
    description:
      "List the teams this account belongs to, with their clients and active projects (ids, billable flags, hourly rates). Call this first to find a projectId.",
    inputSchema: {
      type: "object",
      properties: { includeArchived: { type: "boolean" } },
    },
    async run(args) {
      return (await teamStates()).map((s) => ({
        team: { id: s.team.id, name: s.team.name, role: s.team.role },
        clients: s.clients
          .filter((c) => args.includeArchived || !c.archived)
          .map(({ id, name, archived }) => ({ id, name, archived })),
        projects: s.projects
          .filter((p) => args.includeArchived || !p.archived)
          .map(({ id, name, code, clientId, billable, rate, archived }) => ({
            id,
            name,
            code,
            clientId,
            client:
              s.clients.find((c) => c.id === clientId)?.name || "Internal",
            billable,
            rate,
            archived,
          })),
      }));
    },
  },
  {
    name: "current_timer",
    description:
      "Show this account's running timer, if any, with project, client, and elapsed seconds. There is at most one running timer per person.",
    inputSchema: { type: "object", properties: {} },
    async run() {
      const s = await request("/state");
      if (!s.runningEntry) return { running: false };
      const team =
        s.runningEntry.teamId === s.team.id
          ? s
          : await request(
              `/state?teamId=${encodeURIComponent(s.runningEntry.teamId)}`,
            );
      return {
        running: true,
        entry: describe({ ...team, serverTime: s.serverTime }, s.runningEntry),
      };
    },
  },
  {
    name: "start_timer",
    description:
      "Start a new timer on a project, dated today. Any running timer is stopped first. To continue an existing entry instead, use resume_timer.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        ...entryFields,
        agent: agentSchema,
      },
      required: ["projectId"],
    },
    async run(args) {
      const { s, project } = await findProject(args.projectId);
      const agent = usage(args.agent);
      const { entry } = await request("/timer/start", "POST", {
        teamId: s.team.id,
        projectId: project.id,
        date: localDate(),
        ...optional(args, ["task", "notes", "billable"]),
        ...(agent !== undefined ? { agent } : {}),
      });
      return { started: true, entry: describe(s, entry) };
    },
  },
  {
    name: "stop_timer",
    description:
      "Stop this account's running timer, optionally attaching the agent's own token usage and USD cost (replaces the entry's recorded usage).",
    inputSchema: { type: "object", properties: { agent: agentSchema } },
    async run(args) {
      const agent = usage(args.agent);
      const s = await request("/state");
      if (!s.runningEntry) throw new ToolError("No timer is running.");
      const { entry } = await request("/timer/stop", "POST", {
        entryId: s.runningEntry.id,
        version: s.runningEntry.version,
        ...(agent !== undefined ? { agent } : {}),
      });
      return {
        stopped: true,
        entry: describe(s.runningEntry.teamId === s.team.id ? s : null, entry),
      };
    },
  },
  {
    name: "log_time",
    description:
      "Add a completed time entry with a duration (no timer), optionally with agent usage.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        durationMinutes: { type: "number", minimum: 0 },
        durationSeconds: { type: "integer", minimum: 0 },
        date: {
          type: "string",
          description: "YYYY-MM-DD; defaults to today (local).",
        },
        ...entryFields,
        agent: agentSchema,
      },
      required: ["projectId"],
    },
    async run(args) {
      const durationSeconds = seconds(args, true);
      const { s, project } = await findProject(args.projectId);
      const agent = usage(args.agent);
      const { entry } = await request("/entries", "POST", {
        teamId: s.team.id,
        projectId: project.id,
        date: args.date || localDate(),
        durationSeconds,
        ...optional(args, ["task", "notes", "billable"]),
        ...(agent !== undefined ? { agent } : {}),
      });
      return { logged: true, entry: describe(s, entry) };
    },
  },
  {
    name: "report_agent_usage",
    description:
      "Attach agent usage to an existing entry. mode add (default) adds to the recorded usage; set replaces it.",
    inputSchema: {
      type: "object",
      properties: {
        entryId: { type: "string", description: "From list_entries." },
        ...agentSchema.properties,
        mode: { type: "string", enum: ["add", "set"] },
      },
      required: ["entryId", "tokens", "cost"],
    },
    async run(args) {
      if (typeof args.entryId !== "string" || !args.entryId)
        throw new ToolError("entryId is required.");
      if (args.mode !== undefined && !["add", "set"].includes(args.mode))
        throw new ToolError("mode must be add or set.");
      const reported = usage(
        { tokens: args.tokens, cost: args.cost, model: args.model },
        "usage",
      );
      return withVersion(args.entryId, async (found) => {
        const previous = args.mode === "set" ? null : found.entry.agent;
        const agent = {
          tokens: (previous?.tokens || 0) + reported.tokens,
          cost: Math.round(((previous?.cost || 0) + reported.cost) * 100) / 100,
          ...(reported.model || previous?.model
            ? { model: reported.model || previous.model }
            : {}),
        };
        const { entry } = await request(
          `/entries/${encodeURIComponent(args.entryId)}`,
          "PATCH",
          { version: found.entry.version, agent },
        );
        return { updated: true, entry: describe(found.s, entry) };
      });
    },
  },
  {
    name: "list_entries",
    description:
      "List time entries (newest first) so you can review, edit, resume, or delete them. Defaults to your own entries from the last 7 days across all your teams. Returns ids and versions for update_entry, delete_entry, and resume_timer.",
    inputSchema: {
      type: "object",
      properties: {
        from: {
          type: "string",
          description: "First date, YYYY-MM-DD. Defaults to 6 days ago.",
        },
        to: {
          type: "string",
          description:
            "Last date, YYYY-MM-DD. Defaults to tomorrow (local), so entries dated by a server in a later timezone still appear.",
        },
        projectId: { type: "string", description: "Only this project." },
        teamId: { type: "string", description: "Only this team." },
        mine: {
          type: "boolean",
          description:
            "Only your own entries (default true). Team admins can pass false to see everyone's.",
        },
      },
    },
    async run(args) {
      const to =
        isoDate(args.to, "to") || localDate(new Date(Date.now() + 86400000));
      const from =
        isoDate(args.from, "from") ||
        localDate(new Date(Date.now() - 6 * 86400000));
      const states = args.teamId
        ? [await request(`/state?teamId=${encodeURIComponent(args.teamId)}`)]
        : await teamStates();
      const entries = states
        .flatMap((s) =>
          s.entries
            .filter(
              (e) =>
                e.date >= from &&
                e.date <= to &&
                (!args.projectId || e.projectId === args.projectId) &&
                (args.mine === false || e.userId === s.user.id),
            )
            .map((e) => {
              const { elapsedSeconds, project, client } = describe(s, e);
              const person = [...s.members, ...(s.formerMembers || [])].find(
                (m) => (m.userId || m.id) === e.userId,
              );
              return {
                id: e.id,
                version: e.version,
                date: e.date,
                teamId: e.teamId,
                projectId: e.projectId,
                project,
                client,
                ...(args.mine === false ? { person: person?.name } : {}),
                task: e.task,
                notes: e.notes,
                durationSeconds: elapsedSeconds,
                billable: e.billable,
                status: e.status,
                running: Boolean(e.startedAt),
                agent: e.agent ?? null,
              };
            }),
        )
        .sort((a, b) => b.date.localeCompare(a.date));
      return {
        from,
        to,
        count: entries.length,
        entries: entries.slice(0, 200),
        ...(entries.length > 200
          ? { note: "Showing the newest 200. Narrow from/to to see more." }
          : {}),
      };
    },
  },
  {
    name: "update_entry",
    description:
      "Edit an existing time entry. Send only the fields to change. The current version is fetched automatically. Invoiced or paid entries are locked, and a running timer's date and duration cannot change until it stops.",
    inputSchema: {
      type: "object",
      properties: {
        entryId: { type: "string", description: "From list_entries." },
        ...entryFields,
        date: { type: "string", description: "YYYY-MM-DD." },
        durationMinutes: { type: "number", minimum: 0 },
        durationSeconds: { type: "integer", minimum: 0 },
        projectId: {
          type: "string",
          description: "Move to another project in the same team.",
        },
        agent: {
          ...agentSchema,
          type: ["object", "null"],
          description: "Replace the recorded agent usage, or null to clear it.",
        },
      },
      required: ["entryId"],
    },
    async run(args) {
      const changes = {
        ...optional(args, ["task", "notes", "billable", "projectId"]),
        ...(args.date !== undefined
          ? { date: isoDate(args.date, "date") }
          : {}),
      };
      const durationSeconds = seconds(args, false);
      if (durationSeconds !== undefined)
        changes.durationSeconds = durationSeconds;
      if (args.agent !== undefined) changes.agent = usage(args.agent);
      if (!Object.keys(changes).length)
        throw new ToolError("Provide at least one field to change.");
      return withVersion(args.entryId, async ({ s, entry: current }) => {
        const { entry } = await request(
          `/entries/${encodeURIComponent(args.entryId)}`,
          "PATCH",
          { ...changes, version: current.version },
        );
        return { updated: true, entry: describe(s, entry) };
      });
    },
  },
  {
    name: "delete_entry",
    description:
      "Permanently delete a stopped, unbilled time entry. Stop a running timer first. Invoiced or paid entries cannot be deleted.",
    inputSchema: {
      type: "object",
      properties: {
        entryId: { type: "string", description: "From list_entries." },
      },
      required: ["entryId"],
    },
    async run(args) {
      return withVersion(args.entryId, async ({ entry }) => {
        await request(
          `/entries/${encodeURIComponent(entry.id)}?version=${entry.version}`,
          "DELETE",
        );
        return { deleted: true, entryId: entry.id };
      });
    },
  },
  {
    name: "resume_timer",
    description:
      "Restart the timer on one of your existing unbilled entries, adding time to it. Any other running timer is stopped first.",
    inputSchema: {
      type: "object",
      properties: {
        entryId: { type: "string", description: "From list_entries." },
      },
      required: ["entryId"],
    },
    async run(args) {
      const { s, entry: current } = await findEntry(args.entryId);
      const { entry } = await request("/timer/start", "POST", {
        teamId: current.teamId,
        entryId: current.id,
      });
      return { started: true, entry: describe(s, entry) };
    },
  },
];

async function handle(message) {
  const { id, method, params = {} } = message;
  const reply = (result) =>
    id !== undefined && send({ jsonrpc: "2.0", id, result });
  const failure = (code, text) =>
    id !== undefined &&
    send({ jsonrpc: "2.0", id, error: { code, message: text } });
  if (!message || message.jsonrpc !== "2.0" || typeof method !== "string")
    return send({
      jsonrpc: "2.0",
      id: message?.id ?? null,
      error: { code: -32600, message: "Invalid request." },
    });
  if (method === "initialize")
    return reply({
      protocolVersion: VERSIONS.includes(params.protocolVersion)
        ? params.protocolVersion
        : VERSIONS[0],
      capabilities: { tools: {} },
      serverInfo: { name: "crops", title: "Crops", version: "0.1.0" },
      instructions:
        "Track time in Crops. Use list_projects for project ids, start_timer/stop_timer around work (or log_time afterwards), and attach your own token usage and USD cost as agent usage. Use list_entries to find existing entries, then update_entry, delete_entry, or resume_timer.",
    });
  if (method.startsWith("notifications/")) return;
  if (method === "ping") return reply({});
  if (method === "tools/list")
    return reply({
      tools: tools.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      })),
    });
  if (method === "tools/call") {
    const tool = tools.find((t) => t.name === params.name);
    if (!tool) return failure(-32602, `Unknown tool: ${params.name}`);
    try {
      const result = await tool.run(params.arguments || {});
      return reply({
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      });
    } catch (error) {
      if (!(error instanceof ToolError)) console.error("crops-mcp:", error);
      return reply({
        content: [
          {
            type: "text",
            text:
              error instanceof ToolError ? error.message : "Crops tool failed.",
          },
        ],
        isError: true,
      });
    }
  }
  return failure(-32601, `Method not found: ${method}`);
}

createInterface({ input: process.stdin, terminal: false }).on(
  "line",
  (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return send({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error." },
      });
    }
    handle(message).catch((error) => {
      console.error("crops-mcp:", error);
      if (message?.id !== undefined)
        send({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32603, message: "Internal error." },
        });
    });
  },
);
