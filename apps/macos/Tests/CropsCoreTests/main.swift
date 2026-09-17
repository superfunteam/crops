import Foundation
import CropsCore

// The standalone runner works with Command Line Tools; XCTest requires full Xcode.
var checks = 0
func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
    checks += 1
    if !condition() { fputs("FAIL: \(message)\n", stderr); exit(1) }
}

expect(CropsServer.resolvedOrigin(nil) == "https://crops.wims.vc", "fresh install uses canonical production origin")
expect(!CropsServer.needsMigration(nil), "fresh install does not migrate unrelated credentials")
expect(CropsServer.resolvedOrigin(CropsServer.previousProductionOrigin) == CropsServer.defaultOrigin && CropsServer.needsMigration(CropsServer.previousProductionOrigin), "exact old production origin migrates")
expect(CropsServer.resolvedOrigin(CropsServer.defaultOrigin) == CropsServer.defaultOrigin && !CropsServer.needsMigration(CropsServer.defaultOrigin), "canonical saved origin stays unchanged")
expect(CropsServer.resolvedOrigin("http://127.0.0.1:8787") == "http://127.0.0.1:8787" && !CropsServer.needsMigration("http://127.0.0.1:8787"), "preserve saved local development server")
expect(CropsServer.resolvedOrigin("https://time.example.com") == "https://time.example.com" && !CropsServer.needsMigration("https://time.example.com"), "preserve saved custom deployment")
let lookalike = CropsServer.previousProductionOrigin + ".example.com"
expect(CropsServer.resolvedOrigin(lookalike) == lookalike && !CropsServer.needsMigration(lookalike), "migration matches the entire origin only")

let idleMenu = CropsMenuStatus(signedIn: true, loaded: true, runningElapsed: nil, healthy: true)
expect(idleMenu.title == "0:00" && idleMenu.symbol == "pause.circle", "idle menu keeps a visible clock and distinct paused state")
let runningMenu = CropsMenuStatus(signedIn: true, loaded: true, runningElapsed: 3661, healthy: true)
expect(runningMenu.title == "1:01:01" && runningMenu.symbol == "play.circle.fill", "active menu shows live seconds and running state")
let offlineMenu = CropsMenuStatus(signedIn: true, loaded: true, runningElapsed: 3662, healthy: false)
expect(offlineMenu.title == "1:01:02" && offlineMenu.symbol == "exclamationmark.circle", "sync failures keep the last known timer advancing with a warning")
expect(CropsMenuStatus(signedIn: true, loaded: false, runningElapsed: nil, healthy: false).title == "—:—", "loading never claims the server timer is stopped")
expect(CropsMenuStatus(signedIn: false, loaded: false, runningElapsed: nil, healthy: false).title == "Crops", "signed-out app stays discoverable in menu bar")

let data = Data("""
{"id":"e1","teamId":"t1","userId":"u1","projectId":"p1","task":"Build","notes":"","date":"2026-09-15","durationSeconds":120,"startedAt":"2026-09-15T15:00:00.000Z","billable":true,"status":"unbilled","version":1}
""".utf8)
let entry = try JSONDecoder().decode(Entry.self, from: data)
let now = CropsTime.parseISO("2026-09-15T16:00:00Z")!
let previousReceivedAt = CropsTime.parseISO("2026-09-15T15:59:40Z")!
let previousServerTime = "2026-09-15T16:01:40.000Z"
expect(CropsTime.conditionalServerTime(serverHeader: "2026-09-15T16:02:00.125Z", httpDateHeader: "Tue, 15 Sep 2026 16:00:00 GMT", previousServerTime: previousServerTime, previousReceivedAt: previousReceivedAt, now: now) == "2026-09-15T16:02:00.125Z", "prefer precise database clock header")
expect(CropsTime.conditionalServerTime(serverHeader: nil, httpDateHeader: "Tue, 15 Sep 2026 16:00:00 GMT", previousServerTime: previousServerTime, previousReceivedAt: previousReceivedAt, now: now) == "2026-09-15T16:00:00.000Z", "Netlify 304 standard Date header fallback")
expect(CropsTime.conditionalServerTime(serverHeader: "invalid", httpDateHeader: "Tue, 15 Sep 2026 16:00:00 GMT", previousServerTime: previousServerTime, previousReceivedAt: previousReceivedAt, now: now) == "2026-09-15T16:00:00.000Z", "ignore invalid custom clock header")
expect(CropsTime.conditionalServerTime(serverHeader: nil, httpDateHeader: nil, previousServerTime: previousServerTime, previousReceivedAt: previousReceivedAt, now: now) == "2026-09-15T16:02:00.000Z", "missing clock headers preserve previous server offset while advancing time")
expect(entry.elapsed(at: now) == 3720, "absolute elapsed time survives one-hour sleep")
expect(entry.elapsed(at: now, serverOffset: -30) == 3690, "server clock adjustment")
expect(entry.elapsed(at: now, serverOffset: -4000) == 120, "future clock never subtracts saved time")
expect(CropsTime.parseDuration("1:30") == 5400, "colon duration")
expect(CropsTime.parseDuration("1.5") == 5400, "decimal duration")
expect(CropsTime.parseDuration("24:00") == 86400, "maximum duration")
for input in ["-1", "0", "1:75", "1:2:3", "25", "nan", "inf", "1:", ":30", "garbage", "99999999999999:30"] { expect(CropsTime.parseDuration(input) == nil, "reject invalid duration: \(input)") }
expect(CropsTime.parseDuration("1:30:15") == 5415, "hours, minutes, and seconds duration")
expect(CropsTime.parseDuration(" 0:45 ") == 2700, "trimmed colon duration")
for input in ["1:30:5", "1:3:15", "1:30:60", "1:-30", "-0:30", "1:30:15:00", "１:30", "25:00"] { expect(CropsTime.parseDuration(input) == nil, "reject invalid new-entry duration: \(input)") }
expect(CropsTime.parseDuration("0", maximumSeconds: 604800, allowZero: true) == 0 && CropsTime.parseDuration("0:00:00", maximumSeconds: 604800, allowZero: true) == 0, "edits may keep an empty timer")
expect(CropsTime.parseDuration("30:00", maximumSeconds: 604800) == 108000 && CropsTime.parseDuration("168:00", maximumSeconds: 604800) == 604800, "edits allow up to one week")
expect(CropsTime.parseDuration("168:00:01", maximumSeconds: 604800) == nil && CropsTime.parseDuration("169", maximumSeconds: 604800) == nil, "edits reject more than one week")
for seconds in [0.0, 60, 5400, 5415, 108000, 604800] { expect(CropsTime.parseDuration(CropsTime.durationText(seconds), maximumSeconds: 604800, allowZero: true) == Int(seconds), "duration text round-trips: \(seconds)") }
expect(CropsTime.durationText(5400) == "1:30" && CropsTime.durationText(5415) == "1:30:15", "duration text keeps seconds only when present")
expect(CropsTime.date(fromKey: "2026-09-15").map(CropsTime.dateKey) == "2026-09-15" && CropsTime.date(fromKey: "2026-02-30") == nil, "date keys round-trip in the local calendar")
expect(CropsTime.clock(3661) == "1:01:01", "second precision display")
expect(CropsTime.clock(3661, seconds: false) == "1:01", "minute precision display")
// Agent usage decoding and labels.
func decodeEntry(_ json: String) throws -> Entry { try JSONDecoder().decode(Entry.self, from: Data(json.utf8)) }
let stopped = #"{"id":"e 2/x","teamId":"t1","userId":"u1","projectId":"p1","task":"Build","notes":"Draft","date":"2026-09-14","durationSeconds":5400,"startedAt":null,"billable":true,"status":"unbilled","version":7"#
let withAgent = try decodeEntry(stopped + #","agent":{"tokens":2410000,"cost":31.4,"model":"claude-opus-5"}}"#)
expect(withAgent.agent == AgentUsage(tokens: 2410000, cost: 31.4, model: "claude-opus-5") && withAgent.agent?.label == "2.41M tokens · $31.40", "decode and label agent usage")
let withoutAgent = try decodeEntry(stopped + "}"), nullAgent = try decodeEntry(stopped + #","agent":null}"#)
expect(withoutAgent.agent == nil && nullAgent.agent == nil, "older servers and null usage decode")
let malformedAgent = try decodeEntry(stopped + #","agent":{"tokens":"many"}}"#)
expect(malformedAgent.agent == nil, "malformed usage never hides an entry")
let floatAgent = try decodeEntry(stopped + #","agent":{"tokens":1200.0,"cost":0}}"#)
expect(floatAgent.agent?.label == "1.2K tokens · $0.00", "tolerate float token counts and missing model")
expect(AgentUsage.compactTokens(999) == "999" && AgentUsage.compactTokens(1000) == "1K" && AgentUsage.compactTokens(125_000) == "125K" && AgentUsage.compactTokens(999_999) == "1M" && AgentUsage.compactTokens(3_000_000_000) == "3B", "compact token counts match the web app")
expect(AgentUsage.money(1234.5) == "$1,234.50", "USD cost label")

// Editing request bodies.
let unchangedBody = try EntryDraft(entry: withAgent).patchBody(for: withAgent)
expect(unchangedBody == nil, "unchanged edit sends nothing")
var draft = EntryDraft(entry: withAgent)
draft.task = "  Build API  "; draft.duration = "1:30:15"; draft.date = "2026-09-13"; draft.billable = false; draft.projectId = "p2"; draft.notes = "Draft"
let body = try draft.patchBody(for: withAgent) ?? [:]
expect(body["version"] as? Int == 7 && body["task"] as? String == "Build API" && body["durationSeconds"] as? Int == 5415 && body["date"] as? String == "2026-09-13" && body["billable"] as? Bool == false && body["projectId"] as? String == "p2", "edit body carries displayed version and changed fields")
expect(body["notes"] == nil && body.count == 6, "edit body omits unchanged fields")
draft = EntryDraft(entry: withAgent); draft.duration = "1.5"
let equivalentBody = try draft.patchBody(for: withAgent)
expect(equivalentBody == nil, "equivalent duration spelling is not a change")
draft.duration = "abc"
do { _ = try draft.patchBody(for: withAgent); expect(false, "invalid edit duration throws") } catch { expect(error as? EntryEditError == .invalidDuration, "invalid edit duration throws") }
let running = try decodeEntry(#"{"id":"e3","teamId":"t1","userId":"u1","projectId":"p1","task":"Live","notes":"","date":"2026-09-15","durationSeconds":60,"startedAt":"2026-09-15T15:00:00.000Z","billable":true,"status":"unbilled","version":3}"#)
draft = EntryDraft(entry: running); draft.task = "Live QA"; draft.duration = "9:00"; draft.date = "2026-09-01"
let runningBody = try draft.patchBody(for: running) ?? [:]
expect(runningBody["task"] as? String == "Live QA" && runningBody["version"] as? Int == 3 && runningBody["date"] == nil && runningBody["durationSeconds"] == nil, "running edits never send date or duration")
draft.duration = "garbage"
expect((try? draft.patchBody(for: running)) != nil, "running edits ignore the disabled duration field")
let invoiced = try decodeEntry(stopped.replacingOccurrences(of: "unbilled", with: "invoiced") + "}")
draft = EntryDraft(entry: invoiced); draft.task = "Changed"
do { _ = try draft.patchBody(for: invoiced); expect(false, "locked entries reject edits") } catch { expect(error.localizedDescription.contains("invoiced"), "locked entries reject edits with their reason") }
expect(EntryDraft.lockReason(withAgent) == nil && EntryDraft.lockReason(invoiced) != nil, "only invoiced/paid entries are locked")
expect(EntryDraft.canDelete(withAgent, userId: "u1") && !EntryDraft.canDelete(withAgent, userId: "u2") && !EntryDraft.canDelete(running, userId: "u1") && !EntryDraft.canDelete(invoiced, userId: "u1"), "delete only own stopped unbilled time")
expect(EntryDraft.path(for: withAgent) == "/api/entries/e%202%2Fx" && EntryDraft.deletePath(for: withAgent) == "/api/entries/e%202%2Fx?version=7", "entry paths encode ids and carry delete version")

let secureURL = try APIClient.validatedURL(" https://crops.example.com/ ")
let localURL = try APIClient.validatedURL("http://127.0.0.1:8787")
expect(secureURL.host == "crops.example.com", "normalize server origin")
expect(localURL.port == 8787, "allow local development")
for address in ["http://crops.example.com", "https://user:password@crops.example.com", "https://crops.example.com/api", "https://crops.example.com?secret=true", "javascript:alert(1)", "crops.example.com"] {
    var rejected = false
    do { _ = try APIClient.validatedURL(address) } catch { rejected = true }
    expect(rejected, "reject unsafe server: \(address)")
}
print("PASS: \(checks) native timer, duration, entry-editing, agent-usage, and server-security checks.")
