import AppKit
import CropsCore

/// MenuBarExtra strips SwiftUI backgrounds from its label. Draw the badge into
/// a non-template image so the forest fill stays visible in either appearance.
enum MenuBadge {
    static func image(for status: CropsMenuStatus) -> NSImage {
        let font = NSFont.monospacedDigitSystemFont(ofSize: 11, weight: .semibold)
        let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor.white]
        let text = NSAttributedString(string: status.title, attributes: attributes)
        let textSize = text.size()
        let size = NSSize(width: ceil(textSize.width) + 29, height: 20)
        let image = NSImage(size: size, flipped: false) { rect in
            NSColor(red: 0.15, green: 0.29, blue: 0.22, alpha: 1).setFill()
            NSBezierPath(roundedRect: rect.insetBy(dx: 0, dy: 1), xRadius: 5, yRadius: 5).fill()
            let warning = status.symbol == "exclamationmark.circle"
            let configuration = NSImage.SymbolConfiguration(pointSize: 10, weight: .semibold)
                .applying(NSImage.SymbolConfiguration(paletteColors: [warning ? .systemYellow : .white]))
            let symbol = status.symbol == "play.circle.fill" ? "play.fill" : status.symbol
            NSImage(systemSymbolName: symbol, accessibilityDescription: nil)?
                .withSymbolConfiguration(configuration)?
                .draw(in: NSRect(x: 7, y: 5, width: 10, height: 10))
            text.draw(at: NSPoint(x: 21, y: (size.height - textSize.height) / 2))
            return true
        }
        image.isTemplate = false
        image.accessibilityDescription = "Crops · \(status.detail) · \(status.title)"
        return image
    }
}
