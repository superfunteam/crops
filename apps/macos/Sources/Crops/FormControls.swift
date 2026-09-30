import SwiftUI
import AppKit
import CropsCore

enum CropsMotion {
    static func animation(_ reduced: Bool) -> Animation? { reduced ? nil : .easeInOut(duration: 0.22) }
    static func transition(_ reduced: Bool) -> AnyTransition {
        reduced ? .identity : .opacity.combined(with: .offset(y: 6))
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.system(size: 14, weight: .semibold))
            .frame(maxWidth: .infinity).frame(height: 48)
            .foregroundStyle(.white)
            .background(Palette.forest.opacity(isEnabled ? (configuration.isPressed ? 0.85 : 1) : 0.4), in: RoundedRectangle(cornerRadius: 12))
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.99 : 1)
            .animation(CropsMotion.animation(reduceMotion), value: configuration.isPressed)
    }
}

struct CompactActionStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.padding(.horizontal, 13).frame(height: 34)
            .foregroundStyle(.white)
            .background(Palette.forest.opacity(isEnabled ? (configuration.isPressed ? 0.8 : 1) : 0.4), in: RoundedRectangle(cornerRadius: 9))
    }
}

struct BackButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.system(size: 12, weight: .medium))
            .padding(.horizontal, 11).frame(height: 34)
            .foregroundStyle(Palette.accent)
            .background(Palette.ink.opacity(configuration.isPressed ? 0.08 : 0.04), in: RoundedRectangle(cornerRadius: 9))
    }
}

struct InputField: View {
    let label: String
    var placeholder = ""
    @Binding var text: String
    var secure = false
    var multiline = false
    @FocusState private var focused: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label).font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
            Group {
                if secure { SecureField(placeholder, text: $text).focused($focused) }
                else if multiline {
                    ZStack(alignment: .topLeading) {
                        TextEditor(text: $text).scrollContentBackground(.hidden).frame(height: 52).focused($focused)
                        if text.isEmpty {
                            Text(placeholder).foregroundStyle(Palette.ink.opacity(0.45)).padding(.leading, 4).padding(.top, 2)
                                .allowsHitTesting(false).accessibilityHidden(true)
                        }
                    }
                }
                else { TextField(placeholder, text: $text).focused($focused) }
            }.textFieldStyle(.plain).font(.system(size: 14)).accessibilityLabel(label)
        }.padding(.horizontal, 14).padding(.vertical, 11)
            .frame(maxWidth: .infinity, minHeight: multiline ? 78 : 58, alignment: .leading)
            .background(Palette.surface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(focused ? Palette.accent.opacity(0.65) : Palette.ink.opacity(0.1), lineWidth: focused ? 1.5 : 1))
    }
}

struct ProjectControl: View {
    @EnvironmentObject var store: CropsStore
    let projects: [Project]
    @Binding var selection: String
    private func title(_ project: Project) -> String {
        (store.clientName(project.id).map { "\($0) · " } ?? "") + project.name + (project.archived == true ? " (archived)" : "")
    }
    var body: some View {
        NativeProjectMenu(options: projects.map { ProjectMenuOption(id: $0.id, title: title($0)) }, selection: $selection)
            .frame(maxWidth: .infinity).frame(height: 58)
            .background(Palette.surface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.ink.opacity(0.1)))
    }
}

private struct ProjectMenuOption: Equatable { let id: String; let title: String }

/// NSPopUpButton keeps native menu tracking, checkmarks, and keyboard navigation.
/// Its cell draws the same two-line field surface as the other form controls.
private struct NativeProjectMenu: NSViewRepresentable {
    let options: [ProjectMenuOption]
    @Binding var selection: String
    @Environment(\.isEnabled) private var isEnabled
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeNSView(context: Context) -> ProjectPopUpButton {
        let button = ProjectPopUpButton(frame: .zero, pullsDown: false)
        button.cell = ProjectPopUpCell(textCell: "")
        button.isBordered = false
        button.focusRingType = .exterior
        button.target = context.coordinator
        button.action = #selector(Coordinator.select(_:))
        button.setAccessibilityLabel("Project")
        return button
    }
    func updateNSView(_ button: ProjectPopUpButton, context: Context) {
        context.coordinator.parent = self
        if button.options != options {
            button.options = options
            button.removeAllItems()
            for option in options {
                button.addItem(withTitle: option.title)
                button.lastItem?.representedObject = option.id
            }
        }
        if button.selectedItem?.representedObject as? String != selection,
           let item = button.itemArray.first(where: { $0.representedObject as? String == selection }) {
            button.select(item)
        }
        button.isEnabled = isEnabled
        button.setAccessibilityValue(button.selectedItem?.title ?? "Choose a project")
        button.needsDisplay = true
    }
    final class Coordinator: NSObject {
        var parent: NativeProjectMenu
        init(_ parent: NativeProjectMenu) { self.parent = parent }
        @objc func select(_ sender: NSPopUpButton) {
            if let id = sender.selectedItem?.representedObject as? String, id != parent.selection { parent.selection = id }
        }
    }
}

private final class ProjectPopUpButton: NSPopUpButton {
    var options: [ProjectMenuOption] = []
    override var intrinsicContentSize: NSSize { NSSize(width: NSView.noIntrinsicMetric, height: 58) }
    override var focusRingMaskBounds: NSRect { bounds }
    override func drawFocusRingMask() { NSBezierPath(roundedRect: bounds, xRadius: 12, yRadius: 12).fill() }
}

private final class ProjectPopUpCell: NSPopUpButtonCell {
    override func draw(withFrame cellFrame: NSRect, in controlView: NSView) {
        let accent = NSColor(Palette.accent), ink = NSColor(Palette.ink)
        let symbol = NSImage.SymbolConfiguration(paletteColors: [accent])
        NSImage(systemSymbolName: "folder", accessibilityDescription: nil)?.withSymbolConfiguration(symbol)?
            .draw(in: NSRect(x: 14, y: 20, width: 18, height: 18))
        let paragraph = NSMutableParagraphStyle(); paragraph.lineBreakMode = .byTruncatingTail
        let width = max(0, cellFrame.width - 80)
        ("Project" as NSString).draw(in: NSRect(x: 44, y: 10, width: width, height: 14), withAttributes: [.font: NSFont.systemFont(ofSize: 11, weight: .medium), .foregroundColor: NSColor.secondaryLabelColor])
        let title = (controlView as? NSPopUpButton)?.selectedItem?.title ?? "Choose a project"
        (title as NSString).draw(in: NSRect(x: 44, y: 27, width: width, height: 20), withAttributes: [.font: NSFont.systemFont(ofSize: 14, weight: .medium), .foregroundColor: ink, .paragraphStyle: paragraph])
        NSImage(systemSymbolName: "chevron.down", accessibilityDescription: nil)?.withSymbolConfiguration(symbol)?
            .draw(in: NSRect(x: cellFrame.width - 26, y: 24, width: 11, height: 9))
    }
}

struct EntryTypeControl: View {
    @Binding var manual: Bool
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Namespace private var selection
    var body: some View {
        HStack(spacing: 4) {
            option("Timer", symbol: "play.fill", value: false)
            option("Manual time", symbol: "clock", value: true)
        }.padding(4).background(Palette.ink.opacity(0.055), in: RoundedRectangle(cornerRadius: 12))
            .animation(CropsMotion.animation(reduceMotion), value: manual)
            .onMoveCommand { direction in
                guard isEnabled else { return }
                if direction == .left { manual = false }
                if direction == .right { manual = true }
            }.accessibilityElement(children: .contain).accessibilityLabel("Entry type")
    }
    private func option(_ title: String, symbol: String, value: Bool) -> some View {
        Button { manual = value } label: {
            Label(title, systemImage: symbol).font(.system(size: 13, weight: manual == value ? .semibold : .medium))
                .frame(maxWidth: .infinity).frame(height: 38)
                .foregroundStyle(manual == value ? Palette.accent : Palette.ink.opacity(0.6))
                .background {
                    if manual == value {
                        RoundedRectangle(cornerRadius: 9).fill(Palette.surface)
                            .shadow(color: .black.opacity(0.06), radius: 2, y: 1)
                            .matchedGeometryEffect(id: "entry-type", in: selection)
                    }
                }.contentShape(RoundedRectangle(cornerRadius: 9))
        }.buttonStyle(.plain).accessibilityAddTraits(manual == value ? .isSelected : [])
    }
}

struct BillableControl: View {
    @Binding var isOn: Bool
    var body: some View {
        HStack {
            Label("Billable", systemImage: "dollarsign.circle").font(.system(size: 14, weight: .medium)).accessibilityHidden(true)
            Spacer()
            Toggle("Billable", isOn: $isOn).labelsHidden().toggleStyle(.switch).controlSize(.large).tint(Palette.accent)
        }.padding(.horizontal, 14).frame(maxWidth: .infinity).frame(height: 50)
            .background(Palette.surface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.ink.opacity(0.1)))
    }
}

struct DateControl: View {
    @Binding var date: Date
    var latest = Date()
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("Date").font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
            DatePicker("Date", selection: $date, in: ...latest, displayedComponents: .date)
                .labelsHidden().datePickerStyle(.field).controlSize(.large).font(.system(size: 14))
        }.padding(.horizontal, 12).padding(.vertical, 8).frame(minWidth: 144, maxWidth: .infinity).frame(height: 58)
            .background(Palette.surface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.ink.opacity(0.1)))
    }
}
