import {
  listMicrosoftEventLabels,
  type MicrosoftMasterCategoryApi,
} from "@sync/providers/microsoft/microsoft-master-categories";
import { describe, expect, it } from "bun:test";

class FakeMasterCategoryApi implements MicrosoftMasterCategoryApi {
  async list() {
    return [
      { displayName: "Coral", color: "preset1" },
      { displayName: "Uncolored", color: "none" },
    ];
  }
}

describe("listMicrosoftEventLabels", () => {
  it("maps master category presets to event label hex values", async () => {
    const labels = await listMicrosoftEventLabels(
      "token",
      () => new FakeMasterCategoryApi(),
    );

    expect(labels).toEqual([{ id: "Coral", hex: "#E8825D" }]);
  });
});
