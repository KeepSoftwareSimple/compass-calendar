import CompassData
import CompassKit
import SwiftUI

struct LifeGridCanvasView: View {
    @Environment(\.nativeWebTheme) private var theme
    let snapshot: LifeGridSnapshot
    let currentWeekLabel: String?
    let scrollToCurrentWeekToken: Int

    private let dotSize: CGFloat = 8
    private let rowHeight: CGFloat = 10
    private let ageColumnWidth: CGFloat = 28
    private let columnGap: CGFloat = 8
    private let dotGap: CGFloat = 1

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                Canvas { context, size in
                    drawGrid(context: &context, size: size)
                }
                .frame(height: gridHeight)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Life visualization")
                .accessibilityValue(currentWeekLabel ?? snapshotSummary)
                .accessibilityIdentifier("compass-native-life-grid")
                .overlay(alignment: .topLeading) {
                    Color.clear
                        .frame(width: 1, height: 1)
                        .id("life-current-week-anchor")
                        .offset(
                            x: currentWeekAnchorOffset.x,
                            y: currentWeekAnchorOffset.y)
                        .accessibilityHidden(true)
                }
            }
            .onChange(of: scrollToCurrentWeekToken) { _, _ in
                withAnimation {
                    proxy.scrollTo("life-current-week-anchor", anchor: .center)
                }
            }
        }
    }

    private var snapshotSummary: String {
        "total \(snapshot.totalDots), lived \(snapshot.weeksLived)"
    }

    private var gridHeight: CGFloat {
        CGFloat(snapshot.rowCount) * rowHeight
    }

    private var currentWeekAnchorOffset: CGPoint {
        guard let index = snapshot.dots.firstIndex(of: .current) else {
            return .zero
        }
        let row = index / LifeMath.weeksPerRow
        let column = index % LifeMath.weeksPerRow
        let x = ageColumnWidth + columnGap + CGFloat(column) * (dotSize + dotGap)
        let y = CGFloat(row) * rowHeight + rowHeight / 2
        return CGPoint(x: x, y: y)
    }

    private func drawGrid(context: inout GraphicsContext, size: CGSize) {
        let livedColor = theme.accentColor
        let futureColor = theme.textColor.opacity(0.15)
        let currentRing = theme.accentColor.opacity(0.6)

        for row in 0 ..< snapshot.rowCount {
            let age = row + 1
            if age == 1 || age % 10 == 0 {
                let label = Text(verbatim: "\(age)")
                    .font(.system(size: 10, weight: .regular, design: .rounded))
                    .foregroundColor(theme.textMutedColor.opacity(0.7))
                context.draw(
                    label,
                    at: CGPoint(x: ageColumnWidth - 4, y: CGFloat(row) * rowHeight + rowHeight / 2),
                    anchor: .trailing)
            }

            for week in 0 ..< LifeMath.weeksPerRow {
                let index = row * LifeMath.weeksPerRow + week
                guard index < snapshot.dots.count else { continue }
                let state = snapshot.dots[index]
                let origin = CGPoint(
                    x: ageColumnWidth + columnGap + CGFloat(week) * (dotSize + dotGap),
                    y: CGFloat(row) * rowHeight + (rowHeight - dotSize) / 2)
                let rect = CGRect(origin: origin, size: CGSize(width: dotSize, height: dotSize))
                let path = Path(roundedRect: rect, cornerRadius: 2)
                switch state {
                case .future:
                    context.fill(path, with: .color(futureColor))
                case .lived:
                    context.fill(path, with: .color(livedColor))
                case .current:
                    context.fill(path, with: .color(livedColor))
                    context.stroke(path, with: .color(currentRing), lineWidth: 1)
                }
            }
        }
    }
}
