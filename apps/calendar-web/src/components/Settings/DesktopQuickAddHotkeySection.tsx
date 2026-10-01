import { type FC, useCallback, useEffect, useState } from "react";
import { DESKTOP_QUICK_ADD_DEFAULT_HOTKEY } from "@core/desktop/desktop-quick-add.contract";
import { isDesktop } from "@web/desktop/isDesktop";

export const DesktopQuickAddHotkeySection: FC = () => {
  const [shortcut, setShortcut] = useState(DESKTOP_QUICK_ADD_DEFAULT_HOTKEY);
  const [savedShortcut, setSavedShortcut] = useState(shortcut);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktop()) return;
    const current = window.compassDesktop?.getQuickAddHotkey?.();
    if (typeof current === "string" && current.trim().length > 0) {
      setShortcut(current);
      setSavedShortcut(current);
    }
  }, []);

  const persist = useCallback((value: string) => {
    const trimmed = value.trim();
    if (trimmed.length < 3) {
      setError("Enter a shortcut with at least one modifier and a key.");
      return;
    }
    setError(null);
    window.compassDesktop?.setQuickAddHotkey?.(trimmed);
    setSavedShortcut(trimmed);
  }, []);

  if (!isDesktop()) return null;

  return (
    <section className="flex flex-col gap-2 border-border border-t pt-4">
      <h3 className="font-medium text-sm text-text">Global quick add</h3>
      <p className="text-text-muted text-xs">
        Opens a floating panel from any app. Uses a system hotkey, not
        Accessibility.
      </p>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-muted text-xs">Shortcut</span>
        <input
          className="rounded-md border border-border bg-surface px-3 py-2 text-text outline-none focus-visible:border-accent"
          onBlur={() => {
            if (shortcut !== savedShortcut) persist(shortcut);
          }}
          onChange={(event) => setShortcut(event.target.value)}
          spellCheck={false}
          value={shortcut}
        />
      </label>
      {error ? <p className="text-danger text-xs">{error}</p> : null}
      <button
        className="self-start text-accent text-xs underline-offset-2 hover:underline"
        onClick={() => {
          setShortcut(DESKTOP_QUICK_ADD_DEFAULT_HOTKEY);
          persist(DESKTOP_QUICK_ADD_DEFAULT_HOTKEY);
        }}
        type="button"
      >
        Restore default ({DESKTOP_QUICK_ADD_DEFAULT_HOTKEY})
      </button>
    </section>
  );
};
