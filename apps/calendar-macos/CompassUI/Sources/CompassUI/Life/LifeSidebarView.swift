import CompassData
import CompassKit
import SwiftUI

struct LifeSidebarView: View {
  @Environment(\.nativeWebTheme) private var theme
  @Bindable var model: NativeCalendarRootModel
  @State private var birthDate = ""
  @State private var lifespan = ""
  @State private var invalidBirthDate = false
  @State private var showsBirthDatePicker = false
  @State private var pickerMonth = Date()
  /// Web `LifeQuote`: one random quote per visit to the sidebar.
  @State private var quote = LifeQuotes.random()
  @FocusState private var focusedField: Field?
  private enum Field { case birthDate, lifespan }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 32) {
        VStack(alignment: .leading, spacing: 8) {
          HStack(spacing: 4) {
            variationButton(
              "Previous life variation in sidebar", symbol: "chevron.left", direction: -1)
            variationButton("Next life variation in sidebar", symbol: "chevron.right", direction: 1)
            Text(LifeMath.variations[model.lifeStore.preferences.variation]?.label ?? "Average")
              .fontWeight(.semibold).foregroundStyle(theme.textColor)
            Spacer(minLength: 0)
          }
          Text("This is your life if you live to \(model.lifeStore.preferences.lifespan)")
          Text("Each dot represents one week of your life, and each row represents one year.")
        }
        Text(model.lifeStore.summary)
          .fontWeight(.medium).foregroundStyle(theme.textColor)
          .frame(maxWidth: .infinity).multilineTextAlignment(.center)
          .accessibilityAddTraits(.updatesFrequently)
        VStack(spacing: 16) {
          VStack(spacing: 4) {
            Text("Date of birth").help("We don't store this information")
            TextField("Select date", text: $birthDate)
              .accessibilityLabel("Date of birth")
              .focused($focusedField, equals: .birthDate)
              .onSubmit { commitBirthDate() }
              .help("Enter a date like Jun 10, 2026")
              .padding(.vertical, 8).frame(width: 176)
              .background(theme.surfaceColor).foregroundStyle(theme.textColor)
              .clipShape(RoundedRectangle(cornerRadius: 4))
              // Typing stays in the field; the button opens web's calendar picker.
              .overlay(alignment: .trailing) {
                Button {
                  openBirthDatePicker()
                } label: {
                  PhosphorIconView(icon: .calendarDots, size: 16)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Open calendar")
                .help("Open calendar")
                .popover(isPresented: $showsBirthDatePicker, arrowEdge: .bottom) {
                  birthDatePopover
                }
              }
            if invalidBirthDate {
              Text("Enter a date from 1900 through today.")
                .font(.rubik(11)).foregroundStyle(theme.textColor)
            }
          }
          VStack(spacing: 4) {
            HStack(spacing: 4) {
              Text("Age of Death")
              Button {
                model.lifeStore.shuffleRandomVariation()
              } label: {
                Image(systemName: "shuffle").frame(width: 24, height: 24)
              }
              .buttonStyle(.plain).accessibilityLabel("Shuffle life variation")
            }
            .frame(maxWidth: .infinity)
            TextField("Age of Death", text: $lifespan)
              .accessibilityLabel("Age of Death")
              .focused($focusedField, equals: .lifespan)
              .onSubmit { commitLifespan() }
              .padding(.vertical, 8).frame(width: 80)
              .background(theme.surfaceColor).foregroundStyle(theme.textColor)
              .clipShape(RoundedRectangle(cornerRadius: 4))
          }
        }
        .textFieldStyle(.plain)
        .multilineTextAlignment(.center)
        Text(quote).italic()
      }
      .font(.rubik(14))
      .foregroundStyle(theme.textMutedColor)
      .padding(20)
    }
    .onKeyPress(.escape) {
      focusedField = nil
      return .handled
    }
    .onAppear { refreshInputs() }
    .onChange(of: model.pendingLifeSidebarFieldFocus) { _, pending in
      guard pending else { return }
      model.pendingLifeSidebarFieldFocus = false
      // Defer so the key that opened the sidebar cannot append into the field.
      DispatchQueue.main.async {
        focusedField = .birthDate
      }
    }
    .onChange(of: model.lifeStore.preferences) { _, _ in refreshInputs() }
    .onChange(of: focusedField) { old, _ in
      if old == .birthDate { commitBirthDate() }
      if old == .lifespan { commitLifespan() }
    }
  }

  private var birthDateBounds: (min: Date, max: Date) {
    let calendar = EffectiveTimeZone.calendar
    let minimum = calendar.date(from: DateComponents(year: 1900, month: 1, day: 1, hour: 12)) ?? Date.distantPast
    return (minimum, model.referenceNow)
  }

  private var storedBirthDate: Date? {
    LifeMath.parseLifeDate(model.lifeStore.preferences.birthDate)
  }

  private func openBirthDatePicker() {
    pickerMonth = storedBirthDate ?? model.referenceNow
    showsBirthDatePicker = true
  }

  /// Web `DatePicker` with `captionPicker`: pick a year, then a month, then the day.
  private var birthDatePopover: some View {
    SidebarMonthPicker(
      displayedMonth: $pickerMonth,
      selectedDate: storedBirthDate ?? model.referenceNow,
      onSelectDate: { picked in
        invalidBirthDate = !model.lifeStore.updateBirthDate(LifeDateFormat.stored(from: picked))
        refreshInputs()
        showsBirthDatePicker = false
      },
      today: model.referenceNow,
      daysAreClickable: true,
      captionPicker: true,
      minimumDate: birthDateBounds.min,
      maximumDate: birthDateBounds.max
    )
    .frame(width: 252)
    .padding(12)
    .background(theme.surfacePanelColor)
    .accessibilityIdentifier("compass-life-birth-date-picker")
  }

  private func variationButton(_ label: String, symbol: String, direction: Int) -> some View {
    Button {
      model.lifeStore.cycleVariation(direction: direction)
    } label: {
      Image(systemName: symbol).font(.system(size: 12)).frame(width: 24, height: 24)
    }
    .buttonStyle(.plain).accessibilityLabel(label)
  }

  private func refreshInputs() {
    birthDate = LifeDateFormat.display(model.lifeStore.preferences.birthDate)
    lifespan = String(model.lifeStore.preferences.lifespan)
  }

  private func commitBirthDate() {
    let typed = birthDate.trimmingCharacters(in: .whitespacesAndNewlines)
    // An empty field clears the date; otherwise accept "Jun 10, 2026" or "2026-06-10".
    invalidBirthDate = !model.lifeStore.updateBirthDate(
      typed.isEmpty ? "" : (LifeDateFormat.storedValue(from: typed) ?? typed))
    refreshInputs()
  }

  private func commitLifespan() {
    if let value = Double(lifespan) { model.lifeStore.updateLifespan(value) }
    refreshInputs()
  }
}
