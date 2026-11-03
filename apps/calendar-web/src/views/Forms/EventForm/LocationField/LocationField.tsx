import classNames from "classnames";
import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useId,
  useState,
} from "react";
import { useFloatingLayer } from "@web/shortcuts/floating-layer";
import { usePlaceSuggestions } from "@web/views/Forms/EventForm/LocationField/usePlaceSuggestions";

interface LocationFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Google Places key. Without one the field is a plain input. */
  apiKey?: string;
  className?: string;
  disabled?: boolean;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
}

/**
 * The event form's location input. With a Places key it becomes a
 * `role="combobox"` offering address suggestions through
 * `aria-activedescendant` (focus never leaves the input, as in
 * TimezoneCombobox). Free typing always works; a suggestion only replaces
 * the text when picked.
 *
 * Keys stop at the field only while the list is open: Enter picks (or just
 * closes the list), Escape closes it. With the list closed, `aria-expanded`
 * is false and Enter falls through to the form's save shortcut.
 */
export function LocationField({
  id,
  value,
  onChange,
  apiKey,
  className,
  disabled,
  onKeyDown,
  onBlur,
}: LocationFieldProps) {
  const listId = useId();
  const [isListOpen, setIsListOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const suggestions = usePlaceSuggestions(isListOpen ? value : "", apiKey);
  const isExpanded = isListOpen && suggestions.length > 0;
  useFloatingLayer(`locationField:${listId}`, isExpanded);

  const closeList = () => {
    setIsListOpen(false);
    setActiveIndex(-1);
  };

  const handleBlur = () => {
    closeList();
    onBlur?.();
  };

  const pick = (suggestion: string) => {
    onChange(suggestion);
    closeList();
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
    setIsListOpen(true);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (!isExpanded) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) =>
        Math.min(suggestions.length - 1, Math.max(0, index + delta)),
      );
    } else if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      const active = suggestions[activeIndex];
      if (event.key === "Enter" && active !== undefined) pick(active);
      else closeList();
    }
  };

  const sharedProps = {
    id,
    className,
    disabled,
    placeholder: "Location",
    "aria-label": "Location",
    name: "Event Location",
    value,
  };

  if (!apiKey) {
    return (
      <input
        {...sharedProps}
        onChange={(event) => onChange(event.target.value)}
        onBlur={handleBlur}
        onKeyDown={onKeyDown}
      />
    );
  }

  return (
    <div className="relative flex min-w-0 flex-1">
      <input
        {...sharedProps}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={isExpanded}
        aria-activedescendant={
          isExpanded && activeIndex >= 0
            ? `${listId}-${activeIndex}`
            : undefined
        }
        autoComplete="off"
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      {isExpanded && (
        <div className="absolute top-full right-0 left-0 z-10 mt-1 overflow-hidden rounded-md border border-border bg-surface-raised shadow-lg">
          <div aria-label="Location suggestions" id={listId} role="listbox">
            {suggestions.map((suggestion, index) => (
              <button
                aria-selected={index === activeIndex}
                className={classNames(
                  "flex w-full px-3 py-2 text-left text-sm text-text hover:bg-surface-overlay",
                  index === activeIndex && "bg-surface-overlay",
                )}
                id={`${listId}-${index}`}
                key={suggestion}
                // mousedown, not click: keeps focus in the input so blur
                // does not close the list before the pick lands.
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(suggestion);
                }}
                role="option"
                tabIndex={-1}
                type="button"
              >
                {suggestion}
              </button>
            ))}
          </div>
          <p className="border-border border-t px-3 py-1 text-right text-text-muted text-xs">
            Powered by Google
          </p>
        </div>
      )}
    </div>
  );
}
