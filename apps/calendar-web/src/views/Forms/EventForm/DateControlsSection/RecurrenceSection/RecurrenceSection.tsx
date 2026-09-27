// App-facing module for RecurrenceSection. The implementation lives in
// RecurrenceSectionView so unit tests can import the real component even when
// another test file has mock.module'd this path process-wide (bun's
// mock.module leaks across files and mutates module exports in place). The
// local-const indirection (rather than `export ... from`) keeps that in-place
// mutation from following the live re-export binding into the view module.
import { RecurrenceSection as RecurrenceSectionImplementation } from "@web/views/Forms/EventForm/DateControlsSection/RecurrenceSection/RecurrenceSectionView";

export type { RecurrenceSectionProps } from "@web/views/Forms/EventForm/DateControlsSection/RecurrenceSection/RecurrenceSectionView";

export const RecurrenceSection = RecurrenceSectionImplementation;
