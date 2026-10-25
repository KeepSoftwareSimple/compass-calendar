import AppKit
import CompassData
import CompassKit
import SwiftUI

public struct RootView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable public var model: NativeCalendarRootModel
    /// Web `SIDEBAR_DIVIDER_WIDTH`: the resize handle's column.
    private let sidebarDividerWidth: CGFloat = 32
    /// Web main column `pl-8`.
    private let contentLeadingInset: CGFloat = 32
    public init(model: NativeCalendarRootModel) {
        self.model = model
    }

    private var calendarShell: some View {
        ZStack(alignment: .top) {
            HStack(spacing: 0) {
                VStack(spacing: 0) {
                    if let banner = model.connectionBanner {
                        CalendarConnectionBannerView(banner: banner) {
                            model.runConnectionBannerAction()
                        }
                        .noticeFocusRing(model.focusedNotice == .connectionBanner)
                        .padding(.leading, contentLeadingInset)
                    }
                    if let copy = model.timezoneMismatchCopy {
                        TimezoneMismatchBannerView(
                            copy: copy,
                            onSwitch: { model.switchToDeviceTimeZone() },
                            onKeep: { model.keepPinnedTimeZone() })
                        .padding(.leading, contentLeadingInset)
                    }
                    if model.viewStore.view != .life, model.showsDemoEventsBanner {
                        DemoEventsBannerView {
                            model.dismissDemoEventsBanner()
                        }
                        .noticeFocusRing(model.focusedNotice == .demoEvents)
                        .padding(.leading, contentLeadingInset)
                    }
                    content
                        .padding(.leading, contentLeadingInset)
                        .frame(
                            minWidth: UITestLaunchPolicy.isParityCapture
                                ? CGFloat(ParityCaptureGeometry.contentTrackWidth)
                                : 0
                        )
                }
                .padding(.top, MacTitleBarChromeMetrics.mainContentTopInset)
                // Web: Day/Week keep the panel mounted for event details even
                // when the sidebar preference is closed.
                if model.isSidebarOpen || model.isEventFormVisible {
                    HStack(spacing: 0) {
                        sidebarResizeHandle
                        sidebar
                    }
                    .padding(.top, MacTitleBarChromeMetrics.mainContentTopInset)
                }
            }
            titleBarChrome
                .frame(maxWidth: .infinity, alignment: .leading)
            pointerHintLayer
            GridFocusAccessibilityOverlay(focusedLabel: model.gridFocusAccessibilityLabel)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .padding(.top, MacTitleBarChromeMetrics.mainContentTopInset + 8)
                .padding(.leading, contentLeadingInset + 8)
        }
    }

    private var calendarWithBanners: some View {
        calendarShell
        .background(theme.backgroundColor)
        .font(.rubik(14))
        .overlayPreferenceValue(PageJumpChipAnchorKey.self) { anchors in
            ModHoldChipsOverlay(
                targets: model.focusStore.pageJumpTargets,
                anchors: anchors,
                visible: model.focusStore.pageJumpHintsVisible
            )
        }
        .overlay(alignment: .bottom) {
            VStack(spacing: 12) {
                if model.desktopUpdateReadyVersion != nil {
                    DesktopUpdateReadyBannerView {
                        model.onDesktopRestartToUpdate?()
                    }
                    .noticeFocusRing(model.focusedNotice == .updateReady)
                }
                if model.viewStore.view != .life {
                UpNextBanner(
                    model: model,
                    onOpen: { model.openUpNextEvent() },
                    onJoin: { model.joinUpNextMeeting() },
                    onBannerShown: { event in
                        model.upNextBannerShown(event)
                    })
                }
            }
            .padding(.bottom, 24)
        }
        .overlay(alignment: .top) {
            if case let .server(server) = model.billingStore.appAccess,
               server.status == .pastDue
            {
                BillingPastDueBannerView(billingStore: model.billingStore)
                    .noticeFocusRing(model.focusedNotice == .billingPastDue)
            }
        }
    }

    private var calendarWithOnboarding: some View {
        calendarWithBanners
        .overlay {
            if model.authStore.isModalPresented, model.activeOnboardingSurface != .welcomeModal {
                AuthModalOverlay(authStore: model.authStore, billingStore: model.billingStore)
            }
        }
        .blur(radius: model.isWelcomeModalActive ? NativeWebLayoutTokens.blurSmall : 0)
        .overlay {
            OnboardingOverlay(model: model)
        }
        .overlay {
            if model.isLifeViewIntroActive {
                LifeViewIntroModalView(model: model)
            }
        }
        .onAppear {
            model.refreshLifeViewIntro()
        }
        .onChange(of: model.viewStore.view) { _, _ in
            model.refreshLifeViewIntro()
        }
        .overlay {
            if model.showsLocalModeConnectPrompt {
                LocalModeConnectPromptView(model: model)
            }
        }
        .overlay {
            BlockPartyOverlay(model: model)
        }
        .overlay {
            if model.authStore.authenticated, model.billingStore.gateStatus != nil {
                BillingGateOverlay(billingStore: model.billingStore)
            }
        }
        .blur(radius: model.settingsStore.isPresented ? NativeWebLayoutTokens.blurSmall : 0)
        .overlay {
            SettingsWindowOverlay(model: model)
        }
        .overlay {
            BillingUpgradeConfirmationSheet(billingStore: model.billingStore)
        }
    }

    private var calendarWithTools: some View {
        calendarWithOnboarding
        .blur(radius: model.overlayStores.palette.isOpen ? NativeWebLayoutTokens.blurSmall : 0)
        .overlay {
            CommandPaletteOverlay(model: model)
        }
        .overlay {
            ShortcutsLegendOverlay(model: model)
        }
        .overlay {
            WhichKeyPanelOverlay(model: model)
        }
        .overlay {
            EventContextMenuOverlay(model: model)
        }
        .overlay {
            StatusToastOverlay(model: model)
        }
    }

    public var body: some View {
        calendarWithTools
        .overlay {
            DedicationDialogView(
                isPresented: model.dedicationDialogVisible,
                onClose: { model.dedicationDialogVisible = false }
            )
        }
        .overlay {
            LogoutConfirmationDialogView(model: model)
        }
        .overlay {
            DeleteAccountConfirmationDialogView(model: model)
        }
        .overlay {
            FeedbackDialogView(model: model)
        }
        .overlay {
            DiscardUnsavedDraftDialogView(
                isPresented: model.pendingDiscardDraftConfirmation,
                onCancel: { model.cancelDiscardDraftConfirmation() },
                onDiscard: { model.discardDraftConfirmed() }
            )
        }
        .overlay {
            RecurrenceScopeDialogView(
                isPresented: model.pendingRecurrenceScopePrompt != nil,
                title: model.pendingRecurrenceScopePrompt == .delete
                    ? "Delete recurring event"
                    : "Save recurring event",
                onCancel: { model.cancelRecurrenceScopePrompt() },
                onConfirm: { scope in Task { await model.confirmRecurrenceScope(scope) } }
            )
        }
        .overlay {
            ConvertToStandaloneDialogView(
                isPresented: model.pendingConvertToStandaloneConfirmation,
                eventTitle: model.draftStore.gridDraft?.title.isEmpty == false
                    ? (model.draftStore.gridDraft?.title ?? "this event")
                    : "this event",
                onCancel: { model.cancelConvertToStandaloneConfirmation() },
                onConfirm: { Task { await model.confirmConvertToStandalone() } }
            )
        }
        .overlay {
            SendInvitationsDialogView(
                prompt: model.invitationPrompt,
                onCancel: { model.cancelInvitationPrompt() },
                onDontSend: { model.confirmInvitationDontSend() },
                onSend: { model.confirmInvitationSend() }
            )
        }
        .overlay {
            RsvpScopeDialogView(
                isPresented: model.pendingRsvpChoice != nil,
                onCancel: { model.cancelRsvpScopeDialog() },
                onConfirm: { scope in Task { await model.confirmRsvpScope(scope) } }
            )
        }
    }

    /// Web `ResizableSidebarPanel`: drag the divider column to resize. The
    /// sidebar sits on the right, so dragging left widens it.
    private var sidebarResizeHandle: some View {
        SidebarResizeHandle(width: model.sidebarWidth,
            onResize: { model.resizeSidebar(to: $0) }, onCommit: { model.saveSidebarWidth() })
            .frame(width: sidebarDividerWidth)
    }

    /// Mirrors the web sidebar: month picker, Up Next, accounts, then the
    /// status line and the actions bar pinned to the bottom.
    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 0) {
            if model.isEventFormVisible {
                EventFormView(model: model)
            } else if model.viewStore.view == .life {
                LifeSidebarView(model: model)
            } else {
                sidebarBody
            }
            QuickTimeStatusLine(model: model)
                .padding(.horizontal, 16)
                .padding(.bottom, 2)
            EventJumpStatusLine(model: model)
                .padding(.horizontal, 16)
                .padding(.bottom, 2)
            SidebarSyncStatusLine(model: model)
                .padding(.horizontal, 16)
                .padding(.bottom, 4)
            ShortcutSidebarFooter(
                levelsStore: model.levelsStore,
                isEventFormVisible: model.isEventFormVisible,
                suppressTips: model.eventJumpStatusText != nil || model.focusStore.pageJumpHintsVisible,
                suppressForQuickTime: !model.draftStore.quickTimeDigits.isEmpty)
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
            sidebarActions
        }
        .frame(width: model.sidebarWidth)
        .frame(maxHeight: .infinity)
        .background(theme.surfacePanelColor)
        .overlay(alignment: .leading) {
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

    private var sidebarBody: some View {
        VStack(alignment: .leading, spacing: 24) {
            SidebarMonthPicker(
                displayedMonth: Binding(get: { model.monthPickerMonth }, set: { model.browseMonth($0) }),
                selectedDate: model.viewStore.anchorDate,
                onSelectDate: { model.goToDate($0) },
                focusedDate: model.monthPickerFocusDate,
                visibleDayCount: model.viewStore.visibleDayCount,
                today: model.referenceNow,
                trailingHeader: {
                    TrialBadgeView(billingStore: model.billingStore)
                }
            )
            .pageJumpChipAnchor(id: "month-picker")
            UpNextCard(model: model, onOpen: { model.openUpNextEvent() })
            CalendarListView(model: model)
                .pageJumpChipAnchor(id: "calendars")
            if model.showsMeetingPageNudge {
                MeetingPageNudgeView(model: model)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
        .padding(.bottom, 20)
    }

    /// Web `SidebarActions`: one leading group; refresh trails so stable icons never shift.
    private var sidebarActions: some View {
        HStack(spacing: 8) {
            sidebarActionButton(
                label: model.shortcutsLegendStore.isOpen ? "Close shortcuts" : "Open shortcuts",
                icon: .keyboard
            ) {
                model.toggleShortcutsLegend()
            }
            sidebarActionButton(label: "Open settings", icon: .gear) {
                model.settingsStore.open()
            }
            sidebarActionButton(label: "Open command palette", icon: .command) {
                model.toggleCommandPalette()
            }
            ShortcutLevelBadgeView(levelsStore: model.levelsStore) { model.toggleShortcutsLegend() }
            SidebarRefreshButton(model: model)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .frame(height: 48)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(theme.borderColor)
                .frame(height: 1)
        }
    }

    private func sidebarActionButton(
        label: String,
        icon: PhosphorIcon,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            PhosphorIconView(icon: icon, size: 16)
                .frame(width: 36, height: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(label)
        .accessibilityLabel(label)
    }

    /// Unified title bar: nav and view switcher beside traffic lights; sidebar toggle on the right.
    private var titleBarChrome: some View {
        ZStack(alignment: .top) {
            theme.backgroundColor
                .frame(maxWidth: .infinity)
                .frame(height: MacTitleBarChromeMetrics.contentBandHeight)
                .accessibilityIdentifier("compass-native-header")
            HStack(spacing: 12) {
                HStack(spacing: 12) {
                    titleBarNavButton(
                        label: model.viewStore.view == .life ? "Previous life variation" : "Previous",
                        symbol: "arrow.left"
                    ) {
                        model.handleShortcut(model.viewStore.view == .life ? .navLifePrev : .navPrevious)
                    }
                    titleBarNavButton(
                        label: model.viewStore.view == .life ? "Next life variation" : "Next",
                        symbol: "arrow.right"
                    ) {
                        model.handleShortcut(model.viewStore.view == .life ? .navLifeNext : .navNext)
                    }
                    ViewSwitcherView(model: model)
                }
                .padding(.leading, MacTitleBarChromeMetrics.trafficLightLeadingInset)

                Spacer(minLength: 0)

                titleBarNavButton(
                    label: model.isSidebarOpen ? "Close sidebar" : "Open sidebar",
                    symbol: "sidebar.left",
                    symbolSize: 12
                ) {
                    model.isSidebarOpen.toggle()
                }
                .padding(.trailing, 20)
                .compositingGroup()
            }
            .frame(height: MacTitleBarChromeMetrics.contentBandHeight)
        }
        .frame(maxWidth: .infinity, alignment: .top)
        .frame(width: mainTrackColumnWidth, alignment: .topLeading)
    }

    /// Main calendar column width during parity capture (excludes open sidebar chrome).
    private var mainTrackColumnWidth: CGFloat? {
        guard UITestLaunchPolicy.isParityCapture else { return nil }
        let sidebarChrome: CGFloat =
            (model.isSidebarOpen || model.isEventFormVisible)
            ? sidebarDividerWidth + model.sidebarWidth
            : 0
        return CGFloat(ParityCaptureGeometry.viewportWidth) - sidebarChrome
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
                    QuickTimeSlotsOverlay(
                        hints: model.timeGridState.quickTimeSlotHints,
                        gridYOffset: gridChipYOffset,
                        visible: model.eventJumpSelection.modeActive
                    )
                }
                .background(theme.backgroundColor)
                .accessibilityIdentifier("compass-native-content")
            }
        }
        .background {
            GeometryReader { geometry in
                Color.clear
                    .onAppear { model.updateContentTrackWidth(geometry.size.width) }
                    .onChange(of: geometry.size.width) { _, width in
                        model.updateContentTrackWidth(width)
                    }
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
        if model.activeOnboardingSurface == .pointerHint, model.pointerHintStore.isVisible {
            PointerHintView(store: model.pointerHintStore, registry: model.shortcutRegistry)
                .padding(.top, 16)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .allowsHitTesting(true)
        }
    }

    private func titleBarNavButton(
        label: String,
        symbol: String,
        symbolSize: CGFloat = 14,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: symbolSize, weight: .regular))
                .foregroundStyle(theme.textMutedColor)
                .frame(width: 24, height: 24)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(label)
        .accessibilityLabel(label)
    }
}
