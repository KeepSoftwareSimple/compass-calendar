import CompassData
import CompassKit
import SwiftUI

struct LifeContentView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel

    var body: some View {
        let snapshot = LifeGridSnapshotBuilder.build(
            birthDate: model.lifeStore.preferences.birthDate,
            lifespan: model.lifeStore.preferences.lifespan,
            today: model.referenceNow,
            showCurrentWeek: model.lifeStore.hasBirthDate)
        LifeGridCanvasView(
            snapshot: snapshot,
            currentWeekLabel: model.lifeStore.currentWeekLabel,
            scrollToCurrentWeekToken: model.lifeStore.scrollToCurrentWeekToken)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(theme.backgroundColor)
            .accessibilityIdentifier("compass-native-content")
    }
}
