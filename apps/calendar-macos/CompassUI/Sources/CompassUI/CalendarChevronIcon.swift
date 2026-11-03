import SwiftUI

/// Exact 16pt path used by web ChevronLeftIcon and ChevronRightIcon.
struct CalendarChevronIcon: View {
    let pointsLeft: Bool

    var body: some View {
        Path { path in
            path.move(to: CGPoint(x: pointsLeft ? 10 : 6, y: 4))
            path.addLine(to: CGPoint(x: pointsLeft ? 6 : 10, y: 8))
            path.addLine(to: CGPoint(x: pointsLeft ? 10 : 6, y: 12))
        }
        .stroke(style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
        .frame(width: 16, height: 16)
        .accessibilityHidden(true)
    }
}
