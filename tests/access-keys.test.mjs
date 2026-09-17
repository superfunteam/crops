import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "../server/db.mjs";
import { createApi } from "../server/api.mjs";
import { digest } from "../server/auth.mjs";

test("access keys authenticate integrations and webhooks with the owner’s current permissions", async (t) => {
  const env = { NODE_ENV: "test" };
  const db = await createDatabase({ dataDir: "memory://", env });
  t.after(() => db.close());
  const api = createApi({ db, env });
  const call = async (method, path, body, token, headers = {}) => {
    const response = await api(
      new Request(`http://localhost/api${path}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        ...(body === undefined
          ? {}
          : { body: typeof body === "string" ? body : JSON.stringify(body) }),
      }),
      { ip: "access-key-test" },
    );
    const raw = await response.text();
    return {
      status: response.status,
      body: raw ? JSON.parse(raw) : null,
      headers: response.headers,
    };
  };
  const ok = (r, status = 200) => {
    assert.equal(r.status, status, JSON.stringify(r.body));
    return r.body;
  };
  const owner = ok(
    await call("POST", "/auth/register", {
      username: "key-owner",
      password: "owner-password",
      name: "Owner",
      teamName: "Keys",
    }),
    201,
  );
  const other = ok(
    await call("POST", "/auth/register", {
      username: "key-other",
      password: "other-password",
      name: "Other",
      teamName: "Elsewhere",
    }),
    201,
  );
  const initial = ok(await call("GET", "/state", undefined, owner.token));
  const teamId = initial.team.id,
    projectId = initial.projects[0].id;
  let key, secret;

  await t.test(
    "creating a key returns its secret once and stores only a hash",
    async () => {
      assert.equal(
        (await call("POST", "/access-keys", { name: "" }, owner.token)).status,
        400,
      );
      assert.equal(
        (
          await call(
            "POST",
            "/access-keys",
            { name: "x", scope: "all" },
            owner.token,
          )
        ).status,
        400,
      );
      const created = ok(
        await call("POST", "/access-keys", { name: " Zapier " }, owner.token, {
          "Idempotency-Key": "create-key-0001",
        }),
        201,
      );
      ({ key, secret } = created);
      assert.match(secret, /^crops_[A-Za-z0-9_-]{43}$/);
      assert.deepEqual(Object.keys(key).sort(), [
        "createdAt",
        "id",
        "lastUsedAt",
        "name",
        "prefix",
      ]);
      assert.equal(key.name, "Zapier");
      assert.equal(key.prefix, secret.slice(0, 12));
      assert.equal(key.lastUsedAt, null);
      const stored = (
        await db.query("SELECT * FROM access_keys WHERE id=$1", [key.id])
      ).rows[0];
      assert.equal(stored.key_hash, digest(secret));
      assert.ok(!JSON.stringify(stored).includes(secret));
      assert.equal(
        (
          await db.query(
            "SELECT COUNT(*)::integer AS count FROM mutation_requests WHERE response::text LIKE $1",
            [`%${secret}%`],
          )
        ).rows[0].count,
        0,
        "Secrets never enter the replay store.",
      );
      const listed = ok(
        await call("GET", "/access-keys", undefined, owner.token),
      ).keys;
      assert.deepEqual(
        listed.map((k) => k.id),
        [key.id],
      );
      assert.ok(!JSON.stringify(listed).includes(secret));
      assert.deepEqual(
        ok(await call("GET", "/access-keys", undefined, other.token)).keys,
        [],
      );
    },
  );

  await t.test(
    "a key authenticates state and every entry mutation",
    async () => {
      const state = ok(await call("GET", "/state", undefined, secret));
      assert.equal(state.user.id, owner.user.id);
      const stamped = (
        await db.query("SELECT last_used_at FROM access_keys WHERE id=$1", [
          key.id,
        ])
      ).rows[0].last_used_at;
      assert.ok(stamped);
      ok(await call("GET", "/state", undefined, secret));
      assert.equal(
        (
          await db.query("SELECT last_used_at FROM access_keys WHERE id=$1", [
            key.id,
          ])
        ).rows[0].last_used_at.getTime(),
        stamped.getTime(),
        "Use is recorded at most once a minute.",
      );
      assert.ok(
        ok(await call("GET", "/access-keys", undefined, owner.token)).keys[0]
          .lastUsedAt,
      );
      const timer = ok(
        await call(
          "POST",
          "/timer/start",
          { teamId, projectId, task: "Key timer" },
          secret,
          { "Idempotency-Key": "key-timer-0001" },
        ),
      ).entry;
      const stopped = ok(
        await call("POST", "/timer/stop", { entryId: timer.id }, secret),
      ).entry;
      const edited = ok(
        await call(
          "PATCH",
          `/entries/${stopped.id}`,
          {
            version: stopped.version,
            notes: "Edited by key",
            durationSeconds: 600,
          },
          secret,
        ),
      ).entry;
      assert.equal(edited.notes, "Edited by key");
      ok(
        await call(
          "DELETE",
          `/entries/${edited.id}?version=${edited.version}`,
          undefined,
          secret,
        ),
      );
      ok(
        await call(
          "POST",
          "/entries",
          { teamId, projectId, date: "2026-09-16", durationSeconds: 60 },
          secret,
        ),
        201,
      );
      assert.equal(
        (
          await call(
            "GET",
            `/state?teamId=${ok(await call("GET", "/state", undefined, other.token)).team.id}`,
            undefined,
            secret,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await call("POST", "/entries", {}, undefined, {
            Cookie: `crops_session=${secret}`,
            Origin: "http://localhost",
          })
        ).status,
        401,
        "Keys are never accepted as cookies.",
      );
    },
  );

  await t.test("keys cannot manage keys, passwords, or sessions", async () => {
    for (const [method, path, body] of [
      ["GET", "/access-keys"],
      ["POST", "/access-keys", { name: "Escalate" }],
      ["DELETE", `/access-keys/${key.id}`],
      [
        "POST",
        "/auth/password",
        { currentPassword: "owner-password", newPassword: "hijacked-password" },
      ],
      ["POST", "/auth/logout", {}],
    ]) {
      const result = await call(method, path, body, secret);
      assert.equal(result.status, 403, `${method} ${path}`);
      assert.equal(result.body.code, "session_required");
    }
    ok(
      await call("POST", "/auth/login", {
        username: "key-owner",
        password: "owner-password",
      }),
    );
  });

  await t.test(
    "only the owner can revoke a key, and revoked or unknown keys return 401",
    async () => {
      const spare = ok(
        await call("POST", "/access-keys", { name: "Spare" }, owner.token),
        201,
      );
      assert.equal(
        (
          await call(
            "DELETE",
            `/access-keys/${spare.key.id}`,
            undefined,
            other.token,
          )
        ).status,
        404,
      );
      ok(await call("GET", "/state", undefined, spare.secret));
      ok(
        await call(
          "DELETE",
          `/access-keys/${spare.key.id}`,
          undefined,
          owner.token,
        ),
      );
      assert.equal(
        (
          await call(
            "DELETE",
            `/access-keys/${spare.key.id}`,
            undefined,
            owner.token,
          )
        ).status,
        404,
      );
      assert.equal(
        (await call("GET", "/state", undefined, spare.secret)).status,
        401,
      );
      assert.equal(
        (await call("POST", "/hooks", { action: "stop" }, spare.secret)).status,
        401,
      );
      assert.equal(
        (await call("GET", "/state", undefined, `crops_${"x".repeat(43)}`))
          .status,
        401,
      );
      assert.deepEqual(
        ok(await call("GET", "/access-keys", undefined, owner.token)).keys.map(
          (k) => k.id,
        ),
        [key.id],
      );
    },
  );

  await t.test(
    "webhooks run each action through the REST rules via a path secret or Bearer key",
    async () => {
      const hook = (body, via = "path", headers) =>
        via === "path"
          ? call("POST", `/hooks/${secret}`, body, undefined, headers)
          : call("POST", "/hooks", body, secret, headers);
      for (const via of ["path", "bearer"]) {
        const started = ok(
          await hook(
            {
              action: "start",
              projectId,
              task: `Hook ${via}`,
              notes: "From a webhook",
            },
            via,
          ),
        ).entry;
        assert.ok(started.startedAt);
        assert.equal(started.task, `Hook ${via}`);
        const stopped = ok(
          await hook({ action: "stop", agent: { tokens: 10, cost: 0.5 } }, via),
        ).entry;
        assert.equal(stopped.id, started.id);
        assert.equal(stopped.startedAt, null);
        assert.deepEqual(stopped.agent, { tokens: 10, cost: 0.5, model: null });
        assert.deepEqual(ok(await hook({ action: "stop" }, via)), {
          entry: null,
        });
        const toggledOn = ok(
          await hook({ action: "toggle", projectId }, via),
        ).entry;
        assert.ok(toggledOn.startedAt);
        const toggledOff = ok(
          await hook({ action: "toggle", projectId }, via),
        ).entry;
        assert.equal(toggledOff.id, toggledOn.id);
        assert.equal(toggledOff.startedAt, null);
        const resumed = ok(
          await hook({ action: "start", entryId: started.id }, via),
        ).entry;
        assert.equal(resumed.id, started.id);
        ok(await hook({ action: "stop", entryId: started.id }, via));
        const logged = ok(
          await hook(
            {
              action: "log",
              projectId,
              durationMinutes: 45,
              date: "2026-09-15",
              task: "Logged",
            },
            via,
          ),
          201,
        ).entry;
        assert.equal(logged.durationSeconds, 2700);
        assert.equal(logged.date, "2026-09-15");
        const updated = ok(
          await hook(
            {
              action: "update",
              entryId: logged.id,
              notes: "No version needed",
              durationMinutes: 30,
            },
            via,
          ),
        ).entry;
        assert.equal(updated.notes, "No version needed");
        assert.equal(updated.durationSeconds, 1800);
        assert.equal(updated.version, logged.version + 1);
        assert.equal(
          (
            await hook(
              {
                action: "update",
                entryId: logged.id,
                version: logged.version,
                notes: "Stale",
              },
              via,
            )
          ).body.code,
          "version_conflict",
        );
        assert.equal(
          (await hook({ action: "update", entryId: logged.id, teamId }, via))
            .status,
          400,
          "PATCH field validation applies.",
        );
        assert.deepEqual(
          ok(await hook({ action: "delete", entryId: logged.id }, via)),
          { ok: true },
        );
        assert.equal(
          (await hook({ action: "delete", entryId: logged.id }, via)).status,
          404,
        );
      }
      const plain = ok(
        await call(
          "POST",
          `/hooks/${secret}`,
          JSON.stringify({ action: "log", projectId, durationSeconds: 60 }),
          undefined,
          { "Content-Type": "text/plain" },
        ),
        201,
      ).entry;
      assert.equal(plain.date, new Date().toISOString().slice(0, 10));
      for (const timezone of ["Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
        const zoned = ok(
          await hook(
            { action: "log", projectId, durationSeconds: 60, timezone },
            "path",
          ),
          201,
        ).entry;
        assert.equal(
          zoned.date,
          new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
            new Date(),
          ),
        );
      }
      assert.equal(
        (
          await hook(
            {
              action: "log",
              projectId,
              durationSeconds: 60,
              timezone: "Mars/Olympus",
            },
            "path",
          )
        ).status,
        400,
      );
      const replayHeaders = { "Idempotency-Key": "hook-log-00000001" };
      const first = ok(
        await hook(
          { action: "log", projectId, durationSeconds: 90 },
          "path",
          replayHeaders,
        ),
        201,
      ).entry;
      assert.equal(
        ok(
          await hook(
            { action: "log", projectId, durationSeconds: 90 },
            "bearer",
            replayHeaders,
          ),
          201,
        ).entry.id,
        first.id,
      );
      assert.equal(
        (
          await hook(
            { action: "log", projectId, durationSeconds: 91 },
            "path",
            replayHeaders,
          )
        ).status,
        409,
      );
    },
  );

  await t.test(
    "webhooks reject bad credentials, actions, and foreign data",
    async () => {
      assert.equal(
        (await call("POST", "/hooks/not-a-key", { action: "stop" })).status,
        401,
      );
      assert.equal(
        (
          await call("POST", `/hooks/crops_${"y".repeat(43)}`, {
            action: "stop",
          })
        ).status,
        401,
      );
      assert.equal(
        (await call("POST", "/hooks", { action: "stop" }, owner.token)).status,
        401,
        "Sessions do not authenticate webhooks.",
      );
      assert.equal(
        (
          await call("POST", "/hooks", { action: "stop" }, undefined, {
            Cookie: `crops_session=${owner.token}`,
            Origin: "http://localhost",
          })
        ).status,
        401,
      );
      assert.equal((await call("GET", `/hooks/${secret}`)).status, 405);
      assert.equal(
        (await call("POST", `/hooks/${secret}`, { action: "explode" })).body
          .code,
        "invalid_action",
      );
      assert.equal(
        (
          await call("POST", `/hooks/${secret}`, {
            action: "update",
            notes: "Which?",
          })
        ).status,
        400,
      );
      const foreign = ok(await call("GET", "/state", undefined, other.token));
      assert.equal(
        (
          await call("POST", `/hooks/${secret}`, {
            action: "start",
            projectId: foreign.projects[0].id,
          })
        ).body.code,
        "invalid_project",
      );
      assert.equal(
        (
          await call("POST", `/hooks/${secret}`, {
            action: "log",
            projectId: foreign.projects[0].id,
            durationSeconds: 60,
            teamId: foreign.team.id,
          })
        ).status,
        403,
      );
      const theirs = ok(
        await call(
          "POST",
          "/entries",
          {
            teamId: foreign.team.id,
            projectId: foreign.projects[0].id,
            date: "2026-09-16",
            durationSeconds: 60,
          },
          other.token,
        ),
        201,
      ).entry;
      assert.equal(
        (
          await call("POST", `/hooks/${secret}`, {
            action: "delete",
            entryId: theirs.id,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await call("POST", `/hooks/${secret}`, {
            action: "update",
            entryId: theirs.id,
            notes: "Mine now",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await call("POST", `/hooks/${secret}`, {
            action: "start",
            entryId: theirs.id,
          })
        ).status,
        404,
      );
    },
  );

  await t.test(
    "keys follow team removal and admin password resets",
    async () => {
      const added = ok(
        await call(
          "POST",
          "/members",
          {
            teamId,
            username: "key-member",
            name: "Member",
            password: "member-password",
          },
          owner.token,
        ),
        201,
      ).member;
      const session = ok(
        await call("POST", "/auth/login", {
          username: "key-member",
          password: "member-password",
        }),
      );
      const memberKey = ok(
        await call("POST", "/access-keys", { name: "Shortcut" }, session.token),
        201,
      ).secret;
      const entry = ok(
        await call("POST", `/hooks/${memberKey}`, {
          action: "log",
          projectId,
          durationSeconds: 120,
        }),
        201,
      ).entry;
      const ownersEntry = ok(
        await call(
          "POST",
          "/entries",
          { teamId, projectId, date: "2026-09-16", durationSeconds: 60 },
          owner.token,
        ),
        201,
      ).entry;
      assert.equal(
        (
          await call("POST", `/hooks/${memberKey}`, {
            action: "update",
            entryId: ownersEntry.id,
            notes: "Nope",
          })
        ).status,
        403,
        "A member key cannot edit an admin’s time.",
      );
      ok(await call("DELETE", `/members/${added.id}`, undefined, owner.token));
      assert.equal(
        (await call("GET", `/state?teamId=${teamId}`, undefined, memberKey))
          .status,
        403,
      );
      assert.equal(
        (
          await call("POST", `/hooks/${memberKey}`, {
            action: "log",
            projectId,
            durationSeconds: 60,
          })
        ).body.code,
        "invalid_project",
      );
      assert.equal(
        (
          await call("POST", `/hooks/${memberKey}`, {
            action: "delete",
            entryId: entry.id,
          })
        ).status,
        403,
      );
      const rejoined = ok(
        await call(
          "POST",
          "/members",
          { teamId, username: "key-member" },
          owner.token,
        ),
        201,
      ).member;
      ok(await call("GET", `/state?teamId=${teamId}`, undefined, memberKey));
      ok(
        await call(
          "POST",
          `/members/${rejoined.id}/password`,
          { currentPassword: "owner-password", newPassword: "reset-password" },
          owner.token,
        ),
      );
      assert.equal(
        (await call("GET", "/state", undefined, memberKey)).status,
        401,
        "An admin password reset revokes the member’s keys.",
      );
      ok(await call("GET", "/state", undefined, secret));
      ok(
        await call(
          "POST",
          "/auth/password",
          {
            currentPassword: "owner-password",
            newPassword: "new-owner-password",
          },
          owner.token,
        ),
      );
      assert.equal(
        (await call("GET", "/state", undefined, secret)).status,
        200,
        "Changing your own password keeps your keys; revoke them in Settings.",
      );
    },
  );

  await t.test("webhooks are rate limited per key", async () => {
    const limited = ok(
      await call("POST", "/access-keys", { name: "Burst" }, owner.token),
      201,
    ).secret;
    await db.query(
      "INSERT INTO auth_limits(key,count,reset_at) VALUES($1,120,now()+interval '1 minute')",
      [digest(`hook-key:${digest(limited)}`)],
    );
    const result = await call("POST", `/hooks/${limited}`, { action: "stop" });
    assert.equal(result.status, 429);
    assert.equal(result.headers.get("retry-after"), "60");
    ok(await call("POST", `/hooks/${secret}`, { action: "stop" }));
  });
});
