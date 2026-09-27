import { type Event } from "@core/types/event.contracts";
import {
  type UserMetadataState,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";
import {
  type UpNextAvailabilityState,
  upNextAvailabilityActions,
  useUpNextAvailabilityStore,
} from "@web/components/Sidebar/UpNextCard/up-next.availability.store";
import {
  type State_DraftEvent,
  useDraftStore,
} from "@web/events/stores/draft.store";
import { eventClipboardActions } from "@web/events/stores/event-clipboard.store";
import { useViewStore } from "@web/events/stores/view.store";
import { useSettingsStore } from "@web/settings/settings.store";

type SettingsState = ReturnType<typeof useSettingsStore.getState>;
type ViewState = ReturnType<typeof useViewStore.getState>;

/**
 * State shape accepted by the render helpers' `state` option.
 */
export type TestAppState = {
  events?: {
    draft?: Partial<State_DraftEvent>;
    clipboard?: Event | null;
  };
  settings?: Partial<SettingsState>;
  userMetadata?: Partial<UserMetadataState>;
  view?: Partial<ViewState>;
  upNextAvailability?: Partial<UpNextAvailabilityState>;
};

/** Seed the stores from the test state. */
export function seedStoresFromState(state?: TestAppState): void {
  if (!state) return;

  const { events, settings, userMetadata, view, upNextAvailability } = state;
  if (events?.draft) useDraftStore.setState(events.draft);
  if (events?.clipboard) eventClipboardActions.copy(events.clipboard);
  if (events?.clipboard === null) eventClipboardActions.clear();
  if (settings) useSettingsStore.setState(settings);
  if (userMetadata) useUserMetadataStore.setState(userMetadata);
  if (view) useViewStore.setState(view);
  if (upNextAvailability) {
    upNextAvailabilityActions.publish({
      ...useUpNextAvailabilityStore.getState(),
      ...upNextAvailability,
    });
  }
}
