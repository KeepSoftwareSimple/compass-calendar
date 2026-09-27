import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import { beforeEach, describe, expect, it } from "bun:test";

describe("showStatusToast", () => {
  const { port, mocks } = createTestToastPort();

  beforeEach(() => {
    mocks.toast.mockClear();
    mocks.update.mockClear();
    registerToastPort(port);
  });

  it("shows the message with the given toast id", () => {
    showStatusToast("task-migration", "Migrated forward");

    expect(mocks.toast).toHaveBeenCalledWith(
      "Migrated forward",
      expect.objectContaining({ toastId: "task-migration" }),
    );
  });

  it("hides the close button and progress bar", () => {
    showStatusToast("task-deleted", "Deleted");

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        closeButton: false,
        hideProgressBar: true,
      }),
    );
  });

  it("updates the deduped toast so rapid calls show the latest message", () => {
    showStatusToast("task-migration", "Migrated forward");
    showStatusToast("task-migration", "Migrated backward");

    expect(mocks.update).toHaveBeenNthCalledWith(
      2,
      "task-migration",
      expect.objectContaining({
        render: "Migrated backward",
        autoClose: expect.any(Number),
      }),
    );
  });
});
