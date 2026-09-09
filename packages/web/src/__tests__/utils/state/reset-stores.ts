/**
 * Zustand stores (and other module-level singleton stores, e.g. the
 * repository-source cache) persist across test files within a worker, so
 * test isolation comes from resetting them between tests instead of building
 * a fresh store per render.
 */

import { resetConnectAppleStoreForTests } from "@web/auth/providers/connect-apple.store";
import {
  initialUserMetadataState,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";
import { resetBillingGateAttentionForTests } from "@web/billing/billing-gate-attention";
import {
  initialBillingPreviewState,
  useBillingPreviewStore,
} from "@web/billing/billing-preview.store";
import {
  initialCardUpdateState,
  useCardUpdateStore,
} from "@web/billing/card-update.store";
import {
  initialCheckoutPanelState,
  useCheckoutPanelStore,
} from "@web/billing/checkout-panel.store";
import { resetNewMeetingsNoticeForTests } from "@web/booking/useNewMeetingsNotice";
import { resetCalendarVisibilityStoreForTests } from "@web/calendars/calendar-visibility.store";
import { resetCollapsedAccountsStoreForTests } from "@web/calendars/collapsed-accounts.store";
import { resetDefaultCalendarStoreForTests } from "@web/calendars/default-calendar.store";
import { resetRecentCommandsStoreForTests } from "@web/components/CommandPalette/recent-commands.store";
import { resetConnectCalendarPromptStoreForTests } from "@web/components/ConnectCalendarPrompt/connect-calendar.store";
import { useFeedbackStore } from "@web/components/Feedback/feedback.store";
import {
  initialFirstEventPromptState,
  useFirstEventPromptStore,
} from "@web/components/FirstEventPrompt/first-event.store";
import {
  initialShortcutShowcaseState,
  useShortcutShowcaseStore,
} from "@web/components/ShortcutShowcase/showcase.store";
import { useWelcomeGuideStore } from "@web/components/WelcomeModal/welcome.guide.store";
import { recurrenceScopeOpportunityActions } from "@web/events/recurrence/recurrence-scope-opportunity.store";
import { resetEventRepositorySourceForTests } from "@web/events/repositories/event.repository.source.store";
import {
  initialDraftState,
  useDraftStore,
} from "@web/events/stores/draft.store";
import {
  initialEventClipboardState,
  useEventClipboardStore,
} from "@web/events/stores/event-clipboard.store";
import {
  initialUndoHistoryState,
  useUndoHistoryStore,
} from "@web/events/stores/undo.store";
import { initialViewState, useViewStore } from "@web/events/stores/view.store";
import {
  initialSettingsState,
  useSettingsStore,
} from "@web/settings/settings.store";
import { useThemeStore } from "@web/settings/theme/theme.store";
import {
  initialEditSequenceState,
  useEditSequenceStore,
} from "@web/shortcuts/edit-sequence/edit-sequence.store";
import {
  initialPointerBlockState,
  usePointerBlockStore,
} from "@web/shortcuts/keyboard-only/pointer-block.store";
import { pointerConfusionActions } from "@web/shortcuts/keyboard-only/pointer-confusion.store";
import { resetPointerHintPersistenceForTests } from "@web/shortcuts/keyboard-only/pointer-hint.storage";
import {
  initialPageJumpHintState,
  usePageJumpHintStore,
} from "@web/shortcuts/page-jump/page-jump.store";
import {
  initialEventJumpState,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";
import { resetShortcutTelemetryForTests } from "@web/shortcuts/tips/shortcut-telemetry";
import { resetShortcutHintProgressStoreForTests } from "@web/shortcuts/tips/shortcut-tips.progress.store";
import { resetEffectiveTimeZoneStoreForTests } from "@web/timezone/effective-timezone.store";
import { resetTimeTravelStoreForTests } from "@web/timezone/time-travel.store";
import { useTimezoneDialogStore } from "@web/timezone/timezone-dialog.store";

type StoreReset = () => void;

const storeResets: StoreReset[] = [
  () => useSettingsStore.setState(initialSettingsState, true),
  () => useViewStore.setState(initialViewState, true),
  () => useUserMetadataStore.setState(initialUserMetadataState, true),
  () => useDraftStore.setState(initialDraftState, true),
  () => useEventClipboardStore.setState(initialEventClipboardState, true),
  () => useUndoHistoryStore.setState(initialUndoHistoryState, true),
  recurrenceScopeOpportunityActions.reset,
  resetEventRepositorySourceForTests,
  // Storage itself is cleared by resetBrowserState() (test-lifecycle.ts)
  // before this runs; this just resyncs the module-singleton store to match.
  resetConnectAppleStoreForTests,
  resetCalendarVisibilityStoreForTests,
  resetDefaultCalendarStoreForTests,
  resetEffectiveTimeZoneStoreForTests,
  resetTimeTravelStoreForTests,
  () =>
    useTimezoneDialogStore.setState({ isOpen: false, purpose: "pin" }, true),
  resetCollapsedAccountsStoreForTests,
  resetRecentCommandsStoreForTests,
  () => useFeedbackStore.setState(useFeedbackStore.getInitialState(), true),
  () => useShortcutShowcaseStore.setState(initialShortcutShowcaseState, true),
  () => useFirstEventPromptStore.setState(initialFirstEventPromptState, true),
  resetConnectCalendarPromptStoreForTests,
  () =>
    useWelcomeGuideStore.setState(useWelcomeGuideStore.getInitialState(), true),
  () => useThemeStore.setState(useThemeStore.getInitialState(), true),
  () => useEditSequenceStore.setState(initialEditSequenceState, true),
  () => {
    resetPointerHintPersistenceForTests();
    pointerConfusionActions.resetForTests();
  },
  () => usePointerBlockStore.setState(initialPointerBlockState, true),
  () => useEventJumpStore.setState(initialEventJumpState, true),
  () => usePageJumpHintStore.setState(initialPageJumpHintState, true),
  () => useBillingPreviewStore.setState(initialBillingPreviewState, true),
  resetBillingGateAttentionForTests,
  resetNewMeetingsNoticeForTests,
  () => useCheckoutPanelStore.setState(initialCheckoutPanelState, true),
  () => useCardUpdateStore.setState(initialCardUpdateState, true),
  resetShortcutHintProgressStoreForTests,
  resetShortcutTelemetryForTests,
];

export function resetAllStores() {
  for (const reset of storeResets) {
    reset();
  }
}
