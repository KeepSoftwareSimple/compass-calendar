import CompassData
import CompassKit
import SwiftUI

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
        let window = state.nudgeWindow
        let isVisible = bannerVisible(window: window, now: state.referenceNow)
            && !model.isUpNextPickerPresented

        if model.isUpNextPickerPresented, window.occurrences.count > 1 {
            UpNextEventPickerView(model: model, window: window)
        } else if isVisible, let presentation = bannerPresentation(state: state, window: window) {
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

    private struct BannerPresentation {
        let upNext: UpNextOccurrence
        let countdown: String
    }

    private func bannerPresentation(
        state: NativeUpNextState,
        window: UpNextNudgeWindow
    ) -> BannerPresentation? {
        guard let upNext = window.primary,
              let start = CompassDateParsing.parseInEffectiveTimeZone(upNext.startDate),
              let end = CompassDateParsing.parseInEffectiveTimeZone(upNext.endDate)
        else {
            return nil
        }
        let countdown: String
        if window.occurrences.count > 1 {
            countdown = UpNextNudgeFormatting.multiSummary(
                count: window.occurrences.count,
                hasCurrentEvent: window.hasCurrentEvent)
        } else {
            countdown = UpNextFormatting.formatEventStatus(
                start: start,
                end: end,
                now: state.referenceNow,
                isCurrentEvent: window.isPrimaryCurrent)
        }
        return BannerPresentation(upNext: upNext, countdown: countdown)
    }

    private func bannerVisible(window: UpNextNudgeWindow, now: Date) -> Bool {
        guard let upNext = window.primary else { return false }
        if dismissedEventId == upNext.id { return false }
        return !window.occurrences.isEmpty
    }
}
