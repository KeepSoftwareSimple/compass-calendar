import { create } from "zustand";

interface AppUpdateNoticeState {
  pendingVersion: string | null;
  setPendingVersion: (version: string | null) => void;
  dismissForSession: () => void;
  resetForTests: () => void;
}

export const useAppUpdateNoticeStore = create<AppUpdateNoticeState>((set) => ({
  pendingVersion: null,
  setPendingVersion: (version) => set({ pendingVersion: version }),
  dismissForSession: () => set({ pendingVersion: null }),
  resetForTests: () => set({ pendingVersion: null }),
}));

export const appUpdateNoticeActions = {
  setPendingVersion: (version: string) =>
    useAppUpdateNoticeStore.getState().setPendingVersion(version),
  dismissForSession: () =>
    useAppUpdateNoticeStore.getState().dismissForSession(),
  resetForTests: () => useAppUpdateNoticeStore.getState().resetForTests(),
};
