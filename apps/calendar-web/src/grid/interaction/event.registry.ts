export interface RegisteredEventTarget<TType extends string> {
  element: HTMLElement;
  eventId: string;
  eventType: TType;
}

export interface EventRegistry<TType extends string> {
  clear(): void;
  register(registration: RegisteredEventTarget<TType>): () => void;
  resolve(eventId: string, eventType: TType): HTMLElement | null;
  resolveFromTarget(
    target: EventTarget | null,
  ): RegisteredEventTarget<TType> | null;
}

export interface EventRegistryOptions<TType extends string> {
  eventIdAttribute: string;
  eventTypeAttribute: string;
  isEventType: (value: string | null) => value is TType;
}

export const createEventRegistry = <TType extends string>({
  eventIdAttribute,
  eventTypeAttribute,
  isEventType,
}: EventRegistryOptions<TType>): EventRegistry<TType> => {
  const events = new Map<string, RegisteredEventTarget<TType>>();
  const getRegistryKey = (eventId: string, eventType: TType) =>
    `${eventType}:${eventId}`;

  const isRegistrationCurrent = ({
    element,
    eventId,
    eventType,
  }: RegisteredEventTarget<TType>) =>
    element.isConnected &&
    element.getAttribute(eventIdAttribute) === eventId &&
    element.getAttribute(eventTypeAttribute) === eventType;

  const resolve = (eventId: string, eventType: TType) => {
    const key = getRegistryKey(eventId, eventType);
    const registration = events.get(key);

    if (!registration) {
      return null;
    }

    if (!isRegistrationCurrent(registration)) {
      events.delete(key);
      return null;
    }

    return registration.element;
  };

  return {
    clear: () => events.clear(),
    register: ({ element, eventId, eventType }) => {
      element.setAttribute(eventIdAttribute, eventId);
      element.setAttribute(eventTypeAttribute, eventType);

      const key = getRegistryKey(eventId, eventType);

      events.set(key, {
        element,
        eventId,
        eventType,
      });

      return () => {
        const current = events.get(key);

        if (current?.element === element) {
          events.delete(key);
        }
      };
    },
    resolve,
    resolveFromTarget: (target) => {
      if (!(target instanceof Element)) {
        return null;
      }

      const element = target.closest<HTMLElement>(
        `[${eventIdAttribute}][${eventTypeAttribute}]`,
      );

      if (!element) {
        return null;
      }

      const eventId = element.getAttribute(eventIdAttribute);
      const eventType = element.getAttribute(eventTypeAttribute);

      if (!eventId || !isEventType(eventType)) {
        return null;
      }

      const registeredElement = resolve(eventId, eventType);

      if (registeredElement !== element) {
        return null;
      }

      return {
        element: registeredElement,
        eventId,
        eventType,
      };
    },
  };
};
