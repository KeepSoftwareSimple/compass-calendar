import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { IS_DEV } from "@web/common/constants/env.constants";
import { type UpNextOpenActivity } from "@web/components/Sidebar/UpNextCard/up-next.availability.store";

type UpNextNudgeUiState = {
  isPickerOpen: boolean;
  openActivity: UpNextOpenActivity | null;
};

export const useUpNextNudgeUiStore = create<UpNextNudgeUiState>()(
  devtools(
    () => ({
      isPickerOpen: false,
      openActivity: null,
    }),
    { name: "compass/up-next-nudge-ui", enabled: IS_DEV },
  ),
);

export const upNextNudgeUiActions = {
  showPicker: (activity: UpNextOpenActivity) =>
    useUpNextNudgeUiStore.setState(
      { isPickerOpen: true, openActivity: activity },
      false,
      { type: "showPicker" },
    ),
  closePicker: () =>
    useUpNextNudgeUiStore.setState(
      { isPickerOpen: false, openActivity: null },
      false,
      { type: "closePicker" },
    ),
  reset: () =>
    useUpNextNudgeUiStore.setState(
      { isPickerOpen: false, openActivity: null },
      true,
      { type: "reset" },
    ),
};
