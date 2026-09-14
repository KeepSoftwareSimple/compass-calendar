import * as posthogJs from "posthog-js";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as posthogUtil from "@web/auth/posthog/posthog.util";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { APP_VERSION } from "@web/common/constants/version.constants";
import { afterEach, describe, expect, it, mock } from "bun:test";

const init = mock();
const register = mock();

mockModuleForFile(
  "posthog-js",
  posthogJs as unknown as Record<string, unknown>,
  {
    posthog: { init, register },
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
      environment: ENV_WEB.NODE_ENV,
      version: APP_VERSION,
    });
  });
});
