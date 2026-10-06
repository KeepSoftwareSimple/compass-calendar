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

    private let scrollView = GridScrollView()
    private let documentView = FlippedView()
    private let allDayRowView = FlippedView()
    private let timedContentView = CardRoutingFlippedView()
    private let hourGutterView = FlippedView()
    private let headerRowView = FlippedView()
    private let nowLineLayer = CALayer()

    private var cardPool: [String: EventCardView] = [:]
    private let focusedEventAccessibilityProxy = FocusedGridEventAccessibilityProxy(frame: .zero)
    private nonisolated(unsafe) var minuteTimer: Timer?
    private var state: TimeGridState
    private var theme: NativeWebTheme
    private var snapshot: GridLayoutSnapshot?

    public init(state: TimeGridState, theme: NativeWebTheme) {
        self.state = state
        self.theme = theme
        super.init(frame: .zero)
        wantsLayer = true
        scrollView.timeGridView = self
        configureScrollView()
        configureNowLine()
        startMinuteTimer()
        relayout()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    deinit {
        minuteTimer?.invalidate()
    }

    public func update(state: TimeGridState, theme: NativeWebTheme) {
        self.state = state
        self.theme = theme
        relayout()
    }

    public override func layout() {
        super.layout()
        scrollView.frame = bounds
        relayout()
    }

    public override func mouseDown(with event: NSEvent) {
        if let card = eventCardView(at: event.locationInWindow) {
            card.mouseDown(with: event)
            return
        }
        delegate?.timeGridViewDidRequestShortcutHint(self, at: event.locationInWindow)
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

    public override func accessibilityChildren() -> [Any]? {
        var children = super.accessibilityChildren() ?? []
        if timedContentView.superview != nil {
            children.append(timedContentView)
        }
        if allDayRowView.superview != nil {
            children.append(allDayRowView)
        }
        if !focusedEventAccessibilityProxy.isHidden,
            focusedEventAccessibilityProxy.superview === self
        {
            children.append(focusedEventAccessibilityProxy)
        }
        return children
    }

    public func applyScroll(_ request: TimeGridScrollRequest) {
        guard let snapshot else { return }
        let hourHeight = snapshot.metrics.hourHeight
        let pageDelta = scrollView.contentView.bounds.height
        var origin = scrollView.contentView.bounds.origin
        switch request {
        case .revealDocumentY(let documentY):
            origin.y = max(0, documentY)
        case .pageUp:
            origin.y = max(0, origin.y - pageDelta)
        case .hourUp:
            origin.y = max(0, origin.y - hourHeight)
        case .pageDown:
            origin.y += pageDelta
        case .hourDown:
            origin.y += hourHeight
        }
        scrollView.contentView.scroll(to: origin)
        scrollView.reflectScrolledClipView(scrollView.contentView)
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

        documentView.addSubview(headerRowView)
        documentView.addSubview(allDayRowView)
        documentView.addSubview(hourGutterView)
        documentView.addSubview(timedContentView)

        timedContentView.layer?.addSublayer(nowLineLayer)
        timedContentView.wantsLayer = true
        timedContentView.setAccessibilityElement(true)
        timedContentView.setAccessibilityRole(.group)
        timedContentView.setAccessibilityIdentifier("compass-grid-timed")
        allDayRowView.setAccessibilityElement(true)
        allDayRowView.setAccessibilityRole(.group)
        allDayRowView.setAccessibilityIdentifier("compass-grid-allday")
    }

    private func configureNowLine() {
        nowLineLayer.backgroundColor = themeAccentColor.cgColor
        nowLineLayer.zPosition = 1000
    }

    private func startMinuteTimer() {
        minuteTimer?.invalidate()
        minuteTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.updateNowLine()
            }
        }
    }

    private func relayout() {
        let colWidths = state.resolvedColumnWidths()
        let snapshot = state.snapshot(colWidths: colWidths)
        self.snapshot = snapshot

        let marginLeft = snapshot.metrics.marginLeft
        let hourHeight = snapshot.metrics.hourHeight
        let gridHeight = snapshot.metrics.timedGridHeight
        let allDayHeight = snapshot.metrics.allDayRowHeight
        let headerHeight = GridTimeConstants.dayHeaderRowHeight
        let totalHeight = headerHeight + allDayHeight + gridHeight + GridTimeConstants.gridPaddingBottom

        let contentWidth = max(bounds.width, state.documentContentWidth())
        scrollView.hasHorizontalScroller = state.layoutMode == .day && contentWidth > bounds.width + 1
        documentView.frame = NSRect(x: 0, y: 0, width: contentWidth, height: totalHeight)
        headerRowView.frame = NSRect(x: 0, y: 0, width: contentWidth, height: headerHeight)
        allDayRowView.frame = NSRect(x: 0, y: headerHeight, width: contentWidth, height: allDayHeight)
        hourGutterView.frame = NSRect(
            x: 0,
            y: headerHeight + allDayHeight,
            width: marginLeft,
            height: gridHeight
        )
        timedContentView.frame = NSRect(
            x: 0,
            y: headerHeight + allDayHeight,
            width: contentWidth,
            height: gridHeight
        )

        renderHourGutter(snapshot: snapshot, hourHeight: hourHeight, gridHeight: gridHeight)
        renderHeaders(snapshot: snapshot, headerHeight: headerHeight)
        renderAllDayColumns(snapshot: snapshot, allDayHeight: allDayHeight, headerHeight: headerHeight)
        renderTimedGrid(snapshot: snapshot, hourHeight: hourHeight, gridHeight: gridHeight)
        renderCards(snapshot: snapshot)
        updateNowLine()
    }

    private func renderHourGutter(
        snapshot: GridLayoutSnapshot,
        hourHeight: Double,
        gridHeight: Double
    ) {
        hourGutterView.subviews.forEach { $0.removeFromSuperview() }
        let palette = themePalette
        hourGutterView.layer?.backgroundColor = palette.background.cgColor
        let margin = snapshot.metrics.marginLeft
        let columnWidth = GridMetrics.gridTimeColumnWidth

        if state.hasSecondaryTimeZone, let travelZone = state.timeTravelTimeZone {
            let mapped = MappedHourLabels.labels(
                effectiveTimeZone: state.effectiveTimeZone,
                displayTimeZone: travelZone,
                at: state.referenceNow)
            renderHourColumn(
                labels: mapped,
                xOffset: 0,
                width: columnWidth,
                hourHeight: hourHeight,
                palette: palette,
                marginWidth: margin)
        }

        let primaryLabels = MappedHourLabels.labels(
            effectiveTimeZone: state.effectiveTimeZone,
            displayTimeZone: state.effectiveTimeZone,
            at: state.referenceNow)
        let primaryX = state.hasSecondaryTimeZone ? columnWidth : 0
        renderHourColumn(
            labels: primaryLabels,
            xOffset: primaryX,
            width: columnWidth,
            hourHeight: hourHeight,
            palette: palette,
            marginWidth: margin)
        _ = gridHeight
    }

    private func renderHourColumn(
        labels: [String],
        xOffset: Double,
        width: Double,
        hourHeight: Double,
        palette: (background: NSColor, surface: NSColor, surfaceRaised: NSColor, border: NSColor, text: NSColor, textMuted: NSColor),
        marginWidth: Double
    ) {
        for hour in 0 ..< GridTimeConstants.timedVisibleHours {
            let text = hour == 0 ? "" : (labels.indices.contains(hour - 1) ? labels[hour - 1] : "")
            let label = NSTextField(labelWithString: text)
            label.font = NSFont(name: "Rubik", size: 11) ?? .systemFont(ofSize: 11)
            label.textColor = palette.textMuted
            label.alignment = .right
            label.frame = NSRect(
                x: xOffset + 4,
                y: Double(hour) * hourHeight + 2,
                width: width - 8,
                height: 14)
            hourGutterView.addSubview(label)

            if hour > 0 {
                let line = NSView(
                    frame: NSRect(x: xOffset, y: Double(hour) * hourHeight, width: marginWidth, height: 1))
                line.wantsLayer = true
                line.layer?.backgroundColor = palette.border.withAlphaComponent(0.35).cgColor
                hourGutterView.addSubview(line)
            }
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
        headerRowView.layer?.backgroundColor = palette.surface.cgColor

        renderTimezoneHeader(snapshot: snapshot, headerHeight: headerHeight, palette: palette)

        if state.layoutMode == .day {
            let dayCalendars = DayCalendarColumns.dayViewCalendars(state.scenario.calendars)
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
                    jumpDigit: state.pageJumpDigitByCalendarId[calendar.id],
                    hintsVisible: state.pageJumpHintsVisible,
                    isFocused: state.focusedDayColumnCalendarId == calendar.id,
                    palette: (text: palette.text, accent: themeAccentColor, surface: palette.surface)
                )
                headerRowView.addSubview(header)
            }
            return
        }

        for column in snapshot.columns {
            let header = NSTextField(labelWithString: column.key)
            header.font = NSFont(name: "Rubik", size: 12) ?? .systemFont(ofSize: 12)
            header.textColor = palette.text
            header.frame = NSRect(x: column.left, y: 6, width: column.width, height: headerHeight - 8)
            header.alignment = .center
            header.setAccessibilityIdentifier(column.accessibilityIdentifier)
            headerRowView.addSubview(header)
        }
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
                allDayRowView.addSubview(highlight)
            }
            let divider = NSView(
                frame: NSRect(x: column.left, y: 0, width: 1, height: allDayHeight + headerHeight)
            )
            divider.wantsLayer = true
            divider.layer?.backgroundColor = palette.border.withAlphaComponent(0.5).cgColor
            allDayRowView.addSubview(divider)
        }
    }

    private func renderTimedGrid(snapshot: GridLayoutSnapshot, hourHeight: Double, gridHeight: Double) {
        timedContentView.subviews.filter { !($0 is EventCardView) }.forEach { $0.removeFromSuperview() }
        let palette = themePalette
        timedContentView.layer?.backgroundColor = palette.background.cgColor

        for column in snapshot.columns {
            if state.layoutMode == .day,
                state.focusedDayColumnCalendarId == column.key
            {
                let highlight = NSView(
                    frame: NSRect(x: column.left, y: 0, width: column.width, height: gridHeight)
                )
                highlight.wantsLayer = true
                highlight.layer?.backgroundColor = themeAccentColor.withAlphaComponent(0.08).cgColor
                timedContentView.addSubview(highlight)
            }
            let divider = NSView(frame: NSRect(x: column.left, y: 0, width: 1, height: gridHeight))
            divider.wantsLayer = true
            divider.layer?.backgroundColor = palette.border.withAlphaComponent(0.35).cgColor
            timedContentView.addSubview(divider)
        }

        for hour in 1 ..< GridTimeConstants.timedVisibleHours {
            let line = NSView(
                frame: NSRect(
                    x: snapshot.metrics.marginLeft,
                    y: Double(hour) * hourHeight,
                    width: timedContentView.frame.width - snapshot.metrics.marginLeft,
                    height: 1
                )
            )
            line.wantsLayer = true
            line.layer?.backgroundColor = palette.border.withAlphaComponent(0.25).cgColor
            timedContentView.addSubview(line)
        }
    }

    private func renderCards(snapshot: GridLayoutSnapshot) {
        var seen: Set<String> = []
        let surface = themePalette.surfaceRaised
        let allDayOffset = GridTimeConstants.timedContentDocumentYOffset(
            allDayRowHeight: snapshot.metrics.allDayRowHeight
        )

        for card in snapshot.cards {
            seen.insert(card.eventId)
            let view = cardPool[card.eventId] ?? EventCardView(frame: .zero)
            cardPool[card.eventId] = view

            var frame = card.frame
            if card.kind == .allDay {
                frame.top += GridTimeConstants.dayHeaderRowHeight
            } else {
                frame.top += allDayOffset
            }

            var adjusted = card
            adjusted.frame = frame
            let isFocused = state.focusedEventId == card.eventId
            let isSidebarEditing = state.sidebarEditingEventId == card.eventId
            view.apply(
                card: adjusted,
                theme: theme,
                surfaceColor: surface,
                isFocused: isFocused,
                isSidebarEditing: isSidebarEditing
            )
            view.cardDelegate = self
            view.layoutSubtreeIfNeeded()

            let parent = card.kind == .allDay ? allDayRowView : timedContentView
            if view.superview !== parent {
                view.removeFromSuperview()
                parent.addSubview(view)
            }
        }

        for (eventId, view) in cardPool where !seen.contains(eventId) {
            if let card = view as? EventCardView {
                card.teardownAccessibilityForRemoval()
            } else {
                NSAccessibility.post(element: view, notification: .uiElementDestroyed)
            }
            view.removeFromSuperview()
            cardPool.removeValue(forKey: eventId)
        }

        syncFocusedEventAccessibilityProxy(snapshot: snapshot, allDayOffset: allDayOffset)
    }

    private func syncFocusedEventAccessibilityProxy(
        snapshot: GridLayoutSnapshot,
        allDayOffset: Double
    ) {
        guard let focusedId = state.focusedEventId,
            let card = snapshot.cards.first(where: { $0.eventId == focusedId })
        else {
            focusedEventAccessibilityProxy.isHidden = true
            focusedEventAccessibilityProxy.removeFromSuperview()
            return
        }

        var frame = card.frame
        let cardParent: NSView
        if card.kind == .allDay {
            frame.top += GridTimeConstants.dayHeaderRowHeight
            cardParent = allDayRowView
        } else {
            frame.top += allDayOffset
            cardParent = timedContentView
        }

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
        guard let snapshot, let nowLine = snapshot.nowLine else {
            nowLineLayer.isHidden = true
            return
        }
        guard let column = snapshot.columns.indices.contains(nowLine.columnIndex)
            ? snapshot.columns[nowLine.columnIndex]
            : nil
        else {
            nowLineLayer.isHidden = true
            return
        }

        let allDayOffset = GridTimeConstants.timedContentDocumentYOffset(
            allDayRowHeight: snapshot.metrics.allDayRowHeight
        )
        nowLineLayer.isHidden = false
        nowLineLayer.frame = CGRect(
            x: column.left,
            y: nowLine.top + allDayOffset,
            width: column.width,
            height: 2
        )
    }

    private func renderTimezoneHeader(
        snapshot: GridLayoutSnapshot,
        headerHeight: Double,
        palette: (background: NSColor, surface: NSColor, surfaceRaised: NSColor, border: NSColor, text: NSColor, textMuted: NSColor)
    ) {
        let columnWidth = GridMetrics.gridTimeColumnWidth
        var x = 0.0
        if state.hasSecondaryTimeZone, let travelZone = state.timeTravelTimeZone {
            let abbrev = TimeZoneFormatting.abbreviation(for: travelZone, at: state.referenceNow)
            addTimezoneButton(
                title: abbrev,
                x: x,
                width: columnWidth,
                headerHeight: headerHeight,
                palette: palette,
                accessibilityLabel: "Time travel timezone: \(abbrev)")
            x += columnWidth
        }
        let effectiveAbbrev = TimeZoneFormatting.abbreviation(
            for: state.effectiveTimeZone,
            at: state.referenceNow)
        addTimezoneButton(
            title: effectiveAbbrev,
            x: x,
            width: state.hasSecondaryTimeZone ? columnWidth : snapshot.metrics.marginLeft,
            headerHeight: headerHeight,
            palette: palette,
            accessibilityLabel: "Calendar timezone: \(effectiveAbbrev)")
    }

    private func addTimezoneButton(
        title: String,
        x: Double,
        width: Double,
        headerHeight: Double,
        palette: (background: NSColor, surface: NSColor, surfaceRaised: NSColor, border: NSColor, text: NSColor, textMuted: NSColor),
        accessibilityLabel: String
    ) {
        let button = NSButton(title: title, target: self, action: #selector(openTimeTravel(_:)))
        button.isBordered = false
        button.font = NSFont(name: "Rubik", size: 10) ?? .systemFont(ofSize: 10)
        button.contentTintColor = palette.textMuted
        button.frame = NSRect(x: x, y: 4, width: width, height: headerHeight - 8)
        button.setAccessibilityLabel(accessibilityLabel)
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

    private var themeAccentColor: NSColor {
        switch theme {
        case .lightBeach:
            ThemeTokens.lightBeach.accent.nsColor
        case .darkAbyss:
            ThemeTokens.darkAbyss.accent.nsColor
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
