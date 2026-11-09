import CompassKit

/// Mirrors `packages/core/src/util/event/merge-editable-content-color.ts`.
enum EditableContentColorMerge {
  struct Fields: Sendable {
    var color: ColorEnum?
    var colorHex: String?
  }

  /// `draftSlot == nil` matches replace payloads that send `color: null`.
  static func mergeFromDraftSlot(
    existing: Fields?,
    draftSlot: EventColorSlot?,
    merged: Fields
  ) -> Fields {
    let existingColor = existing?.color
    let existingHex = existing?.colorHex

    if let draftSlot,
      let slot = ColorEnum(rawValue: draftSlot.rawValue)
    {
      var result = merged
      result.color = slot
      result.colorHex = nil
      return result
    }

    if existingColor != nil {
      return merged
    }
    if let hex = existingHex, !hex.isEmpty {
      var result = merged
      result.colorHex = hex
      return result
    }
    return merged
  }
}
