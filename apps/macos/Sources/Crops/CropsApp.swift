import SwiftUI
import AppKit

final class CropsAppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
}

@main struct CropsApplication: App {
    @NSApplicationDelegateAdaptor(CropsAppDelegate.self) private var appDelegate
    @StateObject private var store = CropsStore()
    var body: some Scene {
        Window("Crops", id: "crops") {
            RootView().environmentObject(store).frame(minWidth: 400, minHeight: 420)
        }
        .defaultSize(width: 420, height: 520)
        .windowResizability(.contentMinSize)
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(replacing: .newItem) {}
            CommandMenu("Timer") {
                Button("Sync now") { Task { await store.sync() } }.keyboardShortcut("r")
                Button("Stop timer") { Task { await store.stop() } }.keyboardShortcut(".").disabled(store.state?.runningEntry == nil || store.busy)
                Button("Open web app") { store.openWeb() }.keyboardShortcut("w", modifiers: [.command, .shift])
            }
        }
        MenuBarExtra(isInserted: .constant(true)) {
            RootView(isPopover: true).environmentObject(store)
                .frame(width: 400)
        } label: {
            Image(nsImage: MenuBadge.image(for: store.menuStatus))
                .help(store.menuHelp).accessibilityLabel(store.menuHelp)
        }
        .menuBarExtraStyle(.window)
    }
}
