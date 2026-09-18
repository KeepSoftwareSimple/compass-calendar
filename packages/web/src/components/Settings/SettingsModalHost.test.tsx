import { render, screen } from "@testing-library/react";
import { act } from "react";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { rest } from "@web/__tests__/helpers/msw-rest";
import { createCompassQueryClient } from "@web/api/query-client";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { CompassRequiredProviders } from "@web/components/CompassProvider/CompassProvider";
import { settingsActions } from "@web/settings/settings.store";
import { describe, expect, it } from "bun:test";

const renderHostTree = () => {
  server.use(
    rest.get(`${ENV_WEB.API_BASEURL}/calendars`, (_req, res, ctx) =>
      res(ctx.json([])),
    ),
  );
  return render(
    <CompassRequiredProviders queryClient={createCompassQueryClient()}>
      {null}
    </CompassRequiredProviders>,
  );
};

describe("SettingsModalHost", () => {
  it("does not load Settings until it is opened", () => {
    renderHostTree();

    expect(
      screen.queryByRole("dialog", { name: "Settings" }),
    ).not.toBeInTheDocument();
  });

  it("opens Settings and focuses Accounts on the first mount", async () => {
    renderHostTree();

    act(() => {
      settingsActions.openSettings();
    });

    expect(
      await screen.findByRole("dialog", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accounts" })).toHaveFocus();
  });
});
