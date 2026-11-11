import classNames from "classnames";
import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useId,
  useState,
} from "react";
import { useStableLoadingVisible } from "@web/common/hooks/useStableLoadingVisible";
import { InlineSpinner } from "@web/components/InlineSpinner/InlineSpinner";
import { useFloatingLayer } from "@web/shortcuts/floating-layer";
import { GoogleMapsAttribution } from "@web/views/Forms/EventForm/LocationField/GoogleMapsAttribution";
import { LocationSuggestionRow } from "@web/views/Forms/EventForm/LocationField/LocationSuggestionRow";
import {
  PLACE_SUGGESTION_MIN_LENGTH,
  usePlaceSuggestions,
} from "@web/views/Forms/EventForm/LocationField/usePlaceSuggestions";

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
  const trimmedValue = value.trim();
  const queryMeetsMin = trimmedValue.length >= PLACE_SUGGESTION_MIN_LENGTH;
  const { suggestions, isSearching, isError, isFetched } = usePlaceSuggestions(
    isListOpen ? value : "",
    apiKey,
  );
  const showLoadingRow = useStableLoadingVisible(isSearching);
  const showSuggestions = suggestions.length > 0;
  const showEmpty =
    queryMeetsMin &&
    isFetched &&
    !isSearching &&
    !isError &&
    suggestions.length === 0;
  const showError = queryMeetsMin && isError && !isSearching;
  const showPanel =
    isListOpen &&
    queryMeetsMin &&
    (showLoadingRow || showSuggestions || showEmpty || showError);
  const listHasOptions = showSuggestions;
  const isExpanded = showPanel;

  useFloatingLayer(`locationField:${listId}`, showPanel);

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
    if (!showPanel) return;

    if (listHasOptions) {
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
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeList();
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
          listHasOptions && activeIndex >= 0
            ? `${listId}-${activeIndex}`
            : undefined
        }
        autoComplete="off"
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      {showPanel && (
        <div className="absolute top-full right-0 left-0 z-10 mt-1 overflow-hidden rounded-md border border-border bg-surface-raised shadow-lg">
          <div aria-label="Location suggestions" id={listId} role="listbox">
            {showLoadingRow && !showSuggestions && (
              <LocationSuggestionRow className="gap-2 text-text-muted">
                <InlineSpinner ring="subtle" size="sm" />
                <span>Searching…</span>
              </LocationSuggestionRow>
            )}
            {showSuggestions &&
              suggestions.map((suggestion, index) => (
                <button
                  aria-selected={index === activeIndex}
                  className={classNames(
                    "flex min-h-10 w-full px-3 py-2 text-left text-sm text-text hover:bg-surface-overlay",
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
            {showEmpty && (
              <LocationSuggestionRow className="text-text-muted">
                No places found
              </LocationSuggestionRow>
            )}
            {showError && (
              <LocationSuggestionRow className="text-text-muted">
                Could not load suggestions
              </LocationSuggestionRow>
            )}
          </div>
          <GoogleMapsAttribution />
        </div>
      )}
    </div>
  );
}
