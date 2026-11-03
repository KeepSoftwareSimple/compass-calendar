import { type Id, type ToastContent, type ToastOptions } from "react-toastify";
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { IS_DEV } from "@web/common/constants/env.constants";

type QueuedBottomNoticeToast = {
  content: ToastContent;
  options?: ToastOptions;
};

export type BottomNoticeStackGateState = {
  suppressed: boolean;
  queue: QueuedBottomNoticeToast[];
};

export const initialBottomNoticeStackGateState: BottomNoticeStackGateState = {
  suppressed: false,
  queue: [],
};

export const useBottomNoticeStackGateStore =
  create<BottomNoticeStackGateState>()(
    devtools(() => ({ ...initialBottomNoticeStackGateState }), {
      enabled: IS_DEV,
      name: "BottomNoticeStackGateStore",
    }),
  );

export const selectBottomNoticeStackSuppressed = (
  state: BottomNoticeStackGateState,
): boolean => state.suppressed;

export const bottomNoticeStackGateActions = {
  setSuppressed(suppressed: boolean) {
    useBottomNoticeStackGateStore.setState((state) => {
      if (state.suppressed === suppressed) return state;
      return { ...state, suppressed };
    });
  },
  enqueue(toast: QueuedBottomNoticeToast) {
    useBottomNoticeStackGateStore.setState((state) => ({
      ...state,
      queue: [...state.queue, toast],
    }));
  },
  takeQueue(): QueuedBottomNoticeToast[] {
    const queue = useBottomNoticeStackGateStore.getState().queue;
    useBottomNoticeStackGateStore.setState((state) => ({
      ...state,
      queue: [],
    }));
    return queue;
  },
  resetForTests() {
    useBottomNoticeStackGateStore.setState(
      initialBottomNoticeStackGateState,
      true,
    );
  },
};

export function queuedBottomNoticeToastId(options?: ToastOptions): Id {
  return (options?.toastId ?? `queued-bottom-notice-${Date.now()}`) as Id;
}
