import Foundation

/// Keep the last known timer visible even when a sync fails.
public struct CropsMenuStatus {
    public let title: String
    public let symbol: String
    public let detail: String

    public init(signedIn: Bool, loaded: Bool, runningElapsed: TimeInterval?, healthy: Bool) {
        if !signedIn {
            title = "CROPS"; symbol = "leaf.fill"; detail = "Sign in to track time"
        } else if let elapsed = runningElapsed {
            title = CropsTime.clock(elapsed)
            symbol = healthy ? "play.circle.fill" : "exclamationmark.circle"
            detail = healthy ? "Timer running" : "Timer running · Waiting to sync"
        } else if !loaded {
            title = "CROPS"; symbol = "arrow.triangle.2.circlepath"; detail = "Loading your timer"
        } else {
            title = "CROPS"; symbol = healthy ? "leaf.fill" : "exclamationmark.circle"
            detail = healthy ? "No timer running" : "Waiting to sync"
        }
    }
}
