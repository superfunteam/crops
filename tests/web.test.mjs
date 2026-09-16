import test from "node:test";
import assert from "node:assert/strict";
import {
  parseDuration,
  time,
  duration,
  weekDates,
  addDays,
  dateKey,
} from "../web/src/lib.ts";

test("editing a duration retains every second", () => {
  for (const seconds of [1, 37, 59, 60, 3661, 604800])
    assert.equal(parseDuration(time(seconds, true)), seconds);
});
test("manual time accepts hours and rejects invalid clock segments", () => {
  assert.equal(parseDuration("1.5"), 5400);
  assert.equal(parseDuration("2:30"), 9000);
  for (const invalid of ["1:60", "2:10:99", "-1", "abc", "", "Infinity"])
    assert.throws(() => parseDuration(invalid));
});
test("server timestamps survive a suspended client without losing elapsed time", () => {
  const entry = { durationSeconds: 90, startedAt: "2026-09-15T12:00:00.000Z" };
  assert.equal(duration(entry, Date.parse("2026-09-15T13:00:00.000Z")), 3690);
  assert.equal(duration(entry, Date.parse("2026-09-15T11:59:00.000Z")), 90);
  assert.equal(duration({ ...entry, startedAt: null }, Date.now()), 90);
});
test("local calendar arithmetic stays on the right day through DST and year boundaries", () => {
  assert.equal(addDays("2026-03-08", 1), "2026-03-09");
  assert.equal(addDays("2026-11-01", 1), "2026-11-02");
  assert.deepEqual(weekDates("2027-01-01"), [
    "2026-12-28",
    "2026-12-29",
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
    "2027-01-03",
  ]);
});
test("transport retries reuse the same idempotency key", async () => {
  const original = globalThis.fetch;
  const attempts = [];
  globalThis.fetch = async (url, options) => {
    attempts.push(options);
    if (attempts.length === 1) throw Error("Connection dropped");
    return Response.json({ entry: { id: "same-entry" } });
  };
  try {
    const { api } = await import("../web/src/api.ts");
    const result = await api("/entries", "POST", { durationSeconds: 60 });
    assert.equal(result.entry.id, "same-entry");
    assert.equal(attempts.length, 2);
    assert.ok(attempts[0].headers["Idempotency-Key"]);
    assert.equal(
      attempts[0].headers["Idempotency-Key"],
      attempts[1].headers["Idempotency-Key"],
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("unchanged state reuses cached data with fresh server time; auth clears cache", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(options);
    if (calls.length === 1)
      return Response.json(
        { user: { id: "a" }, serverTime: "2026-01-01T00:00:00Z" },
        { headers: { ETag: '"v1"' } },
      );
    if (calls.length === 2)
      return new Response(null, {
        status: 304,
        headers: { "X-Crops-Server-Time": "2026-01-01T00:00:05Z" },
      });
    return Response.json({ ok: true });
  };
  try {
    const { api } = await import("../web/src/api.ts");
    await api("/state?teamId=test");
    const reused = await api("/state?teamId=test");
    assert.equal(reused.user.id, "a");
    assert.equal(reused.serverTime, "2026-01-01T00:00:05Z");
    assert.equal(calls[1].headers["If-None-Match"], '"v1"');
    await api("/auth/logout", "POST");
    await api("/state?teamId=test");
    assert.equal(calls[3].headers["If-None-Match"], undefined);
  } finally {
    globalThis.fetch = original;
  }
});

test("CDN-generated 304 responses keep the clock moving when custom headers are stripped", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = Date.parse("2026-09-15T20:00:00Z");
  let count = 0;
  Date.now = () => now;
  globalThis.fetch = async () => {
    if (++count === 1)
      return Response.json(
        { serverTime: "2026-09-15T20:00:02Z", entries: [] },
        { headers: { ETag: '"cdn-df"' } },
      );
    if (count === 2)
      return new Response(null, {
        status: 304,
        headers: { Date: "Tue, 15 Sep 2026 20:00:07 GMT" },
      });
    return new Response(null, { status: 304 });
  };
  try {
    const { api } = await import("../web/src/api.ts");
    await api("/state?teamId=cdn-clock");
    now += 5000;
    assert.equal(
      (await api("/state?teamId=cdn-clock")).serverTime,
      "2026-09-15T20:00:07.000Z",
    );
    now += 5000;
    assert.equal(
      (await api("/state?teamId=cdn-clock")).serverTime,
      "2026-09-15T20:00:12.000Z",
    );
    now += 5000;
    assert.equal(
      (await api("/state?teamId=cdn-clock")).serverTime,
      "2026-09-15T20:00:17.000Z",
    );
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});
