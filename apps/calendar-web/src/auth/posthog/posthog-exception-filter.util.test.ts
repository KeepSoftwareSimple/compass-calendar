import { type CaptureResult } from "posthog-js";
import { filterPosthogBeforeSend } from "./posthog-exception-filter.util";
import { describe, expect, it } from "bun:test";

const exceptionEvent = (
  entries: Array<{
    type?: string;
    value?: string;
    stacktrace?: { frames?: Array<Record<string, unknown>> };
  }>,
): CaptureResult =>
  ({
    uuid: "test-uuid",
    event: "$exception",
    properties: {
      $exception_list: entries,
    },
  }) as CaptureResult;

describe("filterPosthogBeforeSend", () => {
  it("passes through non-exception events", () => {
    const event = {
      uuid: "1",
      event: "$pageview",
      properties: {},
    } as CaptureResult;
    expect(filterPosthogBeforeSend(event)).toBe(event);
  });

  it("drops Chrome Failed to fetch TypeErrors", () => {
    expect(
      filterPosthogBeforeSend(
        exceptionEvent([{ type: "TypeError", value: "Failed to fetch" }]),
      ),
    ).toBeNull();
  });

  it("drops Firefox NetworkError TypeErrors", () => {
    expect(
      filterPosthogBeforeSend(
        exceptionEvent([
          {
            type: "TypeError",
            value: "NetworkError when attempting to fetch resource.",
          },
        ]),
      ),
    ).toBeNull();
  });

  it("drops the CefSharp scanner signature", () => {
    expect(
      filterPosthogBeforeSend(
        exceptionEvent([
          {
            type: "Error",
            value:
              "Object Not Found Matching Id:1, MethodName:update, ParamCount:4",
          },
        ]),
      ),
    ).toBeNull();
  });

  // The shape production actually sends: posthog-js wraps a non-Error
  // rejection value in its own prefix before before_send sees it. Asserting
  // the bare string alone let an anchored pattern pass here and never match
  // a real payload.
  it("drops the CefSharp scanner signature as posthog-js wraps it", () => {
    expect(
      filterPosthogBeforeSend(
        exceptionEvent([
          {
            type: "UnhandledRejection",
            value:
              "Non-Error promise rejection captured with value: Object Not Found Matching Id:4, MethodName:update, ParamCount:4",
          },
        ]),
      ),
    ).toBeNull();
  });

  it("drops the CefSharp scanner signature regardless of the scan id", () => {
    expect(
      filterPosthogBeforeSend(
        exceptionEvent([
          {
            type: "Error",
            value:
              "Object Not Found Matching Id:2, MethodName:update, ParamCount:4",
          },
        ]),
      ),
    ).toBeNull();
  });

  it("drops a primitive-wrapped ResizeObserver warning", () => {
    expect(
      filterPosthogBeforeSend(
        exceptionEvent([
          {
            type: "UnhandledRejection",
            value:
              "Primitive value captured as exception: ResizeObserver loop limit exceeded",
          },
        ]),
      ),
    ).toBeNull();
  });

  it("keeps a wrapped rejection that carries app stack frames", () => {
    const event = exceptionEvent([
      {
        type: "UnhandledRejection",
        value: "Non-Error promise rejection captured with value: Script error.",
        stacktrace: { frames: [{ filename: "/index.js", function: "boot" }] },
      },
    ]);
    expect(filterPosthogBeforeSend(event)).toBe(event);
  });

  it("drops opaque browser Script error. with no stack frames", () => {
    expect(
      filterPosthogBeforeSend(
        exceptionEvent([{ type: "Error", value: "Script error." }]),
      ),
    ).toBeNull();
  });

  it("drops the ResizeObserver loop completed browser warning", () => {
    expect(
      filterPosthogBeforeSend(
        exceptionEvent([
          {
            type: "Error",
            value:
              "ResizeObserver loop completed with undelivered notifications.",
          },
        ]),
      ),
    ).toBeNull();
  });

  it("drops the Firefox ResizeObserver loop limit exceeded variant", () => {
    expect(
      filterPosthogBeforeSend(
        exceptionEvent([
          { type: "Error", value: "ResizeObserver loop limit exceeded" },
        ]),
      ),
    ).toBeNull();
  });

  it("keeps Script error. when stack frames are present", () => {
    const event = exceptionEvent([
      {
        type: "Error",
        value: "Script error.",
        stacktrace: {
          frames: [{ filename: "/index.js", function: "boot" }],
        },
      },
    ]);
    expect(filterPosthogBeforeSend(event)).toBe(event);
  });

  it("keeps ApiError exceptions", () => {
    const event = exceptionEvent([
      { type: "ApiError", value: "Request failed with status 500" },
    ]);
    expect(filterPosthogBeforeSend(event)).toBe(event);
  });

  it("keeps other TypeErrors", () => {
    const event = exceptionEvent([
      { type: "TypeError", value: "Cannot read properties of undefined" },
    ]);
    expect(filterPosthogBeforeSend(event)).toBe(event);
  });

  it("reads $exception_types / $exception_values when list is absent", () => {
    expect(
      filterPosthogBeforeSend({
        uuid: "1",
        event: "$exception",
        properties: {
          $exception_types: ["TypeError"],
          $exception_values: ["Failed to fetch"],
        },
      } as CaptureResult),
    ).toBeNull();
  });

  it("keeps mixed exception lists that include a real error", () => {
    const event = exceptionEvent([
      { type: "TypeError", value: "Failed to fetch" },
      { type: "ApiError", value: "Request failed with status 500" },
    ]);
    expect(filterPosthogBeforeSend(event)).toBe(event);
  });
});
