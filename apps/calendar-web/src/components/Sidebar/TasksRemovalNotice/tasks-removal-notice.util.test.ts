import {
  hasDismissedTasksRemovalNotice,
  markTasksRemovalNoticeDismissed,
} from "./tasks-removal-notice.util";
import { beforeEach, describe, expect, it } from "bun:test";

describe("tasks-removal-notice.util", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("is not dismissed until markTasksRemovalNoticeDismissed is called", () => {
    expect(hasDismissedTasksRemovalNotice()).toBe(false);

    markTasksRemovalNoticeDismissed();

    expect(hasDismissedTasksRemovalNotice()).toBe(true);
  });
});
