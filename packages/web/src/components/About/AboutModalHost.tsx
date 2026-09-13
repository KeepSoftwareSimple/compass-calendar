import { Suspense } from "react";
import { LazyAboutModal } from "@web/components/About/AboutModal.lazy";
import {
  selectIsAboutOpen,
  useSettingsStore,
} from "@web/settings/settings.store";

/** Mounts About only while it is open so the dialog stays off the boot graph. */
export function AboutModalHost() {
  const isOpen = useSettingsStore(selectIsAboutOpen);
  if (!isOpen) return null;

  return (
    <Suspense fallback={null}>
      <LazyAboutModal />
    </Suspense>
  );
}
