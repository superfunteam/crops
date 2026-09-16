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
expect(CropsTime.clock(3661) == "1:01:01", "second precision display")
expect(CropsTime.clock(3661, seconds: false) == "1:01", "minute precision display")
let secureURL = try APIClient.validatedURL(" https://crops.example.com/ ")
let localURL = try APIClient.validatedURL("http://127.0.0.1:8787")
expect(secureURL.host == "crops.example.com", "normalize server origin")
expect(localURL.port == 8787, "allow local development")
for address in ["http://crops.example.com", "https://user:password@crops.example.com", "https://crops.example.com/api", "https://crops.example.com?secret=true", "javascript:alert(1)", "crops.example.com"] {
    var rejected = false
    do { _ = try APIClient.validatedURL(address) } catch { rejected = true }
    expect(rejected, "reject unsafe server: \(address)")
}
print("PASS: \(checks) native timer, duration, and server-security checks.")
