import { renderHook } from "@testing-library/react";
import { usePaletteLegendCmdItems } from "@web/components/CommandPalette/hooks/usePaletteLegendCmdItems";
import { upNextAvailabilityActions } from "@web/components/Sidebar/UpNextCard/up-next.availability.store";
import { useViewStore } from "@web/events/stores/view.store";
import { APP_SHORTCUT_BINDINGS } from "@web/shortcuts/app-shortcut-bindings";
import { describe, expect, it, mock } from "bun:test";

const itemsById = () => {
  const { result } = renderHook(() => usePaletteLegendCmdItems());
  return Object.fromEntries(result.current.map((item) => [item.id, item]));
};

describe("usePaletteLegendCmdItems", () => {
  it("lists sidebar, month picker, and Up Next rows with registry keycaps", () => {
    const items = itemsById();

    expect(items["toggle-sidebar"]?.shortcut).toEqual([
      ...APP_SHORTCUT_BINDINGS.otherSidebar.keycaps,
    ]);
    expect(items["focus-month-picker"]?.shortcut).toEqual([
      ...APP_SHORTCUT_BINDINGS.focusSidebar.keycaps,
    ]);
    expect(items["open-up-next"]?.shortcut).toEqual([
      ...APP_SHORTCUT_BINDINGS.navUpNext.keycaps,
    ]);
    expect(items["join-up-next-meeting"]?.shortcut).toEqual([
      ...APP_SHORTCUT_BINDINGS.navJoinMeeting.keycaps,
    ]);
  });

  it("disables Up Next rows when the availability snapshot is empty", () => {
    const items = itemsById();

    expect(items["open-up-next"]?.disabled).toBe(true);
    expect(items["join-up-next-meeting"]?.disabled).toBe(true);
    expect(items["focus-month-picker"]?.disabled).toBe(false);
  });

  it("enables Up Next rows from the availability snapshot", () => {
    const openEventDetails = mock();
    const joinMeeting = mock();
    upNextAvailabilityActions.publish({
      hasUpNext: true,
      hasConference: true,
      openEventDetails,
      joinMeeting,
    });

    const items = itemsById();
    expect(items["open-up-next"]?.disabled).toBeFalsy();
    expect(items["join-up-next-meeting"]?.disabled).toBeFalsy();

    items["open-up-next"]?.onClick?.();
    expect(openEventDetails).toHaveBeenCalledWith("keyboardEdit");
  });

  it("disables Focus month picker when the sidebar is collapsed", () => {
    useViewStore.setState({ sidebar: { isOpen: false, preference: false } });

    const items = itemsById();
    expect(items["focus-month-picker"]?.disabled).toBe(true);
  });
});
