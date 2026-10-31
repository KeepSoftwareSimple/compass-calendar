import CompassData
import CompassKit
import SwiftUI

struct UpNextEventPickerView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel
    let window: UpNextNudgeWindow
    @FocusState private var isFocused: Bool

    var body: some View {
        let title = UpNextNudgeFormatting.pickerTitle(
            count: window.occurrences.count,
            hasCurrentEvent: window.hasCurrentEvent)

        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 8) {
                Text(title)
                    .font(.rubik(14))
                    .foregroundStyle(theme.textColor)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Button {
                    model.closeUpNextPicker()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(theme.textMutedColor)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)

            Divider()

            ScrollView {
                VStack(spacing: 0) {
                    ForEach(Array(window.occurrences.enumerated()), id: \.element.id) { index, occurrence in
                        pickerRow(occurrence: occurrence, index: index)
                        if index < window.occurrences.count - 1 {
                            Divider()
                        }
                    }
                }
            }
            .frame(maxHeight: 240)
        }
        .frame(width: 320)
        .background(theme.surfaceColor.opacity(0.95))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(theme.borderColor, lineWidth: 1))
        .shadow(color: theme.shadowDefaultColor, radius: 20, y: 10)
        .focused($isFocused)
        .onAppear { isFocused = true }
        .onKeyPress(.escape) {
            model.closeUpNextPicker()
            return .handled
        }
        .onKeyPress(keys: [.upArrow]) { _ in
            moveHighlight(delta: -1)
            return .handled
        }
        .onKeyPress(keys: [.downArrow]) { _ in
            moveHighlight(delta: 1)
            return .handled
        }
        .onKeyPress(.return) {
            selectHighlighted()
            return .handled
        }
        .onKeyPress(characters: .decimalDigits) { press in
            guard let character = press.characters.first,
                  let digit = character.wholeNumberValue,
                  digit >= 1, digit <= window.occurrences.count
            else { return .ignored }
            model.selectUpNextPicker(eventId: window.occurrences[digit - 1].id)
            return .handled
        }
        .accessibilityIdentifier("compass-native-up-next-picker")
    }

    @ViewBuilder
    private func pickerRow(occurrence: UpNextOccurrence, index: Int) -> some View {
        let hasMeeting = model.upNextEventHasMeetingLink(eventId: occurrence.id)
        let isHighlighted = index == model.upNextPickerHighlightIndex
        let timeRange = timeRangeLabel(for: occurrence)

        Button {
            model.selectUpNextPicker(eventId: occurrence.id)
        } label: {
            HStack(spacing: 8) {
                if hasMeeting {
                    Image(systemName: "video.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(theme.textMutedColor)
                        .frame(width: 16)
                } else {
                    Color.clear.frame(width: 16, height: 16)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(occurrence.title)
                        .font(.rubik(14, weight: .medium))
                        .foregroundStyle(theme.textColor)
                        .lineLimit(1)
                    Text(timeRange)
                        .font(.rubik(12))
                        .foregroundStyle(theme.textMutedColor)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                ShortcutHintChip(label: String(index + 1))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(isHighlighted ? theme.surfacePanelColor : Color.clear)
        }
        .buttonStyle(.plain)
    }

    private func timeRangeLabel(for occurrence: UpNextOccurrence) -> String {
        guard let start = CompassDateParsing.parseInEffectiveTimeZone(occurrence.startDate),
              let end = CompassDateParsing.parseInEffectiveTimeZone(occurrence.endDate)
        else { return "" }
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        formatter.timeZone = EffectiveTimeZone.timeZone
        return "\(formatter.string(from: start)) - \(formatter.string(from: end))"
    }

    private func moveHighlight(delta: Int) {
        let count = window.occurrences.count
        guard count > 0 else { return }
        model.upNextPickerHighlightIndex = (model.upNextPickerHighlightIndex + delta + count) % count
    }

    private func selectHighlighted() {
        guard window.occurrences.indices.contains(model.upNextPickerHighlightIndex) else { return }
        model.selectUpNextPicker(eventId: window.occurrences[model.upNextPickerHighlightIndex].id)
    }
}
