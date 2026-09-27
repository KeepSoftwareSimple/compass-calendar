import { JSDOM } from "jsdom";
import { inspect } from "node:util";

export const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});

const { window } = dom;

globalThis.window = window as unknown as Window & typeof globalThis;
globalThis.document = window.document;
globalThis.navigator = window.navigator;
globalThis.location = window.location;
globalThis.history = window.history;
globalThis.localStorage = window.localStorage;
globalThis.sessionStorage = window.sessionStorage;
globalThis.HTMLElement = window.HTMLElement;
Object.defineProperty(window, "HTMLIFrameElement", {
  configurable: true,
  value: window.HTMLElement,
  writable: true,
});
globalThis.HTMLIFrameElement = window.HTMLIFrameElement;
globalThis.HTMLAnchorElement = window.HTMLAnchorElement;
globalThis.Node = window.Node;

// Bun's native globalThis.dispatchEvent/addEventListener operate on Bun's own
// Event realm. Dexie constructs `new CustomEvent(...)` against the jsdom
// Event class above, so dispatching through Bun's native EventTarget throws
// "must be an instance of Event" (cross-realm brand check). Rebind these to
// jsdom's window so the whole event pipeline stays in one realm.
globalThis.dispatchEvent = window.dispatchEvent.bind(window);
globalThis.addEventListener = window.addEventListener.bind(window);
globalThis.removeEventListener = window.removeEventListener.bind(window);
globalThis.self = window;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const noopAlert = () => {};
window.alert = noopAlert;
globalThis.alert = noopAlert;

// Bun/util.inspect walks jsdom Window/Event graphs by default (event
// listeners → document → SymbolTree → …), which can dump megabytes into
// failing-test diffs and console.error output. Keep a short label instead.
const inspectCustom = inspect.custom;

Object.defineProperty(window, inspectCustom, {
  configurable: true,
  value() {
    return "Window [jsdom]";
  },
});
Object.defineProperty(window.document, inspectCustom, {
  configurable: true,
  value() {
    return "Document [jsdom]";
  },
});
Object.defineProperty(window.Node.prototype, inspectCustom, {
  configurable: true,
  value(this: Node) {
    const name = this.nodeName?.toLowerCase?.() ?? "node";
    const id = this instanceof window.Element && this.id ? `#${this.id}` : "";
    return `${name}${id} [jsdom]`;
  },
});
Object.defineProperty(window.Event.prototype, inspectCustom, {
  configurable: true,
  value(this: Event) {
    return `${this.constructor?.name ?? "Event"}(${this.type}) [jsdom]`;
  },
});

// Bun's expect() diffs do not honor util.inspect.custom. They walk
// Event[Symbol(impl)]._globalObject into the full Window graph. Replace that
// field with a Proxy that still forwards gets for jsdom, but exposes no own
// keys for Bun's property enumerator.
function redactEventImplGlobalObject(event: Event) {
  const implSym = Object.getOwnPropertySymbols(event).find(
    (symbol) => String(symbol) === "Symbol(impl)",
  );
  if (!implSym) return;

  const impl = (event as unknown as Record<symbol, Record<string, unknown>>)[
    implSym
  ];
  const globalObject = impl?._globalObject;
  if (!globalObject || typeof globalObject !== "object") return;

  const stub = new Proxy(globalObject, {
    ownKeys() {
      return [];
    },
    getOwnPropertyDescriptor() {
      return undefined;
    },
    get(target, prop, receiver) {
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      return Reflect.has(target, prop);
    },
  });

  Object.defineProperty(impl, "_globalObject", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: stub,
  });
}

const EVENT_CONSTRUCTOR_NAMES = [
  "Event",
  "CustomEvent",
  "KeyboardEvent",
  "MouseEvent",
  "PointerEvent",
  "FocusEvent",
  "StorageEvent",
  "InputEvent",
  "WheelEvent",
  "UIEvent",
  "CompositionEvent",
  "DragEvent",
  "ClipboardEvent",
  "SubmitEvent",
  "MessageEvent",
  "ErrorEvent",
  "ProgressEvent",
] as const;

type EventConstructor = new (...args: never[]) => Event;

for (const name of EVENT_CONSTRUCTOR_NAMES) {
  const Original = window[name as keyof Window];
  if (typeof Original !== "function") continue;
  const OriginalCtor = Original as EventConstructor;

  const Redacted = function RedactedEvent(
    this: unknown,
    ...args: unknown[]
  ): Event {
    const event = Reflect.construct(OriginalCtor, args, new.target ?? Redacted);
    redactEventImplGlobalObject(event as Event);
    return event as Event;
  };

  Redacted.prototype = OriginalCtor.prototype;
  Object.defineProperty(Redacted, "name", { value: name });
  Object.setPrototypeOf(Redacted, OriginalCtor);

  Object.defineProperty(window, name, {
    configurable: true,
    writable: true,
    value: Redacted,
  });
  (globalThis as Record<string, unknown>)[name] = Redacted;
}
