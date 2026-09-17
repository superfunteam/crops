import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "../server/db.mjs";
import { createApi } from "../server/api.mjs";

test("agent-reported usage is validated, versioned, locked with billing, and synchronized", async (t) => {
  const env = { NODE_ENV: "test" };
  const db = await createDatabase({ dataDir: "memory://", env });
  t.after(() => db.close());
  const api = createApi({ db, env });
  const call = async (method, path, body, token) => {
    const response = await api(
      new Request(`http://localhost/api${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      { ip: "agent-usage-test" },
    );
    return { status: response.status, body: await response.json() };
  };
  const ok = (r, status = 200) => {
    assert.equal(r.status, status, JSON.stringify(r.body));
    return r.body;
  };
  const owner = ok(
    await call("POST", "/auth/register", {
      username: "agent-owner",
      password: "owner-password",
      name: "Owner",
      teamName: "Agents",
    }),
    201,
  );
  const state = () => call("GET", "/state", null, owner.token).then(ok);
  const initial = await state();
  const teamId = initial.team.id,
    projectId = initial.projects[0].id;
  const usage = { tokens: 2410000, cost: 31.4, model: "claude-opus-5" };
  const manual = (overrides = {}) =>
    call(
      "POST",
      "/entries",
      {
        teamId,
        projectId,
        task: "Agent",
        date: "2026-09-16",
        durationSeconds: 1800,
        billable: true,
        ...overrides,
      },
      owner.token,
    );

  await t.test("manual entries store usage and state returns it", async () => {
    const plain = ok(await manual(), 201).entry;
    assert.equal(plain.agent, null);
    const entry = ok(await manual({ agent: usage }), 201).entry;
    assert.deepEqual(entry.agent, usage);
    assert.deepEqual(
      ok(await manual({ agent: { tokens: 10, cost: 0 } }), 201).entry.agent,
      { tokens: 10, cost: 0, model: null },
    );
    const listed = (await state()).entries.find((e) => e.id === entry.id);
    assert.deepEqual(listed.agent, usage);
  });

  await t.test("rejects malformed usage with invalid_input", async () => {
    for (const agent of [
      { tokens: -1, cost: 1 },
      { tokens: 1.5, cost: 1 },
      { tokens: "10", cost: 1 },
      { tokens: 10 },
      { cost: 1 },
      { tokens: 10, cost: -0.01 },
      { tokens: 10, cost: 1.234 },
      { tokens: 10, cost: "1.00" },
      { tokens: 10, cost: 1, model: "m".repeat(101) },
      { tokens: 10, cost: 1, model: 5 },
      { tokens: 10, cost: 1, extra: true },
      [10, 1],
      "usage",
      0,
    ]) {
      const response = await manual({ agent });
      assert.equal(response.status, 400, JSON.stringify(agent));
      assert.equal(response.body.code, "invalid_input");
    }
  });

  await t.test(
    "timers accept usage on start and stop without double-bumping replays",
    async () => {
      const started = ok(
        await call(
          "POST",
          "/timer/start",
          {
            teamId,
            projectId,
            task: "Session",
            agent: { tokens: 5, cost: 0.01 },
          },
          owner.token,
        ),
      ).entry;
      assert.deepEqual(started.agent, { tokens: 5, cost: 0.01, model: null });
      assert.equal(
        (
          await call(
            "POST",
            "/timer/stop",
            { entryId: started.id, agent: { tokens: 1, cost: 0.001 } },
            owner.token,
          )
        ).status,
        400,
      );
      assert.equal(
        (await state()).runningEntry.id,
        started.id,
        "Invalid usage must not stop the timer.",
      );
      const stopped = ok(
        await call(
          "POST",
          "/timer/stop",
          { entryId: started.id, version: started.version, agent: usage },
          owner.token,
        ),
      ).entry;
      assert.equal(stopped.startedAt, null);
      assert.deepEqual(stopped.agent, usage);
      const again = ok(
        await call(
          "POST",
          "/timer/stop",
          { entryId: started.id, agent: usage },
          owner.token,
        ),
      ).entry;
      assert.deepEqual(again, stopped);
      const updated = ok(
        await call(
          "POST",
          "/timer/stop",
          {
            entryId: started.id,
            agent: { ...usage, tokens: usage.tokens + 1 },
          },
          owner.token,
        ),
      ).entry;
      assert.equal(updated.version, stopped.version + 1);
      assert.equal(updated.durationSeconds, stopped.durationSeconds);
      assert.equal(updated.agent.tokens, usage.tokens + 1);
    },
  );

  await t.test(
    "PATCH updates and clears usage with version checks",
    async () => {
      let entry = ok(await manual(), 201).entry;
      assert.equal(
        (
          await call(
            "PATCH",
            `/entries/${entry.id}`,
            { version: entry.version + 1, agent: usage },
            owner.token,
          )
        ).body.code,
        "version_conflict",
      );
      entry = ok(
        await call(
          "PATCH",
          `/entries/${entry.id}`,
          { version: entry.version, agent: usage },
          owner.token,
        ),
      ).entry;
      assert.deepEqual(entry.agent, usage);
      assert.equal(entry.version, 2);
      assert.equal(
        (
          await call(
            "PATCH",
            `/entries/${entry.id}`,
            {
              version: entry.version,
              agent: { tokens: 1, cost: 1, model: "" },
            },
            owner.token,
          )
        ).body.entry.agent.model,
        null,
      );
      entry = (await state()).entries.find((e) => e.id === entry.id);
      entry = ok(
        await call(
          "PATCH",
          `/entries/${entry.id}`,
          { version: entry.version, agent: null },
          owner.token,
        ),
      ).entry;
      assert.equal(entry.agent, null);
      assert.equal(
        (
          await call(
            "PATCH",
            `/entries/${entry.id}`,
            { version: entry.version, agent: { tokens: 1 } },
            owner.token,
          )
        ).status,
        400,
      );
    },
  );

  await t.test("invoiced time locks usage until marked unbilled", async () => {
    let entry = ok(await manual({ agent: usage }), 201).entry;
    entry = ok(
      await call(
        "PATCH",
        `/entries/${entry.id}`,
        { version: entry.version, status: "invoiced" },
        owner.token,
      ),
    ).entry;
    for (const agent of [null, { tokens: 1, cost: 1 }]) {
      const locked = await call(
        "PATCH",
        `/entries/${entry.id}`,
        { version: entry.version, agent },
        owner.token,
      );
      assert.equal(locked.status, 409);
      assert.equal(locked.body.code, "entry_locked");
    }
    const stop = await call(
      "POST",
      "/timer/stop",
      { entryId: entry.id, agent: { tokens: 1, cost: 1 } },
      owner.token,
    );
    assert.equal(stop.body.code, "entry_locked");
    assert.deepEqual(
      ok(
        await call(
          "POST",
          "/timer/stop",
          { entryId: entry.id, agent: usage },
          owner.token,
        ),
      ).entry.agent,
      usage,
      "Repeating the recorded usage is an idempotent no-op.",
    );
    entry = ok(
      await call(
        "PATCH",
        `/entries/${entry.id}`,
        { version: entry.version, status: "unbilled" },
        owner.token,
      ),
    ).entry;
    entry = ok(
      await call(
        "PATCH",
        `/entries/${entry.id}`,
        { version: entry.version, agent: null },
        owner.token,
      ),
    ).entry;
    assert.equal(entry.agent, null);
  });

  await t.test("the database rejects partial usage rows", async () => {
    const entry = ok(await manual(), 201).entry;
    await assert.rejects(
      db.query("UPDATE entries SET agent_cost=1 WHERE id=$1", [entry.id]),
    );
    await assert.rejects(
      db.query("UPDATE entries SET agent_model='x' WHERE id=$1", [entry.id]),
    );
  });
});
