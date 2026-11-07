import CompassData
import CompassKit
import SwiftUI

/// Web `CopyButton`: copy icon with optional inline keycaps beside the event form meeting link.
struct EventFormCopyLinkButton: View {
    let label: String
    let shortcutKeycaps: [String]
    let isEnabled: Bool
    let onCopy: () -> Void

    @State private var copied = false

    var body: some View {
        HStack(spacing: 4) {
            Button(action: copy) {
                Group {
                    if copied {
                        Image(systemName: "checkmark")
                            .font(.system(size: 14, weight: .medium))
                    } else {
                        PhosphorIconView(icon: .copy, size: 16)
                    }
                }
                .frame(width: 16, height: 16)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .opacity(isEnabled ? (copied ? 1 : 0.25) : 0.15)
            .disabled(!isEnabled)
            .accessibilityLabel(copied ? "Copied" : label)
            .accessibilityIdentifier("compass-event-form-meeting-link-copy")

            if !shortcutKeycaps.isEmpty {
                let keycaps = HStack(spacing: 4) {
                    ForEach(shortcutKeycaps, id: \.self) { key in
                        ShortcutHintChip(label: KeycapGlyphs.display([key]))
                            .modifier(MeetingLinkCopyKeycapProbe(token: key))
                    }
                }
                .opacity(isEnabled ? 0.25 : 0.15)
                if UITestLaunchPolicy.attachesAccessibilityProbes {
                    keycaps
                        .accessibilityElement(children: .contain)
                        .accessibilityIdentifier("compass-event-form-meeting-link-copy-keycaps")
                } else {
                    keycaps.accessibilityHidden(true)
                }
            }
        }
    }

    private func copy() {
        guard isEnabled else { return }
        onCopy()
        copied = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            copied = false
        }
    }
}

/// Web `data-testid="l-icon"`: expose keycap chips to XCUITest without VO noise.
private struct MeetingLinkCopyKeycapProbe: ViewModifier {
    let token: String

    @ViewBuilder
    func body(content: Content) -> some View {
        if UITestLaunchPolicy.attachesAccessibilityProbes,
            token.caseInsensitiveCompare("l") == .orderedSame
        {
            content.accessibilityIdentifier("compass-event-form-meeting-link-keycap-l")
        } else {
            content
        }
    }
}
