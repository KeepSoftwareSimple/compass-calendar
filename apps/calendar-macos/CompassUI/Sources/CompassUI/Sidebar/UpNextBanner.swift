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
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 8) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(countdown)
                            .font(.rubik(12))
                            .foregroundStyle(theme.textMutedColor)
                        HStack(spacing: 6) {
                            Circle()
                                .fill(theme.accentColor)
                                .frame(width: 6, height: 6)
                            Text(upNext.title)
                                .font(.rubik(14, weight: .medium))
                                .foregroundStyle(theme.textColor)
                                .lineLimit(1)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    NoticeDismissButton {
                        withAnimation {
                            isClosing = true
                        }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                            dismissedEventId = upNext.id
                            isClosing = false
                        }
                    }
                }
                Button {
                    if state.conferenceURL != nil {
                        onJoin()
                    } else {
                        onOpen()
                    }
                } label: {
                    HStack(spacing: 8) {
                        Text(state.conferenceURL != nil ? "Join" : "Open")
                        ShortcutHintChip(
                            label: state.conferenceURL != nil ? "V" : "N",
                            style: .onAccent
                        )
                    }
                }
                .buttonStyle(CompactPrimaryButtonStyle())
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(width: 288, alignment: .leading)
            .background(theme.surfaceColor.opacity(0.95))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(theme.borderColor, lineWidth: 1))
            .shadow(color: theme.shadowDefaultColor, radius: 20, y: 10)
            .opacity(isClosing ? 0 : 1)
            .accessibilityElement(children: .contain)
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
