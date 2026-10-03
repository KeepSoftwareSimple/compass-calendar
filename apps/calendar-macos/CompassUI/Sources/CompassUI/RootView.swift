import CompassData
import CompassKit
import SwiftUI

public struct RootView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable public var model: NativeCalendarRootModel
    @State private var titleBarLeadingInset: CGFloat = 72
    public init(model: NativeCalendarRootModel) {
        self.model = model
    }

    public var body: some View {
        ZStack(alignment: .top) {
            HStack(spacing: 0) {
                sidebar
                VStack(spacing: 0) {
                    header
                    if model.showsDemoEventsBanner {
                        DemoEventsBannerView {
                            model.dismissDemoEventsBanner()
                        }
                    }
                    content
                }
            }
            pointerHintLayer
            GridFocusAccessibilityOverlay(focusedLabel: model.gridFocusAccessibilityLabel)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .padding(.top, 52)
                .padding(.leading, 268)
        }
        .background(theme.backgroundColor)
        .font(.custom("Rubik", size: 14))
        .overlayPreferenceValue(PageJumpChipAnchorKey.self) { anchors in
            ModHoldChipsOverlay(
                targets: model.focusStore.pageJumpTargets,
                anchors: anchors,
                visible: model.focusStore.pageJumpHintsVisible
            )
        }
        .overlay(alignment: .bottom) {
            UpNextBanner(
                model: model,
                onOpen: { model.openUpNextEvent() },
                onJoin: { model.joinUpNextMeeting() },
                onBannerShown: { event in
                    model.upNextBannerShown(event)
                })
            .padding(.bottom, 24)
        }
        .overlay(alignment: .top) {
            if case let .server(server) = model.billingStore.appAccess,
               server.status == .pastDue
            {
                BillingPastDueBannerView(billingStore: model.billingStore)
            }
        }
        .overlay {
            AuthModalOverlay(authStore: model.authStore, billingStore: model.billingStore)
        }
        .overlay {
            if model.authStore.authenticated, model.billingStore.gateStatus != nil {
                BillingGateOverlay(billingStore: model.billingStore)
            }
        }
        .overlay {
            BillingSettingsOverlay(billingStore: model.billingStore)
        }
        .overlay {
            BillingUpgradeConfirmationSheet(billingStore: model.billingStore)
        }
        .background {
            GeometryReader { geometry in
                Color.clear
                    .onAppear {
                        applyTitleBarInset(geometry.safeAreaInsets.leading)
                        model.updateContentTrackWidth(geometry.size.width - 260)
                    }
                    .onChange(of: geometry.safeAreaInsets.leading) { _, leading in
                        applyTitleBarInset(leading)
                    }
                    .onChange(of: geometry.size.width) { _, width in
                        model.updateContentTrackWidth(width - 260)
                    }
            }
        }
    }

    private func applyTitleBarInset(_ leading: CGFloat) {
        let resolved = max(leading, 72)
        if abs(resolved - titleBarLeadingInset) > 0.5 {
            titleBarLeadingInset = resolved
        }
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 16) {
            UpNextCard(model: model, onOpen: { model.openUpNextEvent() })
            Text("Calendars")
                .font(.custom("Rubik", size: 13, relativeTo: .headline))
                .foregroundStyle(theme.textMutedColor)
            SidebarMonthPicker(
                displayedMonth: $model.monthPickerMonth,
                selectedDate: model.viewStore.anchorDate,
                onSelectDate: { model.goToDate($0) },
                trailingHeader: {
                    TrialBadgeView(billingStore: model.billingStore)
                }
            )
            .pageJumpChipAnchor(id: "month-picker")
            if model.isSignedIn {
                SyncAccountsListView(store: model.syncConnectionsStore)
            }
            Spacer()
            ShortcutSidebarFooter(levelsStore: model.levelsStore)
        }
        .padding(16)
        .pageJumpChipAnchor(id: "calendars")
        .frame(width: 260)
        .background(theme.surfacePanelColor)
        .overlay(alignment: .trailing) {
            Rectangle()
                .fill(theme.borderColor)
                .frame(width: 1)
        }
        .overlay {
            Color.clear
                .accessibilityElement()
                .accessibilityIdentifier("compass-native-sidebar")
                .allowsHitTesting(false)
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            HStack(spacing: 12) {
                headerButton(
                    label: model.viewStore.view == .life ? "Previous life variation" : "Previous",
                    systemImage: "chevron.left"
                ) {
                    model.handleShortcut(model.viewStore.view == .life ? .navLifePrev : .navPrevious)
                }
                headerButton(
                    label: model.viewStore.view == .life ? "Next life variation" : "Next",
                    systemImage: "chevron.right"
                ) {
                    model.handleShortcut(model.viewStore.view == .life ? .navLifeNext : .navNext)
                }
                Text(model.headerTitle)
                    .font(.custom("Rubik", size: 15, relativeTo: .headline))
                    .foregroundStyle(theme.textColor)
                    .lineLimit(1)
                    .accessibilityIdentifier("compass-native-header-title")
                headerButton(
                    label: model.viewStore.view == .life ? "Focus current week" : "Today",
                    systemImage: nil,
                    title: model.viewStore.view == .life ? "This week" : "Today"
                ) {
                    model.handleShortcut(model.viewStore.view == .life ? .navLifeCurrent : .navToday)
                }
            }
            .padding(.leading, titleBarLeadingInset)

            Spacer()
        }
        .frame(height: 48)
        .frame(maxWidth: .infinity)
        .background(theme.surfaceColor)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(theme.borderColor)
                .frame(height: 1)
        }
        .overlay {
            Color.clear
                .accessibilityElement()
                .accessibilityIdentifier("compass-native-header")
                .allowsHitTesting(false)
        }
    }

    private var content: some View {
        Group {
            if model.viewStore.view == .life {
                LifeContentView(model: model)
            } else {
                let focusedEventId = model.timeGridState.focusedEventId
                ZStack(alignment: .topLeading) {
                    TimeGridRepresentable(model: model, focusedEventId: focusedEventId)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .accessibilityElement(children: .contain)
                    EventJumpChipsOverlay(
                        hints: model.timeGridState.eventJumpHints,
                        gridYOffset: gridChipYOffset,
                        visible: !model.timeGridState.eventJumpHints.isEmpty
                    )
                }
                .background(theme.backgroundColor)
                .accessibilityIdentifier("compass-native-content")
            }
        }
    }

    private var gridChipYOffset: CGFloat {
        let colWidths = model.timeGridState.resolvedColumnWidths()
        let metrics = model.timeGridState.snapshot(colWidths: colWidths).metrics
        return GridTimeConstants.timedContentDocumentYOffset(
            allDayRowHeight: metrics.allDayRowHeight
        )
    }

    @ViewBuilder
    private var pointerHintLayer: some View {
        if model.pointerHintStore.isVisible {
            PointerHintView(store: model.pointerHintStore, registry: model.shortcutRegistry)
                .padding(.top, 16)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .allowsHitTesting(true)
        }
    }

    @ViewBuilder
    private func headerButton(
        label: String,
        systemImage: String?,
        title: String? = nil,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Group {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 12, weight: .semibold))
                } else if let title {
                    Text(title)
                        .font(.custom("Rubik", size: 13, relativeTo: .body))
                }
            }
            .foregroundStyle(theme.textMutedColor)
            .frame(minWidth: 28, minHeight: 28)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
