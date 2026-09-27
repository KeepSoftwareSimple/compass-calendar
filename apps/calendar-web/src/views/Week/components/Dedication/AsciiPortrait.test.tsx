import { render } from "@testing-library/react";
import { AsciiPortrait } from "./AsciiPortrait";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

// Records every <img> the component constructs. The real loader would hit
// the network the moment `src` is assigned, which is exactly what must not
// happen while the dedication dialog is still closed.
class FakeImage {
  static instances: FakeImage[] = [];
  src = "";
  complete = false;
  naturalWidth = 0;
  width = 0;
  height = 0;
  onload: (() => void) | null = null;
  constructor() {
    FakeImage.instances.push(this);
  }
}

// The shared test polyfill never invokes its callback; this one hands it
// back so a test can play the "dialog just opened" resize.
let resizeCallback: ResizeObserverCallback | null = null;
class FakeResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeCallback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

// jsdom has no 2D canvas. The component only needs a context to exist on
// mount (it resolves theme colors through a 1x1 probe); drawing happens after
// the image loads, which these tests never do.
const fakeContext = {
  fillRect: () => {},
  getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) }),
} as unknown as CanvasRenderingContext2D;

describe("AsciiPortrait", () => {
  const originalImage = globalThis.Image;
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    FakeImage.instances = [];
    resizeCallback = null;
    globalThis.Image = FakeImage as unknown as typeof Image;
    globalThis.ResizeObserver =
      FakeResizeObserver as unknown as typeof ResizeObserver;
    HTMLCanvasElement.prototype.getContext = (() =>
      fakeContext) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  afterEach(() => {
    globalThis.Image = originalImage;
    globalThis.ResizeObserver = originalResizeObserver;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  it("does not fetch the portrait while its container has no size", () => {
    render(<AsciiPortrait src="derek.png" alt="Headshot of Derek" />);

    expect(FakeImage.instances).toHaveLength(1);
    expect(FakeImage.instances[0]?.src).toBe("");
    expect(resizeCallback).not.toBeNull();
  });

  it("starts the fetch the first time the container is laid out", () => {
    const { getByRole } = render(
      <AsciiPortrait src="derek.png" alt="Headshot of Derek" />,
    );
    const container = getByRole("img", { name: "Headshot of Derek" });
    Object.defineProperty(container, "clientWidth", { value: 240 });
    Object.defineProperty(container, "clientHeight", { value: 240 });

    resizeCallback?.([], {} as ResizeObserver);

    expect(FakeImage.instances[0]?.src).toBe("derek.png");
  });
});
