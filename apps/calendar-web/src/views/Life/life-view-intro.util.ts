import { type UserMetadata } from "@core/types/user.types";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";

export const LIFE_VIEW_INTRO_TITLE = "Life view";

export const LIFE_VIEW_INTRO_BODY =
  "Your life as a grid of weeks. Seeing how few you have left may make you pause before scheduling more busy work.";

export const LIFE_VIEW_INTRO_QUOTE =
  "The real measure of any time management technique is whether it helps you neglect the right things.";

export const LIFE_VIEW_INTRO_PRIMARY_LABEL = "Got it";

export function hasSeenLifeViewIntroLocally(): boolean {
  if (!persistentBrowserStore.isAvailable()) return true;
  return (
    persistentBrowserStore.get(STORAGE_KEYS.HAS_SEEN_LIFE_VIEW_INTRO) === "true"
  );
}

export function markLifeViewIntroSeenLocally(): void {
  persistentBrowserStore.set(STORAGE_KEYS.HAS_SEEN_LIFE_VIEW_INTRO, "true");
}

export function readLifeViewIntroSeenFromMetadata(
  metadata: UserMetadata | null | undefined,
): boolean {
  return Boolean(metadata?.onboarding?.lifeViewIntroSeenAt);
}

export function lifeViewIntroMetadataPatch(): Pick<UserMetadata, "onboarding"> {
  return {
    onboarding: {
      lifeViewIntroSeenAt: new Date().toISOString(),
    },
  };
}
