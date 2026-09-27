import { dom } from "./jsdom-env";

const { window } = dom;

class MockObserver<_T> implements IntersectionObserver, ResizeObserver {
  root!: Document | Element | null;
  rootMargin!: string;
  thresholds!: readonly number[];
  observe = (...args: unknown[]): unknown => args;
  unobserve = (...args: unknown[]): unknown => args;
  disconnect = (...args: unknown[]): unknown => args;
  takeRecords = (): IntersectionObserverEntry[] => [];
}

class MediaQuery implements MediaQueryList {
  matches = false;
  media: string;
  onchange = null;

  constructor(query: string) {
    this.media = query;
  }

  addListener(): void {}

  removeListener(): void {}

  removeEventListener(): void {}

  addEventListener(): void {}

  dispatchEvent(): boolean {
    return true;
  }
}

function getPointerEvent(mouseEvent: typeof globalThis.MouseEvent) {
  class PointerEvent extends mouseEvent implements globalThis.PointerEvent {
    altitudeAngle: number;
    azimuthAngle: number;
    height: number;
    isPrimary: boolean;
    pointerId: number;
    pointerType: string;
    pressure: number;
    tangentialPressure: number;
    tiltX: number;
    tiltY: number;
    twist: number;
    width: number;

    constructor(type: string, eventInitDict?: PointerEventInit) {
      super(type, eventInitDict);
      this.altitudeAngle = eventInitDict?.altitudeAngle ?? 0;
      this.azimuthAngle = eventInitDict?.azimuthAngle ?? 0;
      this.height = eventInitDict?.height ?? 1;
      this.isPrimary = eventInitDict?.isPrimary ?? false;
      this.pointerId = eventInitDict?.pointerId ?? 0;
      this.pointerType = eventInitDict?.pointerType ?? "";
      this.pressure = eventInitDict?.pressure ?? 0;
      this.tangentialPressure = eventInitDict?.tangentialPressure ?? 0;
      this.tiltX = eventInitDict?.tiltX ?? 0;
      this.tiltY = eventInitDict?.tiltY ?? 0;
      this.twist = eventInitDict?.twist ?? 0;
      this.width = eventInitDict?.width ?? 1;
    }

    getCoalescedEvents(): globalThis.PointerEvent[] {
      throw new Error("Method not implemented.");
    }

    getPredictedEvents(): globalThis.PointerEvent[] {
      throw new Error("Method not implemented.");
    }
  }

  return PointerEvent;
}

// Tailwind v4 emits valid browser CSS that jsdom 26 cannot parse. The web
// tests assert DOM behavior and inline layout values, so injecting the full
// generated stylesheet only adds parser noise without increasing coverage.

window.HTMLElement.prototype.scroll = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};
window.scrollTo = () => {};
window.document.elementFromPoint = () => null;
window.PointerEvent = getPointerEvent(window.MouseEvent);

// jsdom has no layout engine, so Range has neither getClientRects nor
// getBoundingClientRect (Element gets a zeroed getBoundingClientRect stub,
// but not Range). ProseMirror's cursor/coordinate math (used by TipTap-backed
// editors, e.g. DescriptionEditor) calls both on Range objects during
// arrow-key/gap-cursor handling. A zeroed rect is a safe stand-in - it's the
// same "no real layout" answer jsdom already gives for Element.
const zeroDOMRect = (): DOMRect => ({
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  toJSON: () => ({}),
});
if (!window.Element.prototype.getClientRects) {
  window.Element.prototype.getClientRects = () => [] as unknown as DOMRectList;
}
if (!window.Range.prototype.getClientRects) {
  window.Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
}
if (!window.Range.prototype.getBoundingClientRect) {
  window.Range.prototype.getBoundingClientRect = zeroDOMRect;
}

window.fetch = globalThis.fetch.bind(globalThis);
window.Blob = globalThis.Blob;
window.File = globalThis.File;
window.FormData = globalThis.FormData;
window.Event = globalThis.Event;
window.CustomEvent = globalThis.CustomEvent;
window.MouseEvent = globalThis.MouseEvent;
window.KeyboardEvent = globalThis.KeyboardEvent;
window.Headers = globalThis.Headers;
window.Request = globalThis.Request;
window.Response = globalThis.Response;
window.XMLHttpRequest = globalThis.XMLHttpRequest;
window.ArrayBuffer = globalThis.ArrayBuffer;
window.Uint8Array = globalThis.Uint8Array;
window.Uint8ClampedArray = globalThis.Uint8ClampedArray;
window.Uint16Array = globalThis.Uint16Array;
window.Uint32Array = globalThis.Uint32Array;
window.Int8Array = globalThis.Int8Array;
window.Int16Array = globalThis.Int16Array;
window.Int32Array = globalThis.Int32Array;
window.Float32Array = globalThis.Float32Array;
window.Float64Array = globalThis.Float64Array;
window.DataView = globalThis.DataView;
window.SharedArrayBuffer = globalThis.SharedArrayBuffer;
window.Atomics = globalThis.Atomics;
window.WebAssembly = globalThis.WebAssembly;

window.URL.createObjectURL = globalThis.URL.createObjectURL.bind(window.URL);
window.URL.revokeObjectURL = globalThis.URL.revokeObjectURL.bind(window.URL);

window.IntersectionObserver =
  MockObserver<IntersectionObserverCallback> as unknown as typeof IntersectionObserver;
window.ResizeObserver =
  MockObserver<ResizeObserverCallback> as unknown as typeof ResizeObserver;

for (const key of Object.getOwnPropertyNames(window)) {
  if (key in globalThis) {
    continue;
  }

  const descriptor = Object.getOwnPropertyDescriptor(window, key);

  if (descriptor) {
    try {
      Object.defineProperty(globalThis, key, descriptor);
    } catch {
      // Some properties are non-configurable in Bun's globalThis; skip them.
    }
  }
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string): MediaQueryList => new MediaQuery(query),
});

const originalGetContext = window.HTMLCanvasElement.prototype.getContext;
window.HTMLCanvasElement.prototype.getContext = function (
  this: HTMLCanvasElement,
  contextId: string,
  ...args: unknown[]
) {
  if (contextId === "2d") {
    return {
      font: "",
      measureText: (text: string) => ({ width: text.length * 7 }),
    } as unknown as CanvasRenderingContext2D;
  }

  return originalGetContext.apply(this, [contextId, ...args] as never);
};

if (typeof globalThis.structuredClone === "undefined") {
  globalThis.structuredClone = (obj: unknown) => {
    return JSON.parse(JSON.stringify(obj));
  };
}
