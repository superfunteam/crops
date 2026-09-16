import AppKit
import Foundation

let output = CommandLine.arguments[1]
try FileManager.default.createDirectory(atPath: output, withIntermediateDirectories: true)
for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let pixels = size * scale
        let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        let context = NSGraphicsContext(bitmapImageRep: bitmap)!
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = context
        context.cgContext.scaleBy(x: CGFloat(pixels) / 1024, y: CGFloat(pixels) / 1024)
        let background = NSBezierPath(roundedRect: NSRect(x: 62, y: 62, width: 900, height: 900), xRadius: 205, yRadius: 205)
        NSColor(red: 0.15, green: 0.29, blue: 0.22, alpha: 1).setFill(); background.fill()
        let stem = NSBezierPath()
        stem.move(to: NSPoint(x: 511, y: 272)); stem.curve(to: NSPoint(x: 526, y: 705), controlPoint1: NSPoint(x: 535, y: 410), controlPoint2: NSPoint(x: 464, y: 543))
        stem.lineWidth = 39; stem.lineCapStyle = .round
        NSColor(red: 0.84, green: 0.92, blue: 0.71, alpha: 1).setStroke(); stem.stroke()
        let leftLeaf = NSBezierPath()
        leftLeaf.move(to: NSPoint(x: 510, y: 462)); leftLeaf.curve(to: NSPoint(x: 278, y: 686), controlPoint1: NSPoint(x: 323, y: 441), controlPoint2: NSPoint(x: 281, y: 558)); leftLeaf.curve(to: NSPoint(x: 510, y: 462), controlPoint1: NSPoint(x: 464, y: 699), controlPoint2: NSPoint(x: 528, y: 607)); leftLeaf.close()
        NSColor(red: 0.84, green: 0.92, blue: 0.71, alpha: 1).setFill(); leftLeaf.fill()
        let rightLeaf = NSBezierPath()
        rightLeaf.move(to: NSPoint(x: 515, y: 558)); rightLeaf.curve(to: NSPoint(x: 746, y: 760), controlPoint1: NSPoint(x: 492, y: 706), controlPoint2: NSPoint(x: 606, y: 771)); rightLeaf.curve(to: NSPoint(x: 515, y: 558), controlPoint1: NSPoint(x: 751, y: 609), controlPoint2: NSPoint(x: 645, y: 537)); rightLeaf.close()
        NSColor(red: 0.74, green: 0.86, blue: 0.60, alpha: 1).setFill(); rightLeaf.fill()
        NSGraphicsContext.restoreGraphicsState()
        let suffix = scale == 2 ? "@2x" : ""
        try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: output).appendingPathComponent("icon_\(size)x\(size)\(suffix).png"))
    }
}
