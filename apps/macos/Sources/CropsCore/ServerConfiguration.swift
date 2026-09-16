import Foundation

public enum CropsServer {
    public static let defaultOrigin = "https://crops.wims.vc"
    // Keep this exact historical origin only for the one-time upgrade migration.
    public static let previousProductionOrigin = "https://crops-superfun.netlify.app"

    public static func needsMigration(_ savedOrigin: String?) -> Bool {
        savedOrigin == previousProductionOrigin
    }

    public static func resolvedOrigin(_ savedOrigin: String?) -> String {
        needsMigration(savedOrigin) ? defaultOrigin : savedOrigin ?? defaultOrigin
    }
}
