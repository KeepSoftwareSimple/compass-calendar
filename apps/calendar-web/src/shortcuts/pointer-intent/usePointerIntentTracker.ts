import { useEffect } from "react";
import { attachPointerIntentTracker } from "@web/shortcuts/pointer-intent/attachPointerIntentTracker";
import { type ShortcutKeysLookup } from "@web/shortcuts/pointer-intent/pointer-intent";
import {
  registerPointerIntentKeysLookup,
  resetPointerIntentKeysLookupForTests,
} from "@web/shortcuts/pointer-intent/pointer-intent.actions";

type UsePointerIntentTrackerOptions = {
  enabled: boolean;
  lookup: ShortcutKeysLookup;
};

export function usePointerIntentTracker({
  enabled,
  lookup,
}: UsePointerIntentTrackerOptions): void {
  useEffect(() => {
    registerPointerIntentKeysLookup(lookup);
    return () => resetPointerIntentKeysLookupForTests();
  }, [lookup]);

  useEffect(() => {
    if (!enabled) return;
    return attachPointerIntentTracker();
  }, [enabled]);
}
