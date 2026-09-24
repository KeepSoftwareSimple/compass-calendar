import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realPosthogBootstrap from "@web/auth/posthog/posthog.bootstrap";
import * as realBrowserNavigationUtil from "@web/common/utils/browser/browser-navigation.util";
import { ErrorBoundary } from "@web/components/ErrorBoundary/ErrorBoundary";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

const mockCaptureException = mock();
const mockReload = mock();

// The boundary reports through the PostHog singleton (no hook), so stub the
// bootstrap accessor to observe the report without initializing PostHog.
// `capture` is a no-op here (not a mock) so a `track()` call elsewhere in the
// same test run - the module registration is process-global - doesn't crash
// on a stubbed client shaped only for captureException.
mockModuleForFile("@web/auth/posthog/posthog.bootstrap", realPosthogBootstrap, {
  getPosthogClient: () => ({
    captureException: mockCaptureException,
    capture: () => undefined,
    reset: () => undefined,
  }),
});

mockModuleForFile(
  "@web/common/utils/browser/browser-navigation.util",
  realBrowserNavigationUtil,
  {
    reloadLocation: mockReload,
  },
);

const Boom = () => {
  throw new Error("render exploded");
};

describe("ErrorBoundary", () => {
  // React logs the caught error to console.error; silence it so the suite
  // output stays readable.
  let consoleError: ReturnType<typeof spyOn>;

  beforeEach(() => {
    mockCaptureException.mockClear();
    mockReload.mockClear();
    consoleError = spyOn(console, "error").mockImplementation(() => {});
    sessionStorage.clear();
  });

  afterEach(() => {
    consoleError.mockRestore();
    sessionStorage.clear();
  });

  it("renders the recovery surface instead of a blank page when a child throws", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(
      screen.getByRole("button", { name: /reload the app/i }),
    ).toBeInTheDocument();
  });

  it("reports the caught error to PostHog", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [error, properties] = mockCaptureException.mock.calls[0];
    expect((error as Error).message).toBe("render exploded");
    expect(properties).toMatchObject({
      $exception_source: "react-error-boundary",
    });
  });

  it("normalizes a thrown undefined into a real Error for PostHog", () => {
    const BoomUndefined = () => {
      throw undefined;
    };

    render(
      <ErrorBoundary>
        <BoomUndefined />
      </ErrorBoundary>,
    );

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [error] = mockCaptureException.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Non-Error render throw: undefined");
    expect(
      screen.getByRole("button", { name: /reload the app/i }),
    ).toBeInTheDocument();
  });

  it("reloads the app when the recovery button is clicked", async () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /reload the app/i }));

    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it("reloads once instead of the error screen when a deploy removed a chunk", () => {
    const MissingChunk = () => {
      throw new TypeError(
        "Failed to fetch dynamically imported module: https://compasscalendar.com/chunk-w3x1et3v.js",
      );
    };

    render(
      <ErrorBoundary>
        <MissingChunk />
      </ErrorBoundary>,
    );

    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /reload the app/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the error screen and reports when the chunk is still missing after the reload", () => {
    const MissingChunk = () => {
      throw new TypeError(
        "Failed to fetch dynamically imported module: https://compasscalendar.com/chunk-w3x1et3v.js",
      );
    };
    const first = render(
      <ErrorBoundary>
        <MissingChunk />
      </ErrorBoundary>,
    );
    first.unmount();

    render(
      <ErrorBoundary>
        <MissingChunk />
      </ErrorBoundary>,
    );

    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: /reload the app/i }),
    ).toBeInTheDocument();
  });

  it("renders children untouched when nothing throws", () => {
    render(
      <ErrorBoundary>
        <span>all good</span>
      </ErrorBoundary>,
    );

    expect(screen.getByText("all good")).toBeInTheDocument();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});
