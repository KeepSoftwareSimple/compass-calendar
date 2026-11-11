import {
  createContext,
  type ReactNode,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type CSSObjectWithLabel,
  type GroupBase,
  type MenuProps,
  type MultiValue,
  type MultiValueGenericProps,
  type MultiValueProps,
  components as selectComponents,
} from "react-select";
import CreatableSelect from "react-select/creatable";
import { CONTACT_SUGGESTION_QUERY_MIN_LENGTH } from "@core/types/contact.contracts";
import {
  type AttendeeInput,
  type AttendeeResponseStatus,
} from "@core/types/event-attendance.contracts";
import { CopyButton } from "@web/components/CopyButton/CopyButton";
import { ATTENDEE_RSVP_LABEL, statusForEmail } from "@web/events/attendee-rsvp";
import { useFloatingLayer } from "@web/shortcuts/floating-layer";
import { AttendeeRsvpStatus } from "@web/views/Forms/EventForm/AttendeeRsvpStatus";
import {
  FORM_CARD_FIELD_FONT_SIZE,
  FORM_CARD_FIELD_LINE_HEIGHT,
} from "@web/views/Forms/EventForm/FormCardIconRow";

/**
 * Fetches guest suggestions for the attendee combobox. Raw email chips
 * still work when the source is missing or returns nothing.
 */
export type AttendeeSuggestionSource = (
  query: string,
) => Promise<readonly AttendeeInput[]>;

const emptySuggestionSource: AttendeeSuggestionSource = () =>
  Promise.resolve([]);

interface AttendeeOption {
  /** Lower-cased email — react-select's identity key for chips/options. */
  value: string;
  label: string;
  attendee: AttendeeInput;
  /** Display-only. Never round-trips into the write-input attendee. */
  responseStatus: AttendeeResponseStatus;
}

const toOption = (
  attendee: AttendeeInput,
  responseStatus: AttendeeResponseStatus = "needsAction",
): AttendeeOption => ({
  value: attendee.email.toLowerCase(),
  label: attendee.displayName ?? attendee.email,
  attendee,
  responseStatus,
});

// Pragmatic shape check, not RFC 5322: something@something.tld with no
// whitespace. The core contract only enforces length (AttendeeInputSchema),
// so this is the gate that keeps junk strings from ever becoming chips.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isValidAttendeeEmail = (value: string): boolean => {
  const email = value.trim();
  return email.length > 0 && email.length <= 320 && EMAIL_PATTERN.test(email);
};

const ATTENDEE_FIELD = "attendee-field";

// The menu footer travels by context, not by a custom react-select prop:
// the Menu component below stays a stable module-scope identity (react-select
// remounts the whole menu when component identities change per render) while
// each AttendeeField instance provides its own footer node.
const AttendeeMenuFooterContext = createContext<ReactNode>(null);

// Menu with an optional non-scrolling footer under the option list: the slot
// the enable-contacts prompt renders into when a search finds nobody. With no
// footer in context this is exactly react-select's own Menu.
const AttendeeMenu = (
  props: MenuProps<AttendeeOption, true, GroupBase<AttendeeOption>>,
) => {
  const footer = useContext(AttendeeMenuFooterContext);
  return (
    <selectComponents.Menu {...props}>
      {props.children}
      {footer}
    </selectComponents.Menu>
  );
};

const AttendeeMultiValueLabel = (
  props: MultiValueGenericProps<AttendeeOption, true>,
) => {
  const email = props.data.attendee.email;
  return (
    <selectComponents.MultiValueLabel {...props}>
      <span className="inline-flex items-center gap-1">
        <AttendeeRsvpStatus status={props.data.responseStatus} />
        {props.children}
        <CopyButton label={`copy ${email}`} text={email} />
      </span>
    </selectComponents.MultiValueLabel>
  );
};

const AttendeeMultiValue = (props: MultiValueProps<AttendeeOption, true>) => (
  <selectComponents.MultiValue
    {...props}
    innerProps={{
      ...props.innerProps,
      "aria-label": `${props.data.label}, ${ATTENDEE_RSVP_LABEL[props.data.responseStatus]}`,
    }}
  />
);

// The listbox already says "Searching..." while a lookup runs; a spinner in
// the input row would only jitter the chips.
const NoLoadingIndicator = () => null;

const attendeeFieldComponents = {
  LoadingIndicator: NoLoadingIndicator,
  Menu: AttendeeMenu,
  MultiValue: AttendeeMultiValue,
  MultiValueLabel: AttendeeMultiValueLabel,
};

// react-select's emotion style objects beat class-based CSS for these text
// roles — same recipe as TimePicker/FreqSelect.
const themeColor =
  (cssVar: string) =>
  (base: CSSObjectWithLabel): CSSObjectWithLabel => ({
    ...base,
    color: cssVar,
  });

const zeroHorizontalInset = (base: CSSObjectWithLabel): CSSObjectWithLabel => ({
  ...base,
  margin: 0,
  padding: 0,
});

const formCardLineTypography = (
  base: CSSObjectWithLabel,
): CSSObjectWithLabel => ({
  ...zeroHorizontalInset(base),
  fontSize: FORM_CARD_FIELD_FONT_SIZE,
  lineHeight: FORM_CARD_FIELD_LINE_HEIGHT,
});

const attendeeFieldStyles = {
  control: (base: CSSObjectWithLabel): CSSObjectWithLabel => ({
    ...base,
    alignItems: "center",
    minHeight: FORM_CARD_FIELD_LINE_HEIGHT,
    border: 0,
    backgroundColor: "transparent",
    boxShadow: "none",
    "&:hover": {
      border: 0,
      backgroundColor: "transparent",
    },
  }),
  valueContainer: (base: CSSObjectWithLabel): CSSObjectWithLabel => ({
    ...base,
    margin: 0,
    padding: 0,
    alignItems: "center",
    minHeight: FORM_CARD_FIELD_LINE_HEIGHT,
  }),
  input: (base: CSSObjectWithLabel): CSSObjectWithLabel => ({
    ...formCardLineTypography(base),
    color: "var(--text)",
  }),
  placeholder: (base: CSSObjectWithLabel): CSSObjectWithLabel => ({
    ...formCardLineTypography(base),
    color: "var(--text-muted)",
  }),
  noOptionsMessage: themeColor("var(--text-muted)"),
  loadingMessage: themeColor("var(--text-muted)"),
  option: (
    base: CSSObjectWithLabel,
    { isFocused }: { isFocused: boolean },
  ): CSSObjectWithLabel => ({
    ...base,
    color: isFocused ? "var(--on-accent)" : "var(--text)",
    backgroundColor: isFocused ? "var(--accent)" : "transparent",
  }),
  multiValue: (base: CSSObjectWithLabel): CSSObjectWithLabel => ({
    ...base,
    backgroundColor: "var(--surface-raised)",
    borderRadius: "var(--radius-default)",
  }),
  multiValueLabel: (base: CSSObjectWithLabel): CSSObjectWithLabel => ({
    ...base,
    color: "var(--text)",
    display: "flex",
    alignItems: "center",
  }),
  multiValueRemove: (base: CSSObjectWithLabel): CSSObjectWithLabel => ({
    ...base,
    color: "var(--text-muted)",
    ":hover": {
      backgroundColor: "var(--error)",
      color: "var(--on-accent)",
    },
  }),
};

export interface AttendeeFieldProps {
  id?: string;
  /** Current guest chips, in the write-input shape (no responseStatus). */
  value: readonly AttendeeInput[];
  onChange: (next: readonly AttendeeInput[]) => void;
  suggestionSource?: AttendeeSuggestionSource;
  /**
   * Live provider RSVP keyed by lower-cased email. Display-only: chips stay
   * AttendeeInput onChange. Missing / newly typed emails paint as awaiting.
   */
  statusByEmail?: ReadonlyMap<string, AttendeeResponseStatus>;
  /**
   * Rendered at the bottom of the open listbox (non-scrolling) once a search
   * for the typed text found nobody: where the enable-contacts prompt lives,
   * so it appears exactly when someone is missing. Never a modal.
   */
  noMatchFooter?: ReactNode;
}

/**
 * Email-chip combobox for the event form's guest list. Typing a valid email
 * and pressing Enter (or picking a suggestion) adds a chip; Backspace or the
 * chip's remove button drops one; invalid strings never become chips. While
 * a lookup runs the listbox says "Searching..."; text that matches nobody and
 * is not a full email says so, with `noMatchFooter` underneath.
 * Enter/Backspace stop at the combobox (isComboboxInteraction also gates the
 * form's own shortcuts) and Escape closes the listbox before the form
 * (registered as a floating layer while open).
 */
export const AttendeeField = ({
  id,
  value,
  onChange,
  suggestionSource = emptySuggestionSource,
  statusByEmail,
  noMatchFooter = null,
}: AttendeeFieldProps) => {
  const [inputValue, setInputValue] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // True once a real search (long enough to query) came back empty. Kept
  // while the next lookup runs, so the footer does not blink between
  // keystrokes.
  const [hasMissed, setHasMissed] = useState(false);
  const [suggestions, setSuggestions] = useState<readonly AttendeeInput[]>([]);
  // Monotonic guard so a slow suggestion query can never clobber the results
  // of a newer one (or of a cleared input).
  const queryVersionRef = useRef(0);
  const layerId = useId();
  useFloatingLayer(`attendeeField:${layerId}`, isMenuOpen);

  const selectedOptions = useMemo(
    () =>
      value.map((attendee) =>
        toOption(attendee, statusForEmail(statusByEmail, attendee.email)),
      ),
    [statusByEmail, value],
  );
  const selectedEmails = useMemo(
    () => new Set(value.map((attendee) => attendee.email.toLowerCase())),
    [value],
  );
  const options = useMemo(
    () =>
      suggestions
        .filter((entry) => !selectedEmails.has(entry.email.toLowerCase()))
        .map((entry) => toOption(entry)),
    [selectedEmails, suggestions],
  );

  const loadSuggestions = (query: string) => {
    const version = ++queryVersionRef.current;
    setIsLoading(true);
    const isSearchable = query.length >= CONTACT_SUGGESTION_QUERY_MIN_LENGTH;
    suggestionSource(query)
      .then((results) => {
        if (queryVersionRef.current !== version) return;
        setSuggestions(results);
        setHasMissed(isSearchable && results.length === 0);
      })
      .catch(() => {
        if (queryVersionRef.current !== version) return;
        setSuggestions([]);
        setHasMissed(isSearchable);
      })
      .finally(() => {
        if (queryVersionRef.current === version) setIsLoading(false);
      });
  };

  const closeMenu = () => {
    queryVersionRef.current += 1;
    setInputValue("");
    setSuggestions([]);
    setIsLoading(false);
    setHasMissed(false);
    setIsMenuOpen(false);
  };

  const footer = hasMissed ? noMatchFooter : null;

  return (
    // `id` belongs on this visible wrapper, not react-select's dummy input.
    // The dummy input is often 2px wide, which fails the hold-Mod hint-chip
    // visibility check; the wrapper is the jump-target anchor.
    <div id={id} className="c-attendee-field">
      <AttendeeMenuFooterContext.Provider value={footer}>
        <CreatableSelect<AttendeeOption, true>
          inputId={id ? `${id}-input` : undefined}
          aria-label="Guests"
          classNamePrefix={ATTENDEE_FIELD}
          components={attendeeFieldComponents}
          styles={attendeeFieldStyles}
          isMulti
          isClearable={false}
          // The suggestion source already matched (and ranked) against the
          // query — People matches can hinge on fields the label/value never
          // show (e.g. a nickname), so react-select's default substring
          // filter would silently hide legitimate suggestions.
          filterOption={null}
          value={selectedOptions}
          options={options}
          inputValue={inputValue}
          menuIsOpen={isMenuOpen}
          isLoading={isLoading}
          loadingMessage={() => "Searching..."}
          // A typed full email must stay addable with Enter while a lookup
          // is still running; react-select hides it during loading otherwise.
          allowCreateWhileLoading
          placeholder="Add guests"
          onChange={(next: MultiValue<AttendeeOption>) => {
            onChange(next.map((option) => option.attendee));
          }}
          onInputChange={(nextInput, { action }) => {
            if (action === "input-change") {
              setInputValue(nextInput);
              const query = nextInput.trim();
              setIsMenuOpen(query.length > 0);
              if (query.length > 0) loadSuggestions(query);
              else {
                queryVersionRef.current += 1;
                setSuggestions([]);
                setIsLoading(false);
                setHasMissed(false);
              }
              return;
            }
            // set-value (chip added), input-blur, menu-close: reset the query.
            closeMenu();
          }}
          onKeyDown={(e) => {
            const key = e.key;

            // Chip creation/removal are the combobox's own interactions —
            // never the form's Enter-to-save or Delete-event shortcuts.
            if (key === "Enter" || key === "Backspace" || key === "Delete") {
              e.stopPropagation();
            }

            // Swallow Enter whenever react-select would not consume it itself
            // (menu closed, or open with nothing selectable — e.g. an invalid
            // email showing the inline rejection): otherwise the native
            // keypress submits the surrounding form.
            if (key === "Enter") {
              const query = inputValue.trim();
              const canCreateChip =
                isValidAttendeeEmail(query) &&
                !selectedEmails.has(query.toLowerCase());
              if (!isMenuOpen || (!canCreateChip && options.length === 0)) {
                e.preventDefault();
              }
            }

            if (key === "Escape" && isMenuOpen) {
              // Close the listbox only; a second Escape (menu closed, so this
              // handler lets it bubble) reaches the form's close handler.
              closeMenu();
              e.stopPropagation();
            }
          }}
          isValidNewOption={(candidate) =>
            isValidAttendeeEmail(candidate) &&
            !selectedEmails.has(candidate.trim().toLowerCase())
          }
          getNewOptionData={(candidate) =>
            toOption({ email: candidate.trim(), displayName: null })
          }
          formatCreateLabel={(candidate) => `Add "${candidate.trim()}"`}
          noOptionsMessage={({ inputValue: query }) => {
            const email = query.trim();
            if (email.length === 0) return null;
            if (selectedEmails.has(email.toLowerCase())) {
              return `${email} is already a guest`;
            }
            return "No matches. Type their full email.";
          }}
          createOptionPosition="first"
          tabSelectsValue={false}
        />
      </AttendeeMenuFooterContext.Provider>
    </div>
  );
};
