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
                Spacer(minLength: 8)
                Button {
                    if state.conferenceURL != nil {
                        onJoin()
                    } else {
                        onOpen()
                    }
                } label: {
                    HStack(spacing: 6) {
                        Text(state.conferenceURL != nil ? "Join" : "Open")
                            .font(.rubik(14, weight: .medium))
                        ShortcutHintChip(
                            label: state.conferenceURL != nil ? "V" : "N",
                            style: .onAccent
                        )
                    }
                    .foregroundStyle(theme.onAccentColor)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(theme.accentSecondaryColor)
                    .clipShape(RoundedRectangle(cornerRadius: NativeWebLayoutTokens.radiusDefault))
                }
                .buttonStyle(.plain)
                Button {
                    withAnimation {
                        isClosing = true
                    }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                        dismissedEventId = upNext.id
                        isClosing = false
                    }
                } label: {
                    Text("×")
                        .font(.rubik(16))
                        .foregroundStyle(theme.textMutedColor)
                        .padding(.horizontal, 4)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Dismiss")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.ultraThinMaterial)
            .background(theme.surfacePanelColor.opacity(0.8))
            .clipShape(RoundedRectangle(cornerRadius: NativeWebLayoutTokens.radiusDefault))
            .overlay(
                RoundedRectangle(cornerRadius: NativeWebLayoutTokens.radiusDefault)
                    .stroke(theme.borderColor, lineWidth: 1))
            .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
            .opacity(isClosing ? 0 : 1)
            .frame(width: 288)
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
