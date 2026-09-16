import Foundation

/// Keep the last known timer visible even when a sync fails.
public struct CropsMenuStatus {
    public let title: String
    public let symbol: String
    public let detail: String

    public init(signedIn: Bool, loaded: Bool, runningElapsed: TimeInterval?, healthy: Bool) {
        if !signedIn {
            title = "Crops"; symbol = "leaf"; detail = "Sign in to track time"
        } else if let elapsed = runningElapsed {
            title = CropsTime.clock(elapsed)
            symbol = healthy ? "play.circle.fill" : "exclamationmark.circle"
            detail = healthy ? "Timer running" : "Timer running · Waiting to sync"
        } else if !loaded {
            title = "—:—"; symbol = "arrow.triangle.2.circlepath"; detail = "Loading your timer"
        } else {
            title = "0:00"; symbol = healthy ? "pause.circle" : "exclamationmark.circle"
            detail = healthy ? "No timer running" : "Waiting to sync"
        }
    }
}
