import { AboutModal } from "@web/components/About/AboutModal";
import {
  selectIsAboutOpen,
  useSettingsStore,
} from "@web/settings/settings.store";

/** Mounts About only while it is open. Static import on purpose; see SettingsModalHost. */
export function AboutModalHost() {
  const isOpen = useSettingsStore(selectIsAboutOpen);
  if (!isOpen) return null;

  return <AboutModal />;
}
