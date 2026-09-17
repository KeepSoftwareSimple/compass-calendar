import {
  createEventRegistry,
  type EventRegistry,
  type RegisteredEventTarget,
} from "./event.registry";
import { createGridEventTargeting } from "./event.targeting";
import { useEventRegistrationRef } from "./use-event-registration-ref";

export type ViewInteractionEventType = "all-day" | "timed";

const isViewInteractionEventType = (
  value: string | null,
): value is ViewInteractionEventType =>
  value === "all-day" || value === "timed";

export type ViewRegisteredEventTarget =
  RegisteredEventTarget<ViewInteractionEventType>;

export type ViewEventRegistry = EventRegistry<ViewInteractionEventType>;

/**
 * Marks a card that renders read-only (unwritable calendar or busy content).
 * Those cards never enter the interaction registry - that absence is what
 * stops the drag/resize engine from targeting them - so this attribute is the
 * only way targeting can still find them for jump labels and focus.
 */
export const GRID_EVENT_READ_ONLY_ATTRIBUTE = "data-grid-event-readonly";

/**
 * The `data-${viewName}-interaction-event-*` attribute names alone, with no
 * registry attached - for call sites (like stripping these attributes off a
 * cloned draft-event node) that need the naming scheme but have no reason to
 * instantiate a registry.
 */
export const viewInteractionAttributeNames = (viewName: string) => ({
  idAttribute: `data-${viewName}-interaction-event-id`,
  typeAttribute: `data-${viewName}-interaction-event-type`,
});

/**
 * Day and Week are sibling routes and never co-mounted, so a DOM query can
 * safely accept either view's id attribute. Used by context menus, undo
 * focus-restore, and other callers that need an event id without knowing
 * which view rendered the card.
 */
export const CALENDAR_VIEW_INTERACTION_ID_ATTRIBUTES = [
  viewInteractionAttributeNames("day").idAttribute,
  viewInteractionAttributeNames("week").idAttribute,
] as const;

export const calendarEventIdElementSelector = () =>
  CALENDAR_VIEW_INTERACTION_ID_ATTRIBUTES.map((attr) => `[${attr}]`).join(", ");

export const calendarEventIdValueSelector = (eventId: string) =>
  CALENDAR_VIEW_INTERACTION_ID_ATTRIBUTES.map(
    (attr) => `[${attr}="${eventId}"]`,
  ).join(", ");

export const readCalendarEventIdFromElement = (
  element: HTMLElement,
): string | null => {
  const eventElement = element.closest(calendarEventIdElementSelector());
  if (!eventElement) {
    return null;
  }

  for (const attr of CALENDAR_VIEW_INTERACTION_ID_ATTRIBUTES) {
    const eventId = eventElement.getAttribute(attr);
    if (eventId) {
      return eventId;
    }
  }

  return null;
};

/**
 * One interaction registry per calendar view (Day, Week), namespaced by
 * `data-${viewName}-interaction-event-*` attributes so a view only ever
 * resolves its own DOM nodes.
 */
export const createViewInteractionRegistry = (viewName: string) => {
  const { idAttribute, typeAttribute } =
    viewInteractionAttributeNames(viewName);

  const createRegistry = (): ViewEventRegistry =>
    createEventRegistry<ViewInteractionEventType>({
      eventIdAttribute: idAttribute,
      eventTypeAttribute: typeAttribute,
      isEventType: isViewInteractionEventType,
    });

  const getInteractionTargetAttributes = ({
    eventId,
    eventType,
    isReadOnly = false,
  }: {
    eventId: string | undefined;
    eventType: ViewInteractionEventType;
    isReadOnly?: boolean;
  }): Record<string, string> => {
    if (!eventId) {
      return {};
    }

    return {
      [idAttribute]: eventId,
      [typeAttribute]: eventType,
      ...(isReadOnly ? { [GRID_EVENT_READ_ONLY_ATTRIBUTE]: "true" } : {}),
    };
  };

  const registry = createRegistry();
  const targeting = createGridEventTargeting({
    eventIdAttribute: idAttribute,
    eventTypeAttribute: typeAttribute,
    isEventType: isViewInteractionEventType,
    readOnlyAttribute: GRID_EVENT_READ_ONLY_ATTRIBUTE,
    registry,
  });

  const useRegistrationRef = ({
    eventId,
    eventType,
    isEnabled,
  }: {
    eventId: string | undefined;
    eventType: ViewInteractionEventType;
    isEnabled: boolean;
  }) =>
    useEventRegistrationRef({
      eventId,
      eventType,
      isEnabled,
      registry,
    });

  return {
    idAttribute,
    typeAttribute,
    createRegistry,
    registry,
    targeting,
    getInteractionTargetAttributes,
    useRegistrationRef,
  };
};

export type CalendarGridView = "day" | "week";

export const dayViewInteraction = createViewInteractionRegistry("day");
export const weekViewInteraction = createViewInteractionRegistry("week");

const calendarViewInteractions = {
  day: dayViewInteraction,
  week: weekViewInteraction,
} as const;

export const calendarViewInteraction = (view: CalendarGridView) =>
  calendarViewInteractions[view];

export const DAY_INTERACTION_EVENT_ID_ATTRIBUTE =
  dayViewInteraction.idAttribute;
export const DAY_INTERACTION_EVENT_TYPE_ATTRIBUTE =
  dayViewInteraction.typeAttribute;
export type DayInteractionEventType = ViewInteractionEventType;
export type DayRegisteredEventTarget = ViewRegisteredEventTarget;
export type DayEventRegistry = ViewEventRegistry;
export const getDayInteractionTargetAttributes =
  dayViewInteraction.getInteractionTargetAttributes;
export const createDayEventRegistry = dayViewInteraction.createRegistry;
export const dayEventRegistry = dayViewInteraction.registry;
export const dayEventTargeting = dayViewInteraction.targeting;
export const useDayEventRegistrationRef = dayViewInteraction.useRegistrationRef;

export const WEEK_INTERACTION_EVENT_ID_ATTRIBUTE =
  weekViewInteraction.idAttribute;
export const WEEK_INTERACTION_EVENT_TYPE_ATTRIBUTE =
  weekViewInteraction.typeAttribute;
export type WeekInteractionEventType = ViewInteractionEventType;
export type WeekRegisteredEventTarget = ViewRegisteredEventTarget;
export type WeekEventRegistry = ViewEventRegistry;
export const getWeekInteractionTargetAttributes =
  weekViewInteraction.getInteractionTargetAttributes;
export const createWeekEventRegistry = weekViewInteraction.createRegistry;
export const weekEventRegistry = weekViewInteraction.registry;
export const weekEventTargeting = weekViewInteraction.targeting;
export const useWeekEventRegistrationRef =
  weekViewInteraction.useRegistrationRef;
