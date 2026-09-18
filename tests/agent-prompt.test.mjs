import test from "node:test";
import assert from "node:assert/strict";
import { agentTriggers, buildAgentPrompt } from "../web/src/agentPrompt.ts";
import { createDatabase } from "../server/db.mjs";
import { createApi } from "../server/api.mjs";

test("generated agent prompt posts usage to its chosen client without touching the timer, and retries once", async (t) => {
  const env = { NODE_ENV: "test" };
  const db = await createDatabase({ dataDir: "memory://", env });
  t.after(() => db.close());
  const api = createApi({ db, env });
  async function call(path, body, token, key) {
    const response = await api(
      new Request(`http://localhost/api${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      { ip: "prompt-test" },
    );
    assert.ok(response.ok, await response.clone().text());
    return response.json();
  }
  const owner = await call("/auth/register", {
    username: "prompt-owner",
    password: "test-password",
    name: "Owner",
    teamName: "Prompt team",
  });
  const initial = await call("/state", null, owner.token);
  const project = initial.projects[0];
  const config = {
    origin: "https://crops.wims.vc",
    teamId: initial.team.id,
    teamName: initial.team.name,
    clientId: project.clientId,
    clientName: 'Client "quoted"\ntext',
    projectId: project.id,
    projectName: project.name,
    trigger: "push",
    timezone: "America/Chicago",
    billable: false,
  };
  for (const trigger of Object.keys(agentTriggers)) {
    const prompt = buildAgentPrompt({ ...config, trigger });
    assert.ok(prompt.includes(agentTriggers[trigger].instruction));
    assert.ok(prompt.includes(JSON.stringify(config.clientName)));
    assert.ok(prompt.includes("24 hours"));
    assert.ok(prompt.includes("ALLOCATED SUBSCRIPTION COST"));
    assert.ok(
      prompt.includes(
        "A weekly-cap percentage is NOT the same percentage of a monthly subscription",
      ),
    );
    assert.ok(prompt.includes("Never substitute API token prices"));
    assert.ok(
      prompt.includes("do not overlap or exceed the actual subscription cost"),
    );
  }
  const subscription = {
    plan: "Example plan",
    feeUsd: 200,
    periodStart: "2026-09-01",
    periodEnd: "2026-10-01",
    scope: "individual",
    capacityHours: 100,
  };
  const configured = buildAgentPrompt({ ...config, subscription });
  const embedded = JSON.parse(
    configured.match(/repeat or reconfirm them:\n(\{[\s\S]*?\})/)[1],
  );
  for (const [key, value] of Object.entries(subscription))
    assert.equal(embedded[key], value);
  assert.ok(
    configured.includes("mark caps/remaining capacity unknown and proceed"),
  );
  assert.ok(!configured.includes("No subscription details were supplied"));
  const prompt = buildAgentPrompt(config);
  const payload = JSON.parse(prompt.match(/```json\n([\s\S]*?)\n```/)[1]);
  payload.agent = { tokens: 12500, cost: 0.14, model: "test-model" };
  payload.notes = "ESTIMATED; fixture window; report prompt-test-window";
  const access = await call(
    "/access-keys",
    { name: "Prompt test" },
    owner.token,
  );
  const running = await call(
    "/timer/start",
    { teamId: initial.team.id, projectId: project.id },
    owner.token,
  );
  const first = await call(
    "/hooks",
    payload,
    access.secret,
    "prompt-test-window",
  );
  const retry = await call(
    "/hooks",
    payload,
    access.secret,
    "prompt-test-window",
  );
  assert.equal(first.entry.id, retry.entry.id);
  assert.equal(first.entry.durationSeconds, 0);
  assert.equal(first.entry.billable, false);
  assert.deepEqual(first.entry.agent, payload.agent);
  const after = await call("/state", null, owner.token);
  assert.equal(after.entries.filter((e) => e.id === first.entry.id).length, 1);
  assert.equal(after.runningEntry.id, running.entry.id);
  assert.equal(
    after.projects.find((p) => p.id === first.entry.projectId).clientId,
    config.clientId,
  );
});
