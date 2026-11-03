import CompassData
import CompassKit
import SwiftUI

/// Web `SidebarRefreshButton`: offered once live updates have been down a
/// while. It reconnects and reloads.
struct SidebarRefreshButton: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel

    private let slotSize: CGFloat = 36

    var body: some View {
        TimelineView(.periodic(from: .now, by: 5)) { context in
            Group {
                if model.isSidebarRefreshDue(now: context.date) {
                    Button {
                        model.refreshFromSidebar()
                    } label: {
                        PhosphorIconView(icon: .arrowClockwise, size: 16)
                            .frame(width: slotSize, height: slotSize)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .help("Reload for the latest version (⌘R)")
                    .accessibilityLabel("Reload for the latest version")
                }
            }
            .frame(width: slotSize, height: slotSize, alignment: .leading)
        }
    }
}
