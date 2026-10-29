import CompassData
import CompassKit
import SwiftUI

extension View {
    /// Restores a form control after a repeated shortcut. The parent releases
    /// title focus in the same request, so the target is applied on the next
    /// run loop.
    func onEventFormFocusRequest(
        _ model: NativeCalendarRootModel,
        field: EventFormField,
        perform: @escaping () -> Void
    ) -> some View {
        onChange(of: model.eventFormFocusRequest) { _, _ in
            DispatchQueue.main.async {
                guard model.isEventFormVisible, model.eventFormFocusedField == field else { return }
                perform()
            }
        }
    }
}
