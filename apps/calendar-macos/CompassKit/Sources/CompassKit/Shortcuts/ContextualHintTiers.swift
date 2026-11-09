import Foundation

/// Tiered contextual keyboard hints shared with web `@core/shortcuts/contextual-hint-tiers`.
public enum ContextualHintTiers {
    public struct TieredHint: Equatable {
        public let primary: [String]
        public let secondary: [String]
        public var hasSecondary: Bool { !secondary.isEmpty }
    }

    public static func eventFormDatePickerFooter() -> TieredHint {
      let tiered = gridDay()
      return .init(primary: tiered.primary, secondary: tiered.secondary)
  }

  public static func gridDay() -> TieredHint {
      .init(
          primary: [
              "← → ↑ ↓ move date",
              "Enter pick",
              "Esc close",
          ],
          secondary: [
              "← → day",
              "↑ ↓ week",
              "Page Down month",
              "Shift Page Down year",
              "Tab leave and save typed text",
          ])
  }

  public static func eventFormFooter(
      tabNavigationApplies: Bool,
      datePickerCalendarOpen: Bool
  ) -> TieredHint {
      if datePickerCalendarOpen {
          return eventFormDatePickerFooter()
      }
      if tabNavigationApplies {
          return .init(
              primary: ["Tab / Shift Tab between fields"],
              secondary: ["Hold ⌘ then 0 for actions"])
      }
      return .init(primary: ["Hold ⌘ then 0 for actions"], secondary: [])
  }
}
