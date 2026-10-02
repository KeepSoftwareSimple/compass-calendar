import SwiftUI

struct PageJumpChipAnchorKey: PreferenceKey {
    static let defaultValue: [String: Anchor<CGRect>] = [:]

    static func reduce(
        value: inout [String: Anchor<CGRect>],
        nextValue: () -> [String: Anchor<CGRect>]
    ) {
        value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
}

extension View {
    func pageJumpChipAnchor(id: String) -> some View {
        anchorPreference(key: PageJumpChipAnchorKey.self, value: .bounds) { anchor in
            [id: anchor]
        }
    }
}
