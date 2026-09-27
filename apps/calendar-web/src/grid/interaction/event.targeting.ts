import {
  type EventRegistry,
  type RegisteredEventTarget,
} from "./event.registry";

export type GridEventTarget<TType extends string> =
  RegisteredEventTarget<TType>;

export const createGridEventTargeting = <TType extends string>({
  eventIdAttribute,
  eventTypeAttribute,
  isEventType,
  readOnlyAttribute,
  registry,
}: {
  eventIdAttribute: string;
  eventTypeAttribute: string;
  isEventType: (value: string | null) => value is TType;
  readOnlyAttribute: string;
  registry: EventRegistry<TType>;
}) => {
  const targetSelector = `[${eventIdAttribute}][${eventTypeAttribute}]`;

  const toTarget = (element: Element | null): GridEventTarget<TType> | null => {
    if (!(element instanceof HTMLElement)) return null;

    const target = registry.resolveFromTarget(element);
    if (!target) return null;

    return {
      element: target.element,
      eventId: target.eventId,
      eventType: target.eventType,
    };
  };

  /** Read attributes only - no registration required. */
  const toUnregisteredTarget = (
    element: HTMLElement,
  ): GridEventTarget<TType> | null => {
    const eventId = element.getAttribute(eventIdAttribute);
    const eventType = element.getAttribute(eventTypeAttribute);
    if (!eventId || !isEventType(eventType)) return null;

    return { element, eventId, eventType };
  };

  /**
   * Every visible card the keyboard can land on: registered ones plus
   * read-only ones. Read-only cards deliberately stay out of the registry
   * (that absence is the drag/resize gate), but they are still focusable and
   * can open their details, so navigation has to reach them. Drafts and
   * recurring previews carry the id attributes too and are excluded - only
   * the read-only marker opts an unregistered card in.
   *
   * This is a navigation list, never an authorization one: what may be
   * mutated is decided by `getFocusedGridEventTarget` plus the read-only
   * predicate at the call site.
   */
  function listNavigable(
    root: ParentNode = document,
  ): GridEventTarget<TType>[] {
    const candidates = root.querySelectorAll(targetSelector);
    const navigable: GridEventTarget<TType>[] = [];

    for (const candidate of candidates) {
      if (!(candidate instanceof HTMLElement)) continue;
      const target =
        toTarget(candidate) ??
        (candidate.hasAttribute(readOnlyAttribute)
          ? toUnregisteredTarget(candidate)
          : null);
      if (target && isVisibleEventElement(target.element)) {
        navigable.push(target);
      }
    }

    return navigable;
  }

  /**
   * The focused card, including a read-only one. Kept separate from
   * `getFocusedGridEventTarget` on purpose: consumers that mutate an event
   * (delete, duplicate, nudge, open-for-edit) must keep asking the registry,
   * or a read-only card would become an edit target. Only navigation - which
   * merely moves focus - should reach for this.
   */
  const getFocusedNavigable = (): GridEventTarget<TType> | null => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) return null;

    const registered = toTarget(element);
    if (registered) return registered;

    // Match resolveFromTarget: focus may sit on a descendant of the card.
    const readOnlyCard = element.closest<HTMLElement>(`[${readOnlyAttribute}]`);
    return readOnlyCard ? toUnregisteredTarget(readOnlyCard) : null;
  };

  return {
    focusGridEventTarget: (target: GridEventTarget<TType>): void => {
      target.element.focus();
    },
    getFocusedNavigableGridEventTarget: getFocusedNavigable,
    getFirstNavigableGridEventTarget: (
      root: ParentNode = document,
    ): GridEventTarget<TType> | null => listNavigable(root)[0] ?? null,
    listNavigableGridEventTargets: listNavigable,
    /** Registry-backed: the gate for anything that mutates the event. */
    getFocusedGridEventTarget: (): GridEventTarget<TType> | null =>
      toTarget(document.activeElement),
  };
};

const isVisibleEventElement = (element: HTMLElement): boolean => {
  if (element.hidden || element.getAttribute("aria-hidden") === "true") {
    return false;
  }

  return element.offsetParent !== null || element.getClientRects().length > 0;
};
