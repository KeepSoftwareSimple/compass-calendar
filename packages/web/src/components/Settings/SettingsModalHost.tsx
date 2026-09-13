import { SettingsModal } from "@web/components/Settings/SettingsModal";
import {
  selectIsSettingsOpen,
  useSettingsStore,
} from "@web/settings/settings.store";

/**
 * Mounts Settings only while it is open. Unmounting on close also clears
 * disconnect confirmation state that used to be reset by leaving the modal
 * mounted. Deliberately a static import, not a chunk boundary: splitting the
 * dialog out fragmented shared boot modules into extra requests that cost
 * more than the split saved (see the 2026-09-13 note in
 * .github/perf/assert-budget.ts).
 */
export function SettingsModalHost() {
  const isOpen = useSettingsStore(selectIsSettingsOpen);
  if (!isOpen) return null;

  return <SettingsModal />;
}
