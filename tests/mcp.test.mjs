import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { createDatabase } from "../server/db.mjs";
import { createApi } from "../server/api.mjs";

const script = fileURLToPath(new URL("../mcp/crops-mcp.mjs", import.meta.url));

async function startApi(t) {
  const env = { NODE_ENV: "test" };
  const db = await createDatabase({ dataDir: "memory://", env });
  const api = createApi({ db, env });
  const requests = [];
  const server = createServer(async (incoming, outgoing) => {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers))
      headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    requests.push({ method: incoming.method, url: incoming.url, headers });
    const hasBody = !["GET", "HEAD"].includes(incoming.method);
    const response = await api(
      new Request(`http://${incoming.headers.host}${incoming.url}`, {
        method: incoming.method,
        headers,
        ...(hasBody ? { body: Buffer.concat(chunks) } : {}),
      }),
      { ip: "mcp-test" },
    );
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  });
  return { url: `http://127.0.0.1:${server.address().port}`, requests };
}

function startMcp(t, env) {
  const child = spawn(process.execPath, [script], {
    env: {
      ...process.env,
      CROPS_TOKEN: "",
      CROPS_USERNAME: "",
      CROPS_PASSWORD: "",
      ...env,
    },
    stdio: ["pipe", "pipe", "inherit"],
  });
  t.after(() => child.kill());
  const pending = new Map();
  createInterface({ input: child.stdout }).on("line", (line) => {
    const message = JSON.parse(line);
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  });
  let next = 1;
  const rpc = (method, params) =>
    new Promise((resolve) => {
      const id = next++;
      pending.set(id, resolve);
      child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
      );
    });
  const call = async (name, args = {}) => {
    const response = await rpc("tools/call", { name, arguments: args });
    assert.ok(response.result, JSON.stringify(response));
    const text = response.result.content[0].text;
    return response.result.isError ? { error: text } : JSON.parse(text);
  };
  const notify = (method) =>
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n");
  return { rpc, call, notify };
}

test("MCP server tracks agent time and usage against a real Crops API", async (t) => {
  const { url, requests } = await startApi(t);
  const register = await fetch(`${url}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "mcp-agent",
      password: "agent-password",
      name: "Agent",
      teamName: "Agent studio",
    }),
  });
  assert.equal(register.status, 201);
  const { token } = await register.json();
  const mcp = startMcp(t, {
    CROPS_URL: `${url}/`,
    CROPS_USERNAME: "mcp-agent",
    CROPS_PASSWORD: "agent-password",
  });

  const init = await mcp.rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  });
  assert.equal(init.result.protocolVersion, "2025-06-18");
  assert.deepEqual(init.result.capabilities, { tools: {} });
  assert.equal(init.result.serverInfo.name, "crops");
  mcp.notify("notifications/initialized");
  assert.deepEqual((await mcp.rpc("ping")).result, {});
  assert.equal((await mcp.rpc("nope")).error.code, -32601);
  const { tools } = (await mcp.rpc("tools/list")).result;
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [
    "current_timer",
    "list_projects",
    "log_time",
    "report_agent_usage",
    "start_timer",
    "stop_timer",
  ]);
  assert.ok(
    tools.every(
      (tool) => tool.inputSchema.type === "object" && tool.description,
    ),
  );

  const [workspace] = await mcp.call("list_projects");
  assert.equal(workspace.team.name, "Agent studio");
  const projectId = workspace.projects[0].id;
  assert.ok(projectId);
  assert.deepEqual(await mcp.call("current_timer"), { running: false });

  const started = await mcp.call("start_timer", {
    projectId,
    task: "Build",
    notes: "Refactor billing",
  });
  assert.equal(started.entry.projectId, projectId);
  assert.ok(started.entry.startedAt);
  assert.equal((await mcp.call("current_timer")).entry.id, started.entry.id);

  const stopped = await mcp.call("stop_timer", {
    agent: { tokens: 2410000, cost: 31.4, model: "claude-opus-5" },
  });
  assert.equal(stopped.entry.id, started.entry.id);
  assert.equal(stopped.entry.startedAt, null);
  assert.deepEqual(stopped.entry.agent, {
    tokens: 2410000,
    cost: 31.4,
    model: "claude-opus-5",
  });
  assert.match((await mcp.call("stop_timer")).error, /No timer is running/);

  const logged = await mcp.call("log_time", {
    projectId,
    durationMinutes: 45,
    date: "2026-09-16",
    task: "Review",
    billable: true,
    agent: { tokens: 1200, cost: 0.123 },
  });
  assert.equal(logged.entry.durationSeconds, 2700);
  assert.deepEqual(logged.entry.agent, {
    tokens: 1200,
    cost: 0.12,
    model: null,
  });

  const added = await mcp.call("report_agent_usage", {
    entryId: logged.entry.id,
    tokens: 800,
    cost: 0.5,
    model: "claude-opus-5",
  });
  assert.deepEqual(added.entry.agent, {
    tokens: 2000,
    cost: 0.62,
    model: "claude-opus-5",
  });
  const replaced = await mcp.call("report_agent_usage", {
    entryId: logged.entry.id,
    tokens: 5,
    cost: 1,
    mode: "set",
  });
  assert.deepEqual(replaced.entry.agent, { tokens: 5, cost: 1, model: null });

  assert.match(
    (await mcp.call("log_time", { projectId })).error,
    /durationMinutes or durationSeconds/,
  );
  assert.match(
    (
      await mcp.call("log_time", {
        projectId,
        durationSeconds: 60,
        agent: { tokens: -1, cost: 1 },
      })
    ).error,
    /nonnegative integer/,
  );
  assert.match(
    (await mcp.call("start_timer", { projectId: "missing" })).error,
    /not found/,
  );

  const state = await (
    await fetch(`${url}/api/state`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  assert.deepEqual(
    state.entries.find((e) => e.id === started.entry.id).agent,
    stopped.entry.agent,
  );
  const mutations = requests.filter(
    (r) => r.method === "POST" && !r.url.startsWith("/api/auth/"),
  );
  assert.equal(mutations.length, 3);
  assert.ok(
    mutations.every((r) =>
      /^[0-9a-f-]{36}$/.test(r.headers.get("idempotency-key")),
    ),
  );
  assert.equal(
    requests.filter((r) => r.url === "/api/auth/login").length,
    1,
    "The session token is cached.",
  );

  const byToken = startMcp(t, { CROPS_URL: url, CROPS_TOKEN: token });
  await byToken
    .rpc("initialize", { protocolVersion: "1999-01-01" })
    .then((r) => assert.equal(r.result.protocolVersion, "2025-06-18"));
  assert.equal(
    (await byToken.call("list_projects"))[0].projects[0].id,
    projectId,
  );
});
