import { VideoCameraIcon } from "@phosphor-icons/react/dist/csr/VideoCamera";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import {
  type FC,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { upNextPickerTitle } from "@core/up-next/up-next-nudge-window.util";
import { Z_INDEX_FLOATING_MENU } from "@web/common/constants/web.constants";
import IconButton from "@web/components/IconButton/IconButton";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import {
  digitPickIndex,
  digitPickOwnerAttrs,
} from "@web/shortcuts/digit-pick.util";
import { useFloatingLayer } from "@web/shortcuts/floating-layer";
import { inEffectiveTimeZone } from "@web/timezone/in-time-zone";

export type UpNextPickerRow = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  hasMeetingLink: boolean;
};

const formatTimeRange = (startDate: string, endDate: string): string => {
  const start = inEffectiveTimeZone(startDate).format("h:mm A");
  const end = inEffectiveTimeZone(endDate).format("h:mm A");
  return `${start} - ${end}`;
};

export const UpNextEventPicker: FC<{
  hasCurrentEvent: boolean;
  onClose: () => void;
  onSelect: (eventId: string) => void;
  rows: readonly UpNextPickerRow[];
}> = ({ hasCurrentEvent, onClose, onSelect, rows }) => {
  useFloatingLayer("upNextEventPicker", true);
  const listRef = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const title = upNextPickerTitle(rows.length, hasCurrentEvent);

  useEffect(() => {
    listRef.current[activeIndex]?.focus();
  }, [activeIndex]);

  useEffect(() => {
    listRef.current[0]?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    const digitIndex = digitPickIndex(event);
    if (digitIndex !== null && digitIndex < rows.length) {
      event.preventDefault();
      onSelect(rows[digitIndex].id);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % rows.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + rows.length) % rows.length);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[activeIndex];
      if (row) onSelect(row.id);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-end justify-center px-3 pb-6"
      style={{ zIndex: Z_INDEX_FLOATING_MENU }}
    >
      <div
        aria-label={title}
        className="pointer-events-auto w-full max-w-sm rounded-xl border border-border bg-surface/95 shadow-xl backdrop-blur-2xl backdrop-saturate-150"
        onKeyDown={handleKeyDown}
        role="dialog"
        {...digitPickOwnerAttrs()}
      >
        <div className="flex items-start justify-between gap-2 border-border border-b px-3 py-2">
          <p className="text-sm text-text">{title}</p>
          <IconButton
            aria-label="Close"
            className="shrink-0 text-text-muted hover:text-text"
            onClick={onClose}
            size="small"
          >
            <XIcon aria-hidden="true" size={14} />
          </IconButton>
        </div>
        <div className="max-h-64 overflow-y-auto py-1" role="listbox">
          {rows.map((row, index) => {
            const digitLabel = String(index + 1);
            const isActive = index === activeIndex;
            return (
              <div key={row.id} role="presentation">
                <button
                  aria-selected={isActive}
                  className="c-focus-ring flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-panel data-[active=true]:bg-surface-panel"
                  data-active={isActive || undefined}
                  onClick={() => onSelect(row.id)}
                  ref={(node) => {
                    listRef.current[index] = node;
                  }}
                  role="option"
                  type="button"
                >
                  {row.hasMeetingLink ? (
                    <VideoCameraIcon
                      aria-hidden
                      className="shrink-0 text-text-muted"
                      size={16}
                      weight="fill"
                    />
                  ) : (
                    <span aria-hidden className="size-4 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-text">
                      {row.title}
                    </span>
                    <span className="block text-text-muted text-xs">
                      {formatTimeRange(row.startDate, row.endDate)}
                    </span>
                  </span>
                  <ShortcutHint>{digitLabel}</ShortcutHint>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
