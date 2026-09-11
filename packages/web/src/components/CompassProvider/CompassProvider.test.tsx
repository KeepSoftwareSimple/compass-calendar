import { HotkeyManager } from "@tanstack/react-hotkeys";
import { useQueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import { createCompassQueryClient } from "@web/api/query-client";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import { CompassRequiredProviders } from "./CompassProvider";
import { beforeEach, expect, test } from "bun:test";

beforeEach(() => {
  HotkeyManager.resetInstance();
  document.body.removeAttribute("data-app-locked");
});

test("provides the injected query client", () => {
  server.use(
    http.get(`${ENV_WEB.API_BASEURL}/config`, () => HttpResponse.json({ version: "dev", google: { isConfigured: false } })),
  );
  const queryClient = createCompassQueryClient();

  function Probe() {
    const observedClient = useQueryClient();
    return (
      <output aria-label="query client match">
        {String(observedClient === queryClient)}
      </output>
    );
  }

  render(
    <CompassRequiredProviders queryClient={queryClient}>
      <Probe />
    </CompassRequiredProviders>,
  );

  expect(screen.getByLabelText("query client match")).toHaveTextContent("true");
});

test("Escape dismisses the toast (proves the hook is actually mounted)", () => {
  server.use(
    http.get(`${ENV_WEB.API_BASEURL}/config`, () => HttpResponse.json({ version: "dev", google: { isConfigured: false } })),
  );
  const { port, mocks } = createTestToastPort();
  registerToastPort(port);

  render(<CompassRequiredProviders>{null}</CompassRequiredProviders>);
  pressKey("Escape");

  expect(mocks.dismiss).toHaveBeenCalledTimes(1);
});
