import SwiftUI
import AppKit

@main struct CropsApplication: App {
    @StateObject private var store = CropsStore()
    var body: some Scene {
        Window("Crops", id: "crops") {
            RootView().environmentObject(store).frame(minWidth: 420, minHeight: 560)
        }
        .defaultSize(width: 440, height: 770)
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
        MenuBarExtra {
            RootView(isPopover: true).environmentObject(store)
                .frame(width: 420, height: min(760, (NSScreen.main?.visibleFrame.height ?? 860) - 60))
        } label: {
            HStack(spacing: 4) {
                Image(systemName: store.state?.runningEntry == nil ? "leaf" : "leaf.fill")
                if !store.menuTitle.isEmpty { Text(store.menuTitle).monospacedDigit() }
            }
        }
        .menuBarExtraStyle(.window)
    }
}
