import { useCallback, useEffect, useState } from "react";
import { type OfflineDataStore } from "@web/common/storage/offline-data/offline-data.store";
import {
  ensureOfflineDataStoreReady,
  getOfflineDataStore,
} from "@web/common/storage/offline-data/offline-data.store.registry";
import {
  hasDismissedTasksRemovalNotice,
  markTasksRemovalNoticeDismissed,
} from "./tasks-removal-notice.util";

type TasksRemovalNoticeStorage = Pick<OfflineDataStore, "getTaskCount">;

type TasksRemovalNoticeDependencies = {
  ensureOfflineDataStoreReady: typeof ensureOfflineDataStoreReady;
  getOfflineDataStore: () => TasksRemovalNoticeStorage;
  hasDismissedTasksRemovalNotice: typeof hasDismissedTasksRemovalNotice;
  markTasksRemovalNoticeDismissed: typeof markTasksRemovalNoticeDismissed;
};

interface TasksRemovalNoticeState {
  visible: boolean;
  dismiss: () => void;
}

export function createUseTasksRemovalNotice({
  ensureOfflineDataStoreReady,
  getOfflineDataStore,
  hasDismissedTasksRemovalNotice,
  markTasksRemovalNoticeDismissed,
}: TasksRemovalNoticeDependencies) {
  return function useTasksRemovalNotice(): TasksRemovalNoticeState {
    const [dismissed, setDismissed] = useState(hasDismissedTasksRemovalNotice);
    const [taskCount, setTaskCount] = useState(0);

    useEffect(() => {
      if (dismissed) return;

      let cancelled = false;

      ensureOfflineDataStoreReady()
        .then(() => getOfflineDataStore().getTaskCount())
        .then((count) => {
          if (!cancelled) setTaskCount(count);
        })
        .catch(() => {
          // Fail closed: if the count check itself breaks, don't show a
          // notice that can't reliably know whether there's data to export.
          if (!cancelled) setTaskCount(0);
        });

      return () => {
        cancelled = true;
      };
    }, [dismissed]);

    const dismiss = useCallback(() => {
      // Mark dismissed before flipping state, mirroring markWelcomeSeen() in
      // WelcomeModal — no flash between the click and the card disappearing.
      markTasksRemovalNoticeDismissed();
      setDismissed(true);
    }, []);

    return { visible: !dismissed && taskCount > 0, dismiss };
  };
}

export const useTasksRemovalNotice = createUseTasksRemovalNotice({
  ensureOfflineDataStoreReady,
  getOfflineDataStore,
  hasDismissedTasksRemovalNotice,
  markTasksRemovalNoticeDismissed,
});
