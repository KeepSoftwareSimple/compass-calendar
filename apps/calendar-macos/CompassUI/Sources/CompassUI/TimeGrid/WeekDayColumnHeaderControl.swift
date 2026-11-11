import AppKit
import CompassKit

/// Web week `DayLabels`: day number, weekday name, or day-jump keycaps while Mod is held.
@MainActor
final class WeekDayColumnHeaderControl: NSView {
    private let numberField = NSTextField(labelWithString: "")
    private let suffixField = NSTextField(labelWithString: "")
    private let chipLabel = NSTextField(labelWithString: "")

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        numberField.font = CompassFont.nsFont(size: 18)
        numberField.alignment = .center
        suffixField.font = CompassFont.nsFont(size: 13)
        suffixField.alignment = .center
        chipLabel.font = CompassFont.nsFont(size: 11, weight: RubikWeight.medium)
        chipLabel.alignment = .center
        chipLabel.isHidden = true
        chipLabel.wantsLayer = true
        chipLabel.layer?.cornerRadius = 4
        chipLabel.layer?.borderWidth = 1
        addSubview(numberField)
        addSubview(suffixField)
        addSubview(chipLabel)
        numberField.setAccessibilityElement(false)
        suffixField.setAccessibilityElement(false)
        chipLabel.setAccessibilityElement(false)
        setAccessibilityElement(true)
        setAccessibilityRole(.group)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func apply(
        dayKey: String,
        viewStartMonth: String?,
        isToday: Bool,
        isJumpDay: Bool,
        showDayJumpPrefixes: Bool,
        dayJumpUseShiftPrefix: Bool,
        numberSize: CGFloat,
        palette: (text: NSColor, textMuted: NSColor, accent: NSColor, surfacePanel: NSColor, border: NSColor, background: NSColor)
    ) {
        // A day key's number and weekday are civil facts, so read them in a
        // fixed UTC calendar instead of the shared, mutable `EffectiveTimeZone`,
        // which can change between parsing and reading the weekday.
        var civil = Calendar(identifier: .gregorian)
        civil.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        let parts = dayKey.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3,
            let date = civil.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
        else { return }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = civil
        formatter.timeZone = civil.timeZone
        let isNewMonth = dayKey.hasSuffix("-01") && viewStartMonth.map { !dayKey.hasPrefix($0) } == true
        formatter.dateFormat = isNewMonth ? "MMM d" : "d"
        let number = formatter.string(from: date)
        numberField.stringValue = number
        numberField.font = CompassFont.nsFont(size: numberSize)

        let ink = isToday ? palette.accent : palette.textMuted
        numberField.textColor = ink

        if showDayJumpPrefixes {
            let weekday = civil.component(.weekday, from: date)
            let prefix = DayJumpPrefixes.prefix(forWeekday: weekday - 1)
            chipLabel.stringValue = DayJumpPrefixes.columnJumpChipLabel(
                prefix: prefix,
                eventJumpModeActive: !dayJumpUseShiftPrefix
            )
            chipLabel.isHidden = false
            chipLabel.textColor = palette.text
            chipLabel.layer?.backgroundColor = palette.surfacePanel.cgColor
            chipLabel.layer?.borderColor = palette.border.cgColor
            suffixField.isHidden = true
        } else {
            formatter.dateFormat = "EEE"
            suffixField.stringValue = formatter.string(from: date)
            suffixField.textColor = ink
            suffixField.isHidden = false
            chipLabel.isHidden = true
        }

        layer?.backgroundColor =
            isJumpDay ? palette.accent.withAlphaComponent(0.15).cgColor : NSColor.clear.cgColor
    }

    override func layout() {
        super.layout()
        let chipSize = CGSize(width: max(28, chipLabel.intrinsicContentSize.width + 12), height: 20)
        let gap: CGFloat = 4
        let chipWidth = chipLabel.isHidden ? 0 : chipSize.width + gap
        let suffixWidth = suffixField.isHidden ? 0 : suffixField.intrinsicContentSize.width + gap
        let numberWidth = numberField.intrinsicContentSize.width
        let total = numberWidth + max(suffixWidth, chipWidth)
        var x = max(0, (bounds.width - total) / 2)
        numberField.frame = NSRect(x: x, y: (bounds.height - 22) / 2, width: numberWidth, height: 22)
        x += numberWidth + gap
        if !chipLabel.isHidden {
            chipLabel.frame = NSRect(x: x, y: (bounds.height - chipSize.height) / 2, width: chipSize.width, height: chipSize.height)
        } else if !suffixField.isHidden {
            suffixField.frame = NSRect(x: x, y: (bounds.height - 18) / 2, width: suffixWidth, height: 18)
        }
    }
}
