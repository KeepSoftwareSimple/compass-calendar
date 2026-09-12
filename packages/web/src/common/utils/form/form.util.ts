import { ID_EVENT_FORM } from "../../constants/web.constants";

const EVENT_FORM_SELECTOR = `form[name="${ID_EVENT_FORM}"]`;

export type EventFormFocusField =
  | "actions"
  | "title"
  | "location"
  | "description"
  | "start"
  | "end"
  | "recurrence"
  | "calendar"
  | "color"
  | "attendees"
  | "rsvp";

const queryEventFormElement = <T extends Element>(selector: string): T | null =>
  document.querySelector<T>(selector);

/** The docked event form itself, used as a positioning anchor. */
export const getEventFormElement = (): HTMLElement | null =>
  queryEventFormElement<HTMLElement>(EVENT_FORM_SELECTOR);

const findFirstMatch = (selectors: string[]): HTMLElement | null => {
  for (const selector of selectors) {
    const element = queryEventFormElement<HTMLElement>(selector);
    if (element) {
      return element;
    }
  }
  return null;
};

/** Per-field fallback selectors, in priority order. These target the visible
 * control (the chip anchor), not a hidden inner input. react-select's dummy
 * input is often 2px wide — too small for a hint chip — so combobox fields
 * put the id on the wrapper. */
const FIELD_SELECTORS: Record<EventFormFocusField, string[]> = {
  // The action toolbar above the title. FOCUSABLE_SELECTOR lands on the
  // first button (Duplicate when present, otherwise Delete or Close).
  actions: [`${EVENT_FORM_SELECTOR} #event-form-actions`],
  title: [`${EVENT_FORM_SELECTOR} input[name="Event Title"]`],
  location: [
    `${EVENT_FORM_SELECTOR} #event-form-location`,
    `${EVENT_FORM_SELECTOR} input[name="Event Location"]`,
  ],
  description: [`#event-form-description`],
  // Timed events expose a start-time combobox wrapper; all-day uses the date input.
  start: [
    `${EVENT_FORM_SELECTOR} #startTimePicker`,
    `${EVENT_FORM_SELECTOR} input[title="Pick Start Date"]`,
  ],
  end: [
    `${EVENT_FORM_SELECTOR} #endTimePicker`,
    `${EVENT_FORM_SELECTOR} input[title="Pick End Date"]`,
  ],
  recurrence: [
    `${EVENT_FORM_SELECTOR} #event-form-recurrence button[aria-label="Edit recurrence"]`,
    `${EVENT_FORM_SELECTOR} #event-form-recurrence button[aria-label="Repeat"]`,
  ],
  calendar: [`#event-form-calendar`],
  color: [`#event-form-color`],
  attendees: [`#event-form-attendees`, `#event-form-guest-list`],
  rsvp: [`#event-form-rsvp`],
};

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[contenteditable='']",
  "[role='combobox']",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Visible control to chip while Mod is held. Same element as the jump
 * target's container; focus may land on a descendant (see
 * `getEventFormFieldElement`).
 */
export const getEventFormFieldAnchor = (
  field: EventFormFocusField,
): HTMLElement | null => findFirstMatch(FIELD_SELECTORS[field]);

const resolveFocusElement = (
  field: EventFormFocusField,
  anchor: HTMLElement,
): HTMLElement => {
  // Prefer the selected radio so arrow keys move from the current color or
  // RSVP answer. Unanswered RSVP has no checked input; land on the first.
  if (field === "color" || field === "rsvp") {
    return (
      anchor.querySelector<HTMLElement>('input[type="radio"]:checked') ??
      anchor.querySelector<HTMLElement>('input[type="radio"]') ??
      anchor
    );
  }

  if (anchor.matches(FOCUSABLE_SELECTOR)) return anchor;

  return (
    anchor.querySelector<HTMLElement>('[role="combobox"]') ??
    anchor.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
    anchor
  );
};

/**
 * The element a field jump would focus, or null if the field isn't currently
 * rendered (e.g. the calendar picker on an edit draft). Combobox wrappers
 * resolve to the inner input so the caret lands ready to type.
 */
export const getEventFormFieldElement = (
  field: EventFormFocusField,
): HTMLElement | null => {
  const anchor = getEventFormFieldAnchor(field);
  if (!anchor) return null;
  return resolveFocusElement(field, anchor);
};

/**
 * Focus a field inside the docked event form. The grid card and sidebar form
 * live in separate trees, so sequence shortcuts hop via the DOM.
 */
export const focusEventFormField = (field: EventFormFocusField): boolean => {
  const element = getEventFormFieldElement(field);
  if (!element) return false;
  element.focus();
  return true;
};

// The grid draft card and the sidebar-docked form live in separate component
// trees, so "typing on the focused card focuses the form's title" hops via
// the DOM instead of a shared ref.
export const focusEventFormTitle = () => {
  focusEventFormField("title");
};

const getKeyboardTarget = (
  keyboardEvent: Pick<KeyboardEvent, "target">,
): HTMLElement | null => {
  const target = keyboardEvent.target as HTMLElement | null;

  return target instanceof HTMLElement ? target : null;
};

export const isComboboxInteraction = (
  keyboardEvent: Pick<KeyboardEvent, "target">,
) => {
  const target = getKeyboardTarget(keyboardEvent);
  if (!target) {
    return false;
  }

  const role = target.getAttribute("role");

  if (role === "combobox" || role === "listbox" || role === "option") {
    return true;
  }

  const container =
    target.closest?.("[role='combobox']") ??
    target.closest?.("[role='listbox']") ??
    target.closest?.(".freq-select__control") ??
    target.closest?.(".freq-select__menu") ??
    target.closest?.(".freq-select__option");

  return Boolean(container);
};

// Prefer the contenteditable attribute (and ancestors) over
// `HTMLElement.isContentEditable`: jsdom often leaves that getter undefined
// even when TipTap has set contenteditable="true" on the focused node.
const isContentEditableElement = (target: HTMLElement) =>
  Boolean(
    target.isContentEditable ||
      target.closest("[contenteditable='true'], [contenteditable='']"),
  );

export const isEditableKeyboardTarget = (
  keyboardEvent: Pick<KeyboardEvent, "target">,
) => {
  if (isComboboxInteraction(keyboardEvent)) return true;

  const target = getKeyboardTarget(keyboardEvent);
  if (!target) return false;

  if (isContentEditableElement(target)) return true;

  const tagName = target.tagName.toLowerCase();
  if (tagName === "textarea" || tagName === "select") return true;
  if (tagName !== "input") return false;
  const type = (target as HTMLInputElement).type || "text";
  return (
    type !== "checkbox" &&
    type !== "radio" &&
    type !== "button" &&
    type !== "submit" &&
    type !== "reset"
  );
};

/**
 * Targets where Enter has a native meaning and the event-form Enter-to-save
 * hotkey must stand down: multiline editing (TipTap contenteditable /
 * textarea), buttons (toolbar + Save/Cancel), and focused links.
 * Single-line inputs are intentionally excluded so title/location Enter
 * still submits.
 */
export const shouldDeferEnterToTarget = (
  keyboardEvent: Pick<KeyboardEvent, "target">,
) => {
  const target = getKeyboardTarget(keyboardEvent);
  if (!target) return false;

  if (isContentEditableElement(target)) return true;

  const tagName = target.tagName.toLowerCase();
  if (tagName === "textarea" || tagName === "button") return true;
  if (tagName === "a" && target.hasAttribute("href")) return true;
  if (target.getAttribute("role") === "button") return true;

  return false;
};

export const isEventFormKeyboardTarget = (
  keyboardEvent: Pick<KeyboardEvent, "target">,
) => {
  const target = getKeyboardTarget(keyboardEvent);
  if (!target) {
    return false;
  }

  const formContainer = target.closest(EVENT_FORM_SELECTOR);

  return Boolean(formContainer);
};

export const isDeleteTextEditingTarget = (
  keyboardEvent: Pick<KeyboardEvent, "target">,
) => isEditableKeyboardTarget(keyboardEvent);
