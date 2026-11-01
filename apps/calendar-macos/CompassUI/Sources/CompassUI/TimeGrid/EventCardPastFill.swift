import AppKit
import CompassKit

/// Web pastEventFill: soften ink fills, darken paper fills, leave text contrast independent.
enum EventCardPastFill {
    static func isPast(_ card: GridLayoutCardSnapshot, state: TimeGridState) -> Bool {
        guard !card.isDraft else { return false }
        let end = card.kind == .allDay
            ? state.scenario.allDayEvents.first { $0.eventId == card.eventId }?.endDate
            : state.scenario.timedEvents.first { $0.eventId == card.eventId }?.endDate
        guard let end, let date = CompassDateParsing.parseInEffectiveTimeZone(end) else { return false }
        return date < state.referenceNow
    }

    static func color(_ fill: NSColor) -> NSColor {
        guard let rgb = fill.usingColorSpace(.sRGB) else { return fill }
        var r = rgb.redComponent, g = rgb.greenComponent, b = rgb.blueComponent
        let ink = (r * 299 + g * 587 + b * 114) * 255 / 1000 < 128
        if ink {
            // tinycolor.mix serializes byte RGB before desaturate parses it.
            r = (r * 255 * 0.86).rounded() / 255
            g = (g * 255 * 0.86).rounded() / 255
            b = (b * 255 * 0.86).rounded() / 255
        }
        let high = max(r, g, b), low = min(r, g, b), delta = high - low
        var lightness = (high + low) / 2
        var saturation = delta == 0 ? 0 : delta / (1 - abs(2 * lightness - 1))
        var hue: CGFloat = 0
        if delta > 0 {
            if high == r { hue = ((g - b) / delta).truncatingRemainder(dividingBy: 6) }
            else if high == g { hue = (b - r) / delta + 2 }
            else { hue = (r - g) / delta + 4 }
            if hue < 0 { hue += 6 }
        }
        if ink { saturation = max(0, saturation - 0.1) }
        else { lightness = max(0, lightness - 0.05) }
        let chroma = (1 - abs(2 * lightness - 1)) * saturation
        let x = chroma * (1 - abs(hue.truncatingRemainder(dividingBy: 2) - 1))
        let offset = lightness - chroma / 2
        let channels: (CGFloat, CGFloat, CGFloat)
        switch hue {
        case ..<1: channels = (chroma, x, 0)
        case ..<2: channels = (x, chroma, 0)
        case ..<3: channels = (0, chroma, x)
        case ..<4: channels = (0, x, chroma)
        case ..<5: channels = (x, 0, chroma)
        default: channels = (chroma, 0, x)
        }
        return NSColor(srgbRed: ((channels.0 + offset) * 255).rounded() / 255,
            green: ((channels.1 + offset) * 255).rounded() / 255,
            blue: ((channels.2 + offset) * 255).rounded() / 255, alpha: rgb.alphaComponent)
    }
}
