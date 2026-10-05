import CompassData
import CompassKit
import SwiftUI

private let bannerLeadMinutes = 2

struct UpNextBanner: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel
    let onOpen: () -> Void
    let onJoin: () -> Void
    let onBannerShown: (NotifiableEvent) -> Void

    @State private var dismissedEventId: String?
    @State private var isClosing = false

    var body: some View {
        let state = model.upNextState
        let snapshot = state.snapshot
        let isVisible = bannerVisible(snapshot: snapshot, now: state.referenceNow)

        if isVisible, let presentation = UpNextFormatting.resolve(state) {
            let upNext = presentation.upNext
            let countdown = presentation.countdown
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(countdown)
                        .font(.custom("Rubik", size: 12, relativeTo: .caption))
                        .foregroundStyle(theme.textMutedColor)
                    HStack(spacing: 6) {
                        Circle()
                            .fill(theme.accentColor)
                            .frame(width: 6, height: 6)
                        Text(upNext.title)
                            .font(.custom("Rubik", size: 14, relativeTo: .body))
                            .fontWeight(.medium)
                            .foregroundStyle(theme.textColor)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 8)
                Button(state.conferenceURL != nil ? "Join" : "Open") {
                    if state.conferenceURL != nil {
                        onJoin()
                    } else {
                        onOpen()
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(theme.accentSecondaryColor)
                Button("Dismiss") {
                    withAnimation {
                        isClosing = true
                    }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                        dismissedEventId = upNext.id
                        isClosing = false
                    }
                }
                .buttonStyle(.plain)
                .foregroundStyle(theme.textMutedColor)
                .accessibilityLabel("Dismiss")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(.ultraThinMaterial)
            .background(theme.surfacePanelColor.opacity(0.85))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(theme.borderColor, lineWidth: 1))
            .opacity(isClosing ? 0 : 1)
            .frame(maxWidth: 320)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("compass-native-up-next-banner")
            .onAppear {
                onBannerShown(
                    NotifiableEvent(
                        id: upNext.id,
                        title: upNext.title,
                        startDate: upNext.startDate))
            }
        }
    }

    private func bannerVisible(snapshot: UpNextSnapshot, now: Date) -> Bool {
        guard let upNext = snapshot.upNext else { return false }
        if dismissedEventId == upNext.id { return false }
        if snapshot.isCurrentEvent { return true }
        guard let start = CompassDateParsing.parseInEffectiveTimeZone(upNext.startDate) else {
            return false
        }
        let minutes = start.timeIntervalSince(now) / 60
        return minutes <= Double(bannerLeadMinutes)
    }
}
