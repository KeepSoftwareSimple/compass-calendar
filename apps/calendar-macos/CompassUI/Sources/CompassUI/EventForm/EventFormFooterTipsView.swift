import CompassData
import CompassKit
import SwiftUI

/// Context-aware keyboard tips under the Save bar, matching web `EventFormFooterTips`.
struct EventFormFooterTipsView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel
    var tabNavigationApplies: Bool = true
    @State private var showMoreHints = false

    private var tiered: ContextualHintTiers.TieredHint {
        ContextualHintTiers.eventFormFooter(
            tabNavigationApplies: tabNavigationApplies,
            datePickerCalendarOpen: model.eventFormDateKeyOwner?.calendarOpen == true)
    }

    var body: some View {
        if !model.levelsStore.tipsMuted, !tiered.primary.isEmpty || tiered.hasSecondary {
            VStack(spacing: 2) {
                HStack(spacing: 4) {
                    hintRowContent(primarySegments)
                    if tiered.hasSecondary {
                        disclosureControl
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("compass-event-form-footer-tips")
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity)
                if showMoreHints {
                    hintRow(secondarySegments)
                }
            }
            .font(.rubik(11))
            .foregroundStyle(theme.textMutedColor)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity, minHeight: 40)
            .onChange(of: model.eventFormDateKeyOwner?.calendarOpen) { _, _ in
                showMoreHints = false
            }
        }
    }

    private var disclosureControl: some View {
        Button {
            showMoreHints.toggle()
        } label: {
            Text(showMoreHints ? "Less" : "More")
                .font(.rubik(11))
                .foregroundStyle(theme.textMutedColor)
                .underline(color: theme.textMutedColor.opacity(0.5))
        }
        .buttonStyle(.plain)
        .focusable()
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(showMoreHints ? "Less" : "More")
        .accessibilityValue(showMoreHints ? "Expanded" : "Collapsed")
        .accessibilityHint(
            showMoreHints
                ? "Hides additional keyboard shortcuts"
                : "Shows additional keyboard shortcuts")
        .accessibilityIdentifier(
            showMoreHints
                ? "compass-event-form-footer-hints-less"
                : "compass-event-form-footer-hints-more")
    }

    private var primarySegments: [HintSegment] {
        tiered.primary.flatMap(Self.segments)
    }

    private var secondarySegments: [HintSegment] {
        tiered.secondary.flatMap(Self.segments)
    }

    private func hintRow(_ segments: [HintSegment]) -> some View {
        hintRowContent(segments)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity)
    }

    private func hintRowContent(_ segments: [HintSegment]) -> some View {
        HStack(spacing: 4) {
            ForEach(Array(segments.enumerated()), id: \.offset) { _, segment in
                switch segment {
                case .text(let value):
                    Text(value)
                case .key(let label):
                    ShortcutHintChip(label: label)
                }
            }
        }
    }

    private enum HintSegment {
        case text(String)
        case key(String)
    }

    private static func segments(for line: String) -> [HintSegment] {
        if line == "Tab / Shift Tab between fields" {
            return [
                .key("Tab"), .text("/"), .key("Shift"), .key("Tab"), .text("between fields"),
            ]
        }
        if line == "Hold ⌘ then 0 for actions" {
            return [
                .text("Hold"),
                .key(KeycapGlyphs.display(["Mod"])),
                .text("then"),
                .key("0"),
                .text("for actions"),
            ]
        }
        if line == "← → ↑ ↓ move date" {
            return [
                .key(KeycapGlyphs.display(["ArrowLeft"])),
                .key(KeycapGlyphs.display(["ArrowRight"])),
                .key(KeycapGlyphs.display(["ArrowUp"])),
                .key(KeycapGlyphs.display(["ArrowDown"])),
                .text("move date"),
            ]
        }
        if line == "Enter pick" {
            return [.key("Enter"), .text("pick")]
        }
        if line == "Esc close" {
            return [.key(KeycapGlyphs.display(["Esc"])), .text("close")]
        }
        if line == "← → day" {
            return [
                .key(KeycapGlyphs.display(["ArrowLeft"])),
                .key(KeycapGlyphs.display(["ArrowRight"])),
                .text("day"),
            ]
        }
        if line == "↑ ↓ week" {
            return [
                .key(KeycapGlyphs.display(["ArrowUp"])),
                .key(KeycapGlyphs.display(["ArrowDown"])),
                .text("week"),
            ]
        }
        if line == "Page Down month" {
            return [.key("Page Down"), .text("month")]
        }
        if line == "Shift Page Down year" {
            return [.key("Shift"), .key("Page Down"), .text("year")]
        }
        if line == "Tab leave and save typed text" {
            return [.key("Tab"), .text("leave and save typed text")]
        }
        return [.text(line)]
    }
}
