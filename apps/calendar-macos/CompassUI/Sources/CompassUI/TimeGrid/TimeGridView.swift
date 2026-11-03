import AppKit
import CompassKit

@MainActor
public protocol TimeGridViewDelegate: AnyObject {
    func timeGridViewDidRequestShortcutHint(_ view: TimeGridView, at locationInWindow: NSPoint)
    func timeGridView(_ view: TimeGridView, didClickEvent eventId: String)
    func timeGridView(_ view: TimeGridView, didEditDraftTitle title: String, eventId: String)
    func timeGridView(_ view: TimeGridView, didOpenEventMenu eventId: String, at locationInWindow: NSPoint)
    func timeGridViewDidRequestTimeTravel(_ view: TimeGridView)
    func timeGridView(_ view: TimeGridView, didFocusDayColumn calendarId: String)
}

extension TimeGridViewDelegate {
    public func timeGridViewDidRequestTimeTravel(_ view: TimeGridView) {}
    public func timeGridView(_ view: TimeGridView, didFocusDayColumn calendarId: String) {}
}

@MainActor
public final class TimeGridView: NSView {
    public weak var delegate: TimeGridViewDelegate?
    public var onNowCuePulse: (() -> Void)?

    private let scrollView = GridScrollView()
    private let documentView = FlippedView()
    /// Holds the weekday header and all-day row outside the scroll view so
    /// they stay pinned while the timed grid scrolls (web sticky header).
    private let pinnedHeaderView = FlippedView()
    private let allDayRowView = AllDayRowRoutingView()
    private let timedContentView = CardRoutingFlippedView()
    private let hourGutterView = FlippedView()
    private let headerRowView = FlippedView()
    private let nowLineView = NSView()
    private let nowLineGradientLayer = CAGradientLayer()

    private var cardPool: [String: EventCardView] = [:]
    private let focusedEventAccessibilityProxy = FocusedGridEventAccessibilityProxy(frame: .zero)
    private var state: TimeGridState
    private var theme: NativeWebTheme
    private var snapshot: GridLayoutSnapshot?
    private var lastScrollSyncHourHeight: Double?

    public override var isFlipped: Bool { true }

    public init(state: TimeGridState, theme: NativeWebTheme) {
        self.state = state
        self.theme = theme
        super.init(frame: .zero)
        wantsLayer = true
        scrollView.timeGridView = self
        allDayRowView.grid = self
        configureScrollView()
        configureNowLine()
        relayout()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    public func update(state: TimeGridState, theme: NativeWebTheme) {
        self.state = state
        self.theme = theme
        relayout()
    }

    public override func layout() {
        super.layout()
        relayout()
    }

    public override func mouseDown(with event: NSEvent) {
        if let card = eventCardView(at: event.locationInWindow) {
            card.mouseDown(with: event)
            return
        }
        delegate?.timeGridViewDidRequestShortcutHint(self, at: event.locationInWindow)
    }

    /// Maps an empty grid click to the keyboard-teaching target (web `gridPointerTargetFromEvent`).
    public func resolveEmptyGridClick(at locationInWindow: NSPoint) -> GridPointerClickTarget? {
        guard let snapshot else { return nil }
        let timeZone = TimeZone(identifier: state.effectiveTimeZone) ?? EffectiveTimeZone.timeZone
        let scrollX = scrollView.contentView.bounds.origin.x
        let visibleDateKeys = state.scenario.visibleDateKeys

        let pointInPinned = pinnedHeaderView.convert(locationInWindow, from: nil)
        if allDayRowView.frame.contains(pointInPinned) {
            let x = pointInPinned.x + scrollX
            let dateKey = dateKeyForPointer(atX: x, snapshot: snapshot, visibleDateKeys: visibleDateKeys)
            return .allDaySlot(dateKey: dateKey)
        }

        let pointInContent = scrollView.contentView.convert(locationInWindow, from: nil)
        let pointInDocument = documentView.convert(pointInContent, from: scrollView.contentView)
        let gridHeight = snapshot.metrics.timedGridHeight
        guard gridHeight > 0 else { return nil }

        let x = pointInDocument.x
        let dateKey = dateKeyForPointer(atX: x, snapshot: snapshot, visibleDateKeys: visibleDateKeys)
        guard let slot = GridPointerClickResolver.timedSlot(
            atY: pointInDocument.y,
            gridHeight: gridHeight,
            dateKey: dateKey,
            timeZone: timeZone
        ) else { return nil }

        return .timedSlot(
            dateKey: dateKey,
            timeKey: slot.timeKey,
            timeLabel: slot.timeLabel,
            startISO: slot.startISO
        )
    }

    private func dateKeyForPointer(
        atX x: Double,
        snapshot: GridLayoutSnapshot,
        visibleDateKeys: [String]
    ) -> String {
        if state.layoutMode == .day {
            return visibleDateKeys.first ?? CompassDateParsing.formatCalendarDay(state.referenceNow)
        }
        return GridPointerClickResolver.dateKey(
            atX: x,
            columns: snapshot.columns,
            visibleDateKeys: visibleDateKeys
        ) ?? visibleDateKeys.first ?? CompassDateParsing.formatCalendarDay(state.referenceNow)
    }

    private func pointInDocumentView(_ locationInWindow: NSPoint) -> NSPoint {
        let pointInContentView = scrollView.contentView.convert(locationInWindow, from: nil)
        return documentView.convert(pointInContentView, from: scrollView.contentView)
    }

    func eventCardView(at locationInWindow: NSPoint) -> EventCardView? {
        if let hit = eventCardViewMatchingDocumentPoint(pointInDocumentView(locationInWindow)) {
            return hit
        }

        for view in cardPool.values {
            if view.containsPointInWindow(locationInWindow) {
                return view
            }
        }
        for view in cardPool.values {
            let pointInCard = view.convert(locationInWindow, from: nil)
            if view.bounds.width > 0.5, view.bounds.height > 0.5, view.bounds.contains(pointInCard) {
                return view
            }
        }
        return nil
    }

    private func eventCardViewMatchingDocumentPoint(_ documentPoint: NSPoint) -> EventCardView? {
        var smallestHit: (view: EventCardView, area: Double)?
        for view in cardPool.values {
            guard view.containsPointInDocument(documentPoint, documentView: documentView) else { continue }
            let area = Double(view.layoutRectInParent.width * view.layoutRectInParent.height)
            if smallestHit == nil || area < smallestHit!.area {
                smallestHit = (view: view, area: area)
            }
        }
        return smallestHit?.view
    }

    public func applyScroll(_ request: TimeGridScrollRequest) {
        guard let snapshot else { return }
        let hourHeight = snapshot.metrics.hourHeight
        let pageDelta = scrollView.contentView.bounds.height
        var origin = scrollView.contentView.bounds.origin
        switch request {
        case .revealDocumentY(let documentY):
            origin.y = documentY
        case .pageUp:
            origin.y -= pageDelta
        case .hourUp:
            origin.y -= hourHeight
        case .pageDown:
            origin.y += pageDelta
        case .hourDown:
            origin.y += hourHeight
        case .scrollToNowOrPulse:
            scrollToNowOrPulse()
            return
        }
        origin.y = clampedScrollY(origin.y)
        scrollView.contentView.scroll(to: origin)
        scrollView.reflectScrolledClipView(scrollView.contentView)
    }

    private func clampedScrollY(_ y: Double) -> Double {
        GridScrollMath.clampedScrollY(
            y,
            documentHeight: documentView.frame.height,
            viewportHeight: scrollView.contentView.bounds.height
        )
    }

    private func scrollToNowOrPulse() {
        clampWeekHorizontalScrollOrigin()
        guard let snapshot, let nowLine = snapshot.nowLine else { return }
        // The scroll document is the timed grid alone; the header is pinned above it.
        let targetY = clampedScrollY(GridScrollMath.scrollToNowDocumentY(
            referenceNow: state.referenceNow,
            hourHeight: snapshot.metrics.hourHeight,
            allDayOffset: 0
        ))
        let viewport = scrollView.contentView.bounds
        let nowLineVisible = nowLine.top >= viewport.minY && nowLine.top <= viewport.maxY
        var origin = scrollView.contentView.bounds.origin
        origin.y = targetY
        scrollView.contentView.scroll(to: origin)
        scrollView.reflectScrolledClipView(scrollView.contentView)
        clampWeekHorizontalScrollOrigin()
        syncPinnedHeaderScrollX()
        if nowLineVisible { pulseNowCue() }
    }

    private func pulseNowCue() {
        let accent = themeAccentColor
        nowLineView.layer?.add(
            nowCuePulseAnimation(keyPath: "opacity", from: 1, to: 0.35),
            forKey: "nowCuePulse"
        )

        let todayKey = CompassDateParsing.formatCalendarDay(state.referenceNow)
        if state.layoutMode == .week {
            for subview in headerRowView.subviews {
                guard let header = subview as? NSTextField, header.identifier?.rawValue == todayKey else {
                    continue
                }
                pulseHeaderLabel(header, accent: accent)
            }
        } else {
            onNowCuePulse?()
        }
    }

    private func pulseHeaderLabel(_ header: NSTextField, accent: NSColor) {
        header.wantsLayer = true
        header.layer?.add(
            nowCuePulseAnimation(keyPath: "opacity", from: 1, to: 0.55),
            forKey: "nowCueLabelShimmer"
        )
        if let attributed = header.attributedStringValue.mutableCopy() as? NSMutableAttributedString {
            attributed.addAttribute(.foregroundColor, value: accent, range: NSRange(location: 0, length: attributed.length))
            header.attributedStringValue = attributed
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { [weak header] in
                guard let header else { return }
                header.layer?.opacity = 1
            }
        }
    }

    private func nowCuePulseAnimation(keyPath: String, from: Any?, to: Any?) -> CABasicAnimation {
        let pulse = CABasicAnimation(keyPath: keyPath)
        pulse.fromValue = from
        pulse.toValue = to
        pulse.duration = 0.7
        pulse.autoreverses = true
        pulse.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        return pulse
    }

    public override func rightMouseDown(with event: NSEvent) {
        if let card = eventCardView(at: event.locationInWindow) {
            delegate?.timeGridView(self, didOpenEventMenu: card.eventId, at: event.locationInWindow)
            return
        }
    }

    private func configureScrollView() {
        scrollView.drawsBackground = false
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = true
        scrollView.autohidesScrollers = true
        scrollView.borderType = .noBorder
        scrollView.documentView = documentView
        addSubview(scrollView)

        pinnedHeaderView.wantsLayer = true
        pinnedHeaderView.layer?.masksToBounds = true
        pinnedHeaderView.addSubview(headerRowView)
        pinnedHeaderView.addSubview(allDayRowView)
        addSubview(pinnedHeaderView)

        // The gutter sits above the opaque timed layer so its hour labels show.
        documentView.addSubview(timedContentView)
        documentView.addSubview(hourGutterView)
        hourGutterView.wantsLayer = true

        scrollView.contentView.postsBoundsChangedNotifications = true
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(clipViewBoundsDidChange(_:)),
            name: NSView.boundsDidChangeNotification,
            object: scrollView.contentView
        )

        timedContentView.wantsLayer = true
        timedContentView.setAccessibilityElement(true)
        timedContentView.setAccessibilityRole(.group)
        timedContentView.setAccessibilityIdentifier("compass-grid-timed")
        allDayRowView.setAccessibilityElement(true)
        allDayRowView.setAccessibilityRole(.group)
        allDayRowView.setAccessibilityIdentifier("compass-grid-allday")
    }

    private func configureNowLine() {
        nowLineView.wantsLayer = true
        nowLineView.setAccessibilityElement(false)
    }

    /// Day view scrolls horizontally; the pinned header follows the clip view's x.
    @objc private func clipViewBoundsDidChange(_ notification: Notification) {
        clampWeekHorizontalScrollOrigin()
        syncPinnedHeaderScrollX()
        updateVisibleCardContent()
    }

    private func updateVisibleCardContent() {
        for view in timedContentView.subviews.compactMap({ $0 as? EventCardView }) {
            view.updateVisibleContentRect(view.convert(scrollView.contentView.bounds, from: scrollView.contentView))
        }
    }

    private func syncPinnedHeaderScrollX() {
        guard state.layoutMode == .day else {
            pinnedHeaderView.setBoundsOrigin(.zero)
            return
        }
        pinnedHeaderView.setBoundsOrigin(NSPoint(x: scrollView.contentView.bounds.origin.x, y: 0))
    }

    /// Week view never scrolls horizontally; a non-zero x clips the gutter and first column.
    private func clampWeekHorizontalScrollOrigin() {
        guard state.layoutMode == .week else { return }
        var origin = scrollView.contentView.bounds.origin
        guard origin.x != 0 else { return }
        origin.x = 0
        scrollView.contentView.scroll(to: origin)
        scrollView.reflectScrolledClipView(scrollView.contentView)
    }

    private func relayout() {
        let colWidths = state.resolvedColumnWidths()
        let viewportHeight = scrollView.contentView.bounds.height
        let hourHeight: Double
        if viewportHeight > 1 {
            hourHeight = viewportHeight / Double(GridTimeConstants.timedVisibleHours)
        } else {
            hourHeight = 60
        }
        let snapshot = state.snapshot(colWidths: colWidths, hourHeight: hourHeight)
        self.snapshot = snapshot

        let marginLeft = snapshot.metrics.marginLeft
        let gridHeight = hourHeight * state.civilDayHours
        let allDayHeight = snapshot.metrics.allDayRowHeight
        let headerHeight = GridTimeConstants.dayHeaderRowHeight
        let pinnedHeight = GridTimeConstants.timedContentDocumentYOffset(allDayRowHeight: allDayHeight)

        let contentWidth = max(bounds.width, state.documentContentWidth())
        scrollView.hasHorizontalScroller = state.layoutMode == .day && contentWidth > bounds.width + 1
        pinnedHeaderView.frame = NSRect(x: 0, y: 0, width: bounds.width, height: pinnedHeight)
        scrollView.frame = NSRect(
            x: 0,
            y: pinnedHeight,
            width: bounds.width,
            height: max(0, bounds.height - pinnedHeight)
        )
        documentView.frame = NSRect(
            x: 0,
            y: 0,
            width: contentWidth,
            height: gridHeight + GridTimeConstants.gridPaddingBottom
        )
        headerRowView.frame = NSRect(x: 0, y: 0, width: contentWidth, height: headerHeight)
        allDayRowView.frame = NSRect(x: 0, y: headerHeight, width: contentWidth, height: allDayHeight)
        hourGutterView.frame = NSRect(x: 0, y: 0, width: marginLeft, height: gridHeight)
        timedContentView.frame = NSRect(x: 0, y: 0, width: contentWidth, height: gridHeight)
        syncPinnedHeaderScrollX()

        renderHourGutter(snapshot: snapshot, hourHeight: hourHeight)
        renderHeaders(snapshot: snapshot, headerHeight: headerHeight)
        renderAllDayColumns(snapshot: snapshot, allDayHeight: allDayHeight, headerHeight: headerHeight)
        renderTimedGrid(snapshot: snapshot, hourHeight: hourHeight, gridHeight: gridHeight)
        renderCards(snapshot: snapshot)
        updateNowLine()
        clampWeekHorizontalScrollOrigin()
        syncPinnedHeaderScrollX()
        syncScrollToNowAfterViewportHourHeightChange(hourHeight: hourHeight, viewportHeight: viewportHeight)
    }

    /// Web `getMinuteHeight(clientHeight)`: scroll targets depend on viewport, not a fixed 60px hour.
    private func syncScrollToNowAfterViewportHourHeightChange(hourHeight: Double, viewportHeight: Double) {
        guard viewportHeight > 1 else { return }
        let changed = lastScrollSyncHourHeight.map { abs($0 - hourHeight) > 0.25 } ?? true
        guard changed else { return }
        lastScrollSyncHourHeight = hourHeight
        scrollToNowOrPulse()
    }

    private func renderHourGutter(
        snapshot: GridLayoutSnapshot,
        hourHeight: Double
    ) {
        hourGutterView.subviews.forEach { $0.removeFromSuperview() }
        let palette = themePalette
        hourGutterView.layer?.backgroundColor = palette.background.cgColor
        let columnWidth = GridMetrics.gridTimeColumnWidth
        let currentHour = EffectiveTimeZone.calendar.component(.hour, from: state.hourLabelDate)

        if state.hasSecondaryTimeZone, let travelZone = state.timeTravelTimeZone {
            let mapped = MappedHourLabels.labels(
                effectiveTimeZone: state.effectiveTimeZone,
                displayTimeZone: travelZone,
                at: state.hourLabelDate)
            renderHourColumn(
                labels: mapped,
                xOffset: 0,
                width: columnWidth,
                hourHeight: hourHeight,
                palette: palette,
                currentHour: currentHour)
        }

        let primaryLabels = MappedHourLabels.labels(
            effectiveTimeZone: state.effectiveTimeZone,
            displayTimeZone: state.effectiveTimeZone,
            at: state.hourLabelDate)
        let primaryX = state.hasSecondaryTimeZone ? columnWidth : 0
        renderHourColumn(
            labels: primaryLabels,
            xOffset: primaryX,
            width: columnWidth,
            hourHeight: hourHeight,
            palette: palette,
            currentHour: currentHour)
    }

    private func renderHourColumn(
        labels: [String],
        xOffset: Double,
        width: Double,
        hourHeight: Double,
        palette: (background: NSColor, surface: NSColor, surfaceRaised: NSColor, border: NSColor, text: NSColor, textMuted: NSColor),
        currentHour: Int
    ) {
        // Web `HourLabelColumn` (#4686): one hour slot per label from 1 AM,
        // starting at the top of the track, the same 1 AM origin cards, hour
        // lines and the now line use (`timedGridTopPx`). The old
        // `calc(100% / TIMED_VISIBLE_HOURS - 5px)` offset plus an empty first
        // slot drew every label two hours below its events.
        for (index, text) in labels.enumerated() {
            let label = NSTextField(labelWithString: text)
            label.font = CompassFont.nsFont(size: 10)
            label.textColor = index + 1 == currentHour ? themeAccentColor : palette.textMuted
            label.alignment = .center
            label.frame = NSRect(
                x: xOffset + 4,
                y: Double(index) * hourHeight + 1,
                width: width - 8,
                height: 14)
            hourGutterView.addSubview(label)
        }
    }

    public func focusDayColumn(calendarId: String) {
        guard state.layoutMode == .day else { return }
        for case let header as DayCalendarColumnHeaderControl in headerRowView.subviews {
            if header.calendarId == calendarId {
                window?.makeFirstResponder(header)
                return
            }
        }
    }

    private func renderHeaders(snapshot: GridLayoutSnapshot, headerHeight: Double) {
        headerRowView.subviews.forEach { $0.removeFromSuperview() }
        let palette = themePalette
        headerRowView.layer?.backgroundColor = palette.background.cgColor

        renderTimezoneHeader(snapshot: snapshot, headerHeight: headerHeight, palette: palette)

        if state.layoutMode == .day {
            let dayCalendars = state.scenario.dayViewCalendarsForLayout()
            let columnDisplayNames = DayCalendarColumnDisplayName.displayNames(
                for: dayCalendars.map(\.name)
            )
            let displayNameByCalendarId = Dictionary(
                uniqueKeysWithValues: zip(dayCalendars.map(\.id), columnDisplayNames)
            )
            for column in snapshot.columns {
                guard let calendar = dayCalendars.first(where: { $0.id == column.key }) else {
                    continue
                }
                let header = DayCalendarColumnHeaderControl(
                    frame: NSRect(x: column.left, y: 4, width: column.width, height: headerHeight - 8)
                )
                header.onFocus = { [weak self] calendarId in
                    guard let self else { return }
                    delegate?.timeGridView(self, didFocusDayColumn: calendarId)
                }
                header.apply(
                    calendar: calendar,
                    displayName: displayNameByCalendarId[calendar.id] ?? calendar.name,
                    jumpDigit: state.pageJumpDigitByCalendarId[calendar.id],
                    hintsVisible: state.pageJumpHintsVisible,
                    isFocused: state.focusedDayColumnCalendarId == calendar.id,
                    palette: (text: palette.text, accent: themeAccentColor, surface: palette.surface)
                )
                headerRowView.addSubview(header)
            }
            return
        }

        let todayKey = CompassDateParsing.formatCalendarDay(state.referenceNow)
        let viewStartMonth = snapshot.columns.first.map { String($0.key.prefix(7)) }
        for column in snapshot.columns {
            let frame = NSRect(x: column.left, y: 6, width: column.width, height: headerHeight - 8)
            let header: NSView
            if state.showDayJumpPrefixes {
                // Web `DayLabels` swaps the weekday for a ⇧SU / ⇧M keycap while
                // Mod is held or event jump is active.
                let control = WeekDayColumnHeaderControl(frame: frame)
                control.apply(
                    dayKey: column.key,
                    viewStartMonth: viewStartMonth,
                    isToday: column.key == todayKey,
                    isJumpDay: state.eventJumpActiveDayKeys.contains(column.key),
                    showDayJumpPrefixes: true,
                    dayJumpUseShiftPrefix: state.dayJumpUseShiftPrefix,
                    numberSize: weekDayNumberSize(trackWidth: state.trackWidth),
                    palette: (
                        text: palette.text,
                        textMuted: palette.textMuted,
                        accent: themeAccentColor,
                        surfacePanel: themeSurfacePanelColor,
                        border: palette.border,
                        background: palette.background
                    )
                )
                header = control
            } else {
                let label = NSTextField(
                    labelWithAttributedString: weekDayLabel(
                        dayKey: column.key,
                        viewStartMonth: viewStartMonth,
                        color: column.key == todayKey ? themeAccentColor : palette.textMuted,
                        trackWidth: state.trackWidth
                    )
                )
                label.frame = frame
                label.alignment = .center
                header = label
            }
            header.identifier = NSUserInterfaceItemIdentifier(column.key)
            header.setAccessibilityIdentifier(column.accessibilityIdentifier)
            if let date = CompassDateParsing.calendarDateInEffectiveTimeZone(column.key) {
                let formatter = DateFormatter()
                formatter.locale = Locale(identifier: "en_US_POSIX")
                formatter.calendar = EffectiveTimeZone.calendar
                formatter.timeZone = EffectiveTimeZone.timeZone
                formatter.dateFormat = "d EEE"
                header.setAccessibilityLabel(formatter.string(from: date))
            }
            headerRowView.addSubview(header)
        }
    }

    /// Web `DayLabels`: a large day number ("7", or "Jul 1" when the month
    /// changes mid-view) followed by the short weekday, centered in the
    /// column. Today is accented. Sizes follow web's container-query clamps:
    /// number `clamp(xl, 2.7cqw, xxl)`, weekday `clamp(m, 2cqw, l)`.
    private func weekDayLabel(
        dayKey: String,
        viewStartMonth: String?,
        color: NSColor,
        trackWidth: CGFloat
    ) -> NSAttributedString {
        guard let date = CompassDateParsing.calendarDateInEffectiveTimeZone(dayKey) else {
            return NSAttributedString(string: dayKey)
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = EffectiveTimeZone.calendar
        formatter.timeZone = EffectiveTimeZone.timeZone
        let isNewMonth = dayKey.hasSuffix("-01") && viewStartMonth.map { !dayKey.hasPrefix($0) } == true
        formatter.dateFormat = isNewMonth ? "MMM d" : "d"
        let number = formatter.string(from: date)
        formatter.dateFormat = "EEE"
        let weekday = formatter.string(from: date)

        let numberSize = weekDayNumberSize(trackWidth: trackWidth)
        let weekdaySize = min(16, max(13, trackWidth * 0.02))
        let centered = NSMutableParagraphStyle()
        centered.alignment = .center
        let label = NSMutableAttributedString(
            string: number,
            attributes: [
                .font: CompassFont.nsFont(size: numberSize),
                .foregroundColor: color,
                .paragraphStyle: centered,
            ]
        )
        label.append(
            NSAttributedString(
                string: " \(weekday)",
                attributes: [
                    .font: CompassFont.nsFont(size: weekdaySize),
                    .foregroundColor: color,
                    .paragraphStyle: centered,
                ]
            )
        )
        return label
    }

    private func renderAllDayColumns(
        snapshot: GridLayoutSnapshot,
        allDayHeight: Double,
        headerHeight: Double
    ) {
        allDayRowView.subviews.filter { !($0 is EventCardView) }.forEach { $0.removeFromSuperview() }
        let palette = themePalette
        allDayRowView.layer?.backgroundColor = palette.background.cgColor

        for column in snapshot.columns {
            if state.layoutMode == .day,
                state.focusedDayColumnCalendarId == column.key
            {
                let highlight = NSView(
                    frame: NSRect(x: column.left, y: 0, width: column.width, height: allDayHeight + headerHeight)
                )
                highlight.wantsLayer = true
                highlight.layer?.backgroundColor = themeAccentColor.withAlphaComponent(0.08).cgColor
                addGridBackground(highlight, to: allDayRowView)
            }
            let divider = NSView(
                frame: NSRect(x: column.left, y: 0, width: 1, height: allDayHeight + headerHeight)
            )
            divider.wantsLayer = true
            divider.layer?.backgroundColor = palette.border.cgColor
            addGridBackground(divider, to: allDayRowView)
        }
    }

    /// Grid chrome is rebuilt every layout while cards are pooled, so new
    /// chrome goes below the first card instead of on top of every card.
    private func addGridBackground(_ view: NSView, to parent: NSView) {
        if let firstCard = parent.subviews.first(where: { $0 is EventCardView }) {
            parent.addSubview(view, positioned: .below, relativeTo: firstCard)
        } else {
            parent.addSubview(view)
        }
    }

    private func renderTimedGrid(snapshot: GridLayoutSnapshot, hourHeight: Double, gridHeight: Double) {
        timedContentView.subviews.filter { !($0 is EventCardView) }.forEach { $0.removeFromSuperview() }
        let palette = themePalette
        timedContentView.layer?.backgroundColor = palette.background.cgColor
        let todayKey = CompassDateParsing.formatCalendarDay(state.referenceNow)

        let timedTopRule = NSView(
            frame: NSRect(
                x: snapshot.metrics.marginLeft,
                y: 0,
                width: timedContentView.frame.width - snapshot.metrics.marginLeft,
                height: 1
            )
        )
        timedTopRule.wantsLayer = true
        timedTopRule.layer?.backgroundColor = palette.border.cgColor
        addGridBackground(timedTopRule, to: timedContentView)

        for column in snapshot.columns {
            // Web `TimedGrid` `data-[past=true]:bg-surface` on past day columns.
            if state.layoutMode == .week, column.key < todayKey {
                let tint = NSView(frame: NSRect(x: column.left, y: 0, width: column.width, height: gridHeight))
                tint.wantsLayer = true
                tint.layer?.backgroundColor = palette.surface.cgColor
                addGridBackground(tint, to: timedContentView)
            }
            if state.layoutMode == .day,
                state.focusedDayColumnCalendarId == column.key
            {
                let highlight = NSView(
                    frame: NSRect(x: column.left, y: 0, width: column.width, height: gridHeight)
                )
                highlight.wantsLayer = true
                highlight.layer?.backgroundColor = themeAccentColor.withAlphaComponent(0.08).cgColor
                addGridBackground(highlight, to: timedContentView)
            }
            let divider = NSView(frame: NSRect(x: column.left, y: 0, width: 1, height: gridHeight))
            divider.wantsLayer = true
            divider.layer?.backgroundColor = palette.border.cgColor
            addGridBackground(divider, to: timedContentView)
        }

        for hour in 1 ..< Int(ceil(state.civilDayHours)) {
            let line = NSView(
                frame: NSRect(
                    x: snapshot.metrics.marginLeft,
                    y: Double(hour) * hourHeight,
                    width: timedContentView.frame.width - snapshot.metrics.marginLeft,
                    height: 1
                )
            )
            line.wantsLayer = true
            line.layer?.backgroundColor = palette.border.cgColor
            addGridBackground(line, to: timedContentView)
        }
    }

    private func renderCards(snapshot: GridLayoutSnapshot) {
        var seen: Set<String> = []

        for card in snapshot.cards.map({ displayCard($0, snapshot: snapshot) }) {
            seen.insert(card.eventId)
            let view = cardPool[card.eventId] ?? EventCardView(frame: .zero)
            cardPool[card.eventId] = view

            let isFocused = state.focusedEventId == card.eventId
            let isSidebarEditing = state.sidebarEditingEventId == card.eventId
            view.apply(
                card: card,
                theme: theme,
                isFocused: isFocused,
                isSidebarEditing: isSidebarEditing,
                isUnsettled: state.unsettledEventIds.contains(card.eventId),
                isPast: EventCardPastFill.isPast(card, state: state),
                timeLabel: EventCardTimeLabel.text(for: card, state: state)
            )
            view.cardDelegate = self
            view.layoutSubtreeIfNeeded()

            let parent = card.kind == .allDay ? allDayRowView : timedContentView
            if view.superview !== parent {
                view.removeFromSuperview()
                parent.addSubview(view)
            }
        }

        updateVisibleCardContent()
        for (eventId, view) in cardPool where !seen.contains(eventId) {
            if let card = view as? EventCardView {
                card.teardownAccessibilityForRemoval()
            } else {
                NSAccessibility.post(element: view, notification: .uiElementDestroyed)
            }
            view.removeFromSuperview()
            cardPool.removeValue(forKey: eventId)
        }

        syncFocusedEventAccessibilityProxy(snapshot: snapshot)
    }

    /// Card frames are relative to their row, which already sits at its own
    /// offset. All-day lefts start at the first day column (web positions the
    /// all-day grid after the time gutter), so they shift by the gutter width.
    private func displayCard(_ card: GridLayoutCardSnapshot, snapshot: GridLayoutSnapshot) -> GridLayoutCardSnapshot {
        guard card.kind == .allDay else { return card }
        var shifted = card
        shifted.frame.left += snapshot.metrics.marginLeft
        return shifted
    }

    private func syncFocusedEventAccessibilityProxy(snapshot: GridLayoutSnapshot) {
        guard let focusedId = state.focusedEventId,
            let card = snapshot.cards.first(where: { $0.eventId == focusedId })
                .map({ displayCard($0, snapshot: snapshot) })
        else {
            focusedEventAccessibilityProxy.isHidden = true
            focusedEventAccessibilityProxy.removeFromSuperview()
            return
        }

        let frame = card.frame
        let cardParent: NSView = card.kind == .allDay ? allDayRowView : timedContentView
        let frameInGrid = cardParent.convert(
            NSRect(x: frame.left, y: frame.top, width: frame.width, height: frame.height),
            to: self
        )

        if focusedEventAccessibilityProxy.superview !== self {
            focusedEventAccessibilityProxy.removeFromSuperview()
            addSubview(focusedEventAccessibilityProxy, positioned: .above, relativeTo: scrollView)
        }
        focusedEventAccessibilityProxy.isHidden = false
        focusedEventAccessibilityProxy.sync(label: card.label, frameInParent: frameInGrid)

        if let window {
            NSAccessibility.post(element: focusedEventAccessibilityProxy, notification: .layoutChanged)
            NSAccessibility.post(element: window, notification: .layoutChanged)
        }
    }

    private func updateNowLine() {
        guard let snapshot, let nowLine = snapshot.nowLine,
            snapshot.columns.indices.contains(nowLine.columnIndex)
        else {
            nowLineView.isHidden = true
            return
        }
        let column = snapshot.columns[nowLine.columnIndex]
        // Re-added each pass so it stays above cards and grid lines.
        nowLineView.removeFromSuperview()
        timedContentView.addSubview(nowLineView)
        nowLineView.isHidden = false
        let lineSize = NSSize(width: column.width, height: 2)
        nowLineView.frame = NSRect(x: column.left, y: nowLine.top, width: lineSize.width, height: lineSize.height)
        nowLineView.layer?.backgroundColor = nil
        nowLineView.layer?.borderWidth = 1
        nowLineView.layer?.borderColor = themeBackgroundColor.cgColor
        nowLineGradientLayer.colors = [
            themeAccentColor.cgColor,
            themeAccentStrongColor.cgColor,
        ]
        nowLineGradientLayer.startPoint = CGPoint(x: 0, y: 0.5)
        nowLineGradientLayer.endPoint = CGPoint(x: 1, y: 0.5)
        nowLineGradientLayer.frame = CGRect(origin: .zero, size: lineSize)
        if nowLineGradientLayer.superlayer == nil {
            nowLineView.layer?.addSublayer(nowLineGradientLayer)
        }
    }

    private func renderTimezoneHeader(
        snapshot: GridLayoutSnapshot,
        headerHeight: Double,
        palette: (background: NSColor, surface: NSColor, surfaceRaised: NSColor, border: NSColor, text: NSColor, textMuted: NSColor)
    ) {
        let columnWidth = GridMetrics.gridTimeColumnWidth
        var x = 0.0
        if state.hasSecondaryTimeZone, let travelZone = state.timeTravelTimeZone {
            let abbrev = TimeZoneFormatting.abbreviation(for: travelZone, at: state.hourLabelDate)
            addTimezoneButton(
                title: abbrev,
                x: x,
                width: columnWidth,
                headerHeight: headerHeight,
                palette: palette,
                accessibilityLabel: "Second timezone: \(abbrev)")
            x += columnWidth
        }
        let effectiveAbbrev = TimeZoneFormatting.abbreviation(
            for: state.effectiveTimeZone,
            at: state.hourLabelDate)
        addTimezoneButton(
            title: effectiveAbbrev,
            x: x,
            width: state.hasSecondaryTimeZone ? columnWidth : snapshot.metrics.marginLeft,
            headerHeight: headerHeight,
            palette: palette,
            accessibilityLabel: "Calendar timezone: \(effectiveAbbrev)",
            accessibilityIdentifier: "compass-grid-timezone-effective")
    }

    private func addTimezoneButton(
        title: String,
        x: Double,
        width: Double,
        headerHeight: Double,
        palette: (background: NSColor, surface: NSColor, surfaceRaised: NSColor, border: NSColor, text: NSColor, textMuted: NSColor),
        accessibilityLabel: String,
        accessibilityIdentifier: String? = nil
    ) {
        let button = NSButton(title: title, target: self, action: #selector(openTimeTravel(_:)))
        button.isBordered = false
        button.font = CompassFont.nsFont(size: 10)
        button.contentTintColor = palette.textMuted
        button.frame = NSRect(x: x, y: 4, width: width, height: headerHeight - 8)
        button.setAccessibilityLabel(accessibilityLabel)
        if let accessibilityIdentifier {
            button.setAccessibilityIdentifier(accessibilityIdentifier)
        }
        headerRowView.addSubview(button)
    }

    @objc private func openTimeTravel(_ sender: Any?) {
        delegate?.timeGridViewDidRequestTimeTravel(self)
    }

    private var marginWidth: CGFloat {
        CGFloat(snapshot?.metrics.marginLeft ?? GridMetrics.gridMarginLeft)
    }

    private var themePalette: (background: NSColor, surface: NSColor, surfaceRaised: NSColor, border: NSColor, text: NSColor, textMuted: NSColor) {
        switch theme {
        case .lightBeach:
            (
                ThemeTokens.lightBeach.background.nsColor,
                ThemeTokens.lightBeach.surface.nsColor,
                ThemeTokens.lightBeach.surfaceRaised.nsColor,
                ThemeTokens.lightBeach.border.nsColor,
                ThemeTokens.lightBeach.text.nsColor,
                ThemeTokens.lightBeach.textMuted.nsColor
            )
        case .darkAbyss:
            (
                ThemeTokens.darkAbyss.background.nsColor,
                ThemeTokens.darkAbyss.surface.nsColor,
                ThemeTokens.darkAbyss.surfaceRaised.nsColor,
                ThemeTokens.darkAbyss.border.nsColor,
                ThemeTokens.darkAbyss.text.nsColor,
                ThemeTokens.darkAbyss.textMuted.nsColor
            )
        }
    }

    private func weekDayNumberSize(trackWidth: CGFloat) -> CGFloat {
        min(20.8, max(18, trackWidth * 0.027))
    }

    private var themeSurfacePanelColor: NSColor {
        switch theme {
        case .lightBeach:
            ThemeTokens.lightBeach.surfacePanel.nsColor
        case .darkAbyss:
            ThemeTokens.darkAbyss.surfacePanel.nsColor
        }
    }

    private var themeAccentColor: NSColor {
        switch theme {
        case .lightBeach:
            ThemeTokens.lightBeach.accent.nsColor
        case .darkAbyss:
            ThemeTokens.darkAbyss.accent.nsColor
        }
    }

    private var themeAccentStrongColor: NSColor {
        switch theme {
        case .lightBeach:
            ThemeTokens.lightBeach.accentStrong.nsColor
        case .darkAbyss:
            ThemeTokens.darkAbyss.accentStrong.nsColor
        }
    }

    private var themeBackgroundColor: NSColor {
        switch theme {
        case .lightBeach:
            ThemeTokens.lightBeach.background.nsColor
        case .darkAbyss:
            ThemeTokens.darkAbyss.background.nsColor
        }
    }

}

extension TimeGridView: EventCardViewDelegate {
    func eventCardViewDidClick(_ view: EventCardView, eventId: String) {
        delegate?.timeGridView(self, didClickEvent: eventId)
    }

    func eventCardView(_ view: EventCardView, didEditDraftTitle title: String, eventId: String) {
        delegate?.timeGridView(self, didEditDraftTitle: title, eventId: eventId)
    }
}

private class FlippedView: NSView {
    override var isFlipped: Bool { true }
}

/// Routes mouse clicks to event cards when XCUITest hits the card's accessibility
/// frame but the synthesized click lands on the grid container (zero-size frames).
private final class CardRoutingFlippedView: FlippedView {
    override func mouseDown(with event: NSEvent) {
        for subview in subviews.reversed() {
            guard let card = subview as? EventCardView else { continue }
            if card.containsPointInWindow(event.locationInWindow) {
                card.mouseDown(with: event)
                return
            }
        }
        let point = convert(event.locationInWindow, from: nil)
        for subview in subviews.reversed() {
            guard let card = subview as? EventCardView else { continue }
            if card.frame.contains(point) {
                card.mouseDown(with: event)
                return
            }
        }
        super.mouseDown(with: event)
    }
}

private final class AllDayRowRoutingView: FlippedView {
    weak var grid: TimeGridView?

    override func mouseDown(with event: NSEvent) {
        if let grid {
            if grid.eventCardView(at: event.locationInWindow) != nil {
                super.mouseDown(with: event)
                return
            }
            grid.delegate?.timeGridViewDidRequestShortcutHint(grid, at: event.locationInWindow)
            return
        }
        super.mouseDown(with: event)
    }
}

private final class GridScrollView: NSScrollView {
    weak var timeGridView: TimeGridView?

    override func mouseDown(with event: NSEvent) {
        if let grid = timeGridView {
            if let card = grid.eventCardView(at: event.locationInWindow) {
                card.mouseDown(with: event)
                return
            }
            grid.delegate?.timeGridViewDidRequestShortcutHint(grid, at: event.locationInWindow)
        }
        super.mouseDown(with: event)
    }
}
