import CompassKit
import SwiftUI

struct BlockPartyPracticeGridView: View {
    @Environment(\.nativeWebTheme) private var theme
    let practice: PracticeState
    let ghost: BlockPartySlot?
    let jumpLetters: [String: String]
    let jumpChipsShown: Bool

    private let dayLabels = ["Mon", "Tue", "Wed"]
    private let gridStart = PracticeGridConstants.practiceGridStartMin
    private let totalMin =
        (PracticeGridConstants.showcaseGridEndHour - PracticeGridConstants.showcaseGridStartHour) * 60

    var body: some View {
        GeometryReader { geometry in
            HStack(spacing: 0) {
                hourLabels(height: geometry.size.height)
                ForEach(0 ..< PracticeGridConstants.showcaseDayCount, id: \.self) { dayIndex in
                    dayColumn(dayIndex: dayIndex, height: geometry.size.height)
                }
            }
        }
        .frame(height: 360)
        .background(theme.surfacePanelColor)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .stroke(theme.borderColor, lineWidth: 1)
        }
        .accessibilityIdentifier("block-party-practice-grid")
    }

    private func hourLabels(height: CGFloat) -> some View {
        VStack(spacing: 0) {
            ForEach(
                PracticeGridConstants.showcaseGridStartHour ..< PracticeGridConstants.showcaseGridEndHour,
                id: \.self
            ) { hour in
                Text(formatHour(hour))
                    .font(.custom("Rubik", size: 10))
                    .foregroundStyle(theme.textMutedColor)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .padding(.trailing, 4)
                    .frame(height: height / CGFloat(PracticeGridConstants.showcaseGridEndHour - PracticeGridConstants.showcaseGridStartHour))
            }
        }
        .frame(width: 44)
    }

    private func dayColumn(dayIndex: Int, height: CGFloat) -> some View {
        ZStack(alignment: .topLeading) {
            VStack(spacing: 0) {
                Text(dayLabels[dayIndex])
                    .font(.custom("Rubik", size: 11, relativeTo: .caption))
                    .foregroundStyle(theme.textMutedColor)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 4)
                Rectangle()
                    .fill(theme.borderColor.opacity(0.35))
                    .frame(height: 1)
            }
            .frame(maxWidth: .infinity, alignment: .top)

            if let ghost, ghost.dayIndex == dayIndex {
                ghostOutline(ghost, height: height)
            }

            ForEach(practice.events.filter { $0.dayIndex == dayIndex }, id: \.id) { block in
                eventBlock(block, height: height)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func ghostOutline(_ slot: BlockPartySlot, height: CGFloat) -> some View {
        let frame = blockFrame(startMin: slot.startMin, endMin: slot.endMin, height: height)
        return RoundedRectangle(cornerRadius: 6)
            .stroke(theme.accentColor, style: StrokeStyle(lineWidth: 2, dash: [4, 4]))
            .frame(height: frame.height)
            .padding(.top, frame.minY + 28)
            .padding(.horizontal, 4)
    }

    private func eventBlock(_ block: PracticeEventBlock, height: CGFloat) -> some View {
        let frame = blockFrame(startMin: block.startMin, endMin: block.endMin, height: height)
        let slot = BlockPartyColor.slot(from: block.color)
        let isFocused = practice.focusedId == block.id
        return ZStack(alignment: .topTrailing) {
            VStack(alignment: .leading, spacing: 2) {
                Text(block.title)
                    .font(.custom("Rubik", size: 11))
                    .lineLimit(1)
                if frame.height > 28 {
                    Text(timeRange(block))
                        .font(.custom("Rubik", size: 9))
                        .opacity(0.85)
                }
            }
            .foregroundStyle(.white)
            .padding(6)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            if jumpChipsShown, let letter = jumpLetters[block.id] {
                ShortcutHintChip(label: letter.uppercased())
                    .padding(4)
            }
        }
        .frame(height: max(frame.height, 22))
        .background(BlockPartyColor.swiftUIColor(for: slot, theme: theme))
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay {
            if isFocused {
                RoundedRectangle(cornerRadius: 6)
                    .stroke(theme.textColor.opacity(0.7), lineWidth: 2)
            }
        }
        .padding(.top, frame.minY + 28)
        .padding(.horizontal, 4)
        .accessibilityLabel(block.title)
    }

    private func blockFrame(startMin: Int, endMin: Int, height: CGFloat) -> CGRect {
        let gridHeight = height - 28
        let top = CGFloat(startMin - gridStart) / CGFloat(totalMin) * gridHeight
        let blockHeight = CGFloat(endMin - startMin) / CGFloat(totalMin) * gridHeight
        return CGRect(x: 0, y: top, width: 0, height: max(blockHeight, 18))
    }

    private func formatHour(_ hour: Int) -> String {
        let suffix = hour >= 12 ? "PM" : "AM"
        let normalized = hour % 12 == 0 ? 12 : hour % 12
        return "\(normalized) \(suffix)"
    }

    private func timeRange(_ block: PracticeEventBlock) -> String {
        "\(formatMinutes(block.startMin)) – \(formatMinutes(block.endMin))"
    }

    private func formatMinutes(_ minutes: Int) -> String {
        let hour = minutes / 60
        let minute = minutes % 60
        let suffix = hour >= 12 ? "PM" : "AM"
        let normalized = hour % 12 == 0 ? 12 : hour % 12
        if minute == 0 { return "\(normalized) \(suffix)" }
        return String(format: "%d:%02d %@", normalized, minute, suffix)
    }
}
