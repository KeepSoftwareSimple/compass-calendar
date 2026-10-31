import { create } from "zustand";
import {
  BOTTOM_NOTICE_PRIORITY,
  type BottomNoticeQueueId,
} from "@web/components/BottomNoticeStack/bottom-notice.constants";

type Registrations = Partial<Record<BottomNoticeQueueId, boolean>>;

interface BottomNoticeQueueState {
  registrations: Registrations;
  setRegistered: (id: BottomNoticeQueueId, active: boolean) => void;
  resetForTests: () => void;
}

export const useBottomNoticeQueueStore = create<BottomNoticeQueueState>(
  (set) => ({
    registrations: {},
    setRegistered: (id, active) =>
      set((state) => {
        const next = { ...state.registrations };
        if (active) {
          next[id] = true;
        } else {
          delete next[id];
        }
        return { registrations: next };
      }),
    resetForTests: () => set({ registrations: {} }),
  }),
);

export function selectActiveBottomNoticeId(
  state: BottomNoticeQueueState,
): BottomNoticeQueueId | null {
  const activeIds = (
    Object.entries(state.registrations) as [BottomNoticeQueueId, boolean][]
  )
    .filter(([, isActive]) => isActive)
    .map(([id]) => id);

  if (activeIds.length === 0) return null;

  activeIds.sort(
    (a, b) => BOTTOM_NOTICE_PRIORITY[a] - BOTTOM_NOTICE_PRIORITY[b],
  );
  return activeIds[0] ?? null;
}

export const bottomNoticeQueueActions = {
  resetForTests: () => useBottomNoticeQueueStore.getState().resetForTests(),
};
