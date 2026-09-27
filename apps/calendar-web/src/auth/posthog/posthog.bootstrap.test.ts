import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as posthogUtil from "@web/auth/posthog/posthog.util";
import { resolvePosthogEnvironment } from "@web/auth/posthog/posthog-environment.util";
import { APP_VERSION } from "@web/common/constants/version.constants";
import { afterEach, describe, expect, it, mock } from "bun:test";

const init = mock();
const register = mock();

// Stub the SDK namespace instead of importing `posthog-js`. Loading the real
// module wraps XMLHttpRequest and collides with SuperTokens in `bun test:web`.
const posthogJsStub = {
  posthog: { init, register },
};

mockModuleForFile(
  "posthog-js",
  posthogJsStub as unknown as Record<string, unknown>,
  {
    posthog: posthogJsStub.posthog,
  },
);

mockModuleForFile("@web/auth/posthog/posthog.util", posthogUtil, {
  isPosthogEnabled: () => true,
});

const { initPosthog, resetPosthogClientForTests } = await import(
  "./posthog.bootstrap"
);

afterEach(() => {
  resetPosthogClientForTests();
  init.mockClear();
  register.mockClear();
});

describe("initPosthog", () => {
  it("registers environment and version super properties", () => {
    initPosthog();

    expect(register).toHaveBeenCalledWith({
      environment: resolvePosthogEnvironment(),
      version: APP_VERSION,
    });
  });
});
