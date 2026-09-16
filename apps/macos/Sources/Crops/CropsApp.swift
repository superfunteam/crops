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
            RootView().environmentObject(store).frame(minWidth: 420, minHeight: 480)
        }
        .defaultSize(width: 440, height: 640)
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
                .frame(width: 420, height: min(640, (NSScreen.main?.visibleFrame.height ?? 740) - 60))
        } label: {
            HStack(spacing: 4) {
                Image(systemName: store.menuStatus.symbol)
                Text(store.menuStatus.title).monospacedDigit()
            }.help(store.menuHelp).accessibilityLabel(store.menuHelp)
        }
        .menuBarExtraStyle(.window)
    }
}
