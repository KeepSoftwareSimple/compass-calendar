import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { EVENT_DELETED_TOAST_ID } from "@web/common/constants/toast.constants";
import { showRestoredToast } from "@web/common/utils/toast/deleted-toast.util";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import { beforeEach, describe, expect, it } from "bun:test";

describe("showRestoredToast", () => {
  const { port, mocks } = createTestToastPort();

  beforeEach(() => {
    mocks.toast.mockClear();
    mocks.update.mockClear();
    registerToastPort(port);
  });

  it('updates the "Deleted" toast in place to "Restored"', () => {
    showRestoredToast();

    expect(mocks.update).toHaveBeenCalledWith(
      EVENT_DELETED_TOAST_ID,
      expect.objectContaining({
        render: "Restored",
        autoClose: expect.any(Number),
      }),
    );
  });

  it("never creates a new toast, so it's a no-op once the toast is gone", () => {
    showRestoredToast();

    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
