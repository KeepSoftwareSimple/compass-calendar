import { Suspense } from "react";
import { LazySettingsModal } from "@web/components/Settings/SettingsModal.lazy";
import {
  selectIsSettingsOpen,
  useSettingsStore,
} from "@web/settings/settings.store";

/**
 * Mounts Settings only while it is open so the dialog chunk stays off the
 * boot graph. Unmounting on close also clears disconnect confirmation state
 * that used to be reset by leaving the modal mounted.
 */
export function SettingsModalHost() {
  const isOpen = useSettingsStore(selectIsSettingsOpen);
  if (!isOpen) return null;

  return (
    <Suspense fallback={null}>
      <LazySettingsModal />
    </Suspense>
  );
}
