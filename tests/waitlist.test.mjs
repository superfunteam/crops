import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "../server/db.mjs";
import { createApi } from "../server/api.mjs";

test("the early-access waitlist counts down spots, dedupes emails, and rate limits", async (t) => {
  const env = { NODE_ENV: "test", CROPS_WAITLIST_SPOTS: "3" };
  const db = await createDatabase({ dataDir: "memory://", env });
  t.after(() => db.close());
  const api = createApi({ db, env });
  const call = async (method, body, ip = "waitlist-test") => {
    const response = await api(
      new Request("http://localhost/api/waitlist", {
        method,
        ...(body === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
      }),
      { ip },
    );
    return { status: response.status, body: await response.json() };
  };

  assert.deepEqual((await call("GET")).body, {
    spots: 3,
    claimed: 0,
    remaining: 3,
  });
  const first = await call("POST", { email: "Ada@Example.com " });
  assert.equal(first.status, 201);
  assert.deepEqual(first.body, {
    joined: true,
    position: 1,
    spots: 3,
    claimed: 1,
    remaining: 2,
  });
  const again = await call("POST", { email: "ada@example.com" });
  assert.equal(again.status, 200);
  assert.equal(again.body.joined, false);
  assert.equal(again.body.position, 1);
  assert.equal(again.body.remaining, 2);
  for (const email of ["not-an-email", "a@b", "", "x".repeat(250) + "@a.co"])
    assert.equal((await call("POST", { email })).status, 400, email);
  await call("POST", { email: "grace@example.com" });
  await call("POST", { email: "linus@example.com" });
  const full = await call("POST", { email: "margaret@example.com" });
  assert.deepEqual(
    {
      joined: full.body.joined,
      position: full.body.position,
      remaining: full.body.remaining,
    },
    { joined: true, position: 4, remaining: 0 },
  );
  assert.equal((await call("GET")).body.remaining, 0);

  const statuses = [];
  for (let i = 0; i < 11; i++)
    statuses.push(
      (await call("POST", { email: `burst${i}@example.com` }, "busy-network"))
        .status,
    );
  assert.equal(statuses.at(-1), 429);
  assert.ok(statuses.slice(0, 10).every((s) => s === 201));
});
