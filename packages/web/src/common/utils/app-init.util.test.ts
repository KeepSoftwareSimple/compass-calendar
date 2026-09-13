import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realPosthogBootstrap from "@web/auth/posthog/posthog.bootstrap";
import { DB_INIT_ERROR_TOAST_ID } from "@web/common/constants/toast.constants";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

const mockCaptureException = mock();

mockModuleForFile("@web/auth/posthog/posthog.bootstrap", realPosthogBootstrap, {
  getPosthogClient: () => ({
    captureException: mockCaptureException,
    capture: () => undefined,
    reset: () => undefined,
  }),
});

const {
  DatabaseInitError,
  initializeDatabaseWithErrorHandling,
  showDbInitErrorToast,
} = await import("./app-init.util");

describe("app-init.util", () => {
  const mockInitializeStorage = mock();
  const { port, mocks } = createTestToastPort();

  let rafCallbacks: FrameRequestCallback[];
  let rafSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    mockInitializeStorage.mockClear();
    mocks.error.mockClear();
    mocks.toast.mockClear();
    mocks.isActive.mockReturnValue(false);
    mockCaptureException.mockClear();
    registerToastPort(port);
    rafCallbacks = [];
    rafSpy = spyOn(globalThis, "requestAnimationFrame").mockImplementation(((
      callback: FrameRequestCallback,
    ) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    }) as typeof requestAnimationFrame);
  });

  afterEach(() => {
    rafSpy.mockRestore();
  });

  /** Flush both rAF frames used by `showDbInitErrorToast`. */
  const runToastAfterPaint = () => {
    const first = [...rafCallbacks];
    rafCallbacks = [];
    for (const callback of first) {
      callback(0);
    }
    const second = [...rafCallbacks];
    rafCallbacks = [];
    for (const callback of second) {
      callback(0);
    }
  };

  describe("initializeDatabaseWithErrorHandling", () => {
    it("should return null error when storage initializes successfully", async () => {
      mockInitializeStorage.mockResolvedValue(undefined);

      const result = await initializeDatabaseWithErrorHandling(
        mockInitializeStorage,
      );

      expect(result.dbInitError).toBeNull();
      expect(mockInitializeStorage).toHaveBeenCalledTimes(1);
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it("should catch DatabaseInitError and return it", async () => {
      const dbError = new DatabaseInitError("Storage quota exceeded");
      mockInitializeStorage.mockRejectedValue(dbError);

      const result = await initializeDatabaseWithErrorHandling(
        mockInitializeStorage,
      );

      expect(result.dbInitError).toBe(dbError);
      expect(result.dbInitError?.message).toBe("Storage quota exceeded");
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      expect(mockCaptureException).toHaveBeenCalledWith(dbError, {
        $exception_handled: true,
        $exception_source: "storage-init",
        storageFailure: "unavailable",
      });
    });

    it("reports a generic Error instead of swallowing it", async () => {
      const genericError = new Error("Some other error");
      mockInitializeStorage.mockRejectedValue(genericError);

      const result = await initializeDatabaseWithErrorHandling(
        mockInitializeStorage,
      );

      expect(result.dbInitError).toBeInstanceOf(DatabaseInitError);
      expect(result.dbInitError?.message).toBe(
        "local storage could not be opened",
      );
      expect(result.dbInitError?.cause).toBe(genericError);
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
    });

    it("reports a browser quota exception with safe copy", async () => {
      const quota = new DOMException("Quota exceeded", "QuotaExceededError");
      mockInitializeStorage.mockRejectedValue(quota);

      const result = await initializeDatabaseWithErrorHandling(
        mockInitializeStorage,
      );

      expect(result.dbInitError?.message).toBe("this device is out of storage");
      expect(result.dbInitError?.cause).toBe(quota);
      expect(mockCaptureException).toHaveBeenCalledWith(
        result.dbInitError,
        expect.objectContaining({
          $exception_source: "storage-init",
          storageFailure: "quota",
        }),
      );
    });

    it("reports a blocked-storage exception with safe copy", async () => {
      const blocked = new DOMException("Blocked", "SecurityError");
      mockInitializeStorage.mockRejectedValue(blocked);

      const result = await initializeDatabaseWithErrorHandling(
        mockInitializeStorage,
      );

      expect(result.dbInitError?.message).toBe(
        "the browser blocked local storage",
      );
      expect(result.dbInitError?.cause).toBe(blocked);
    });

    it("reports a non-Error rejection instead of swallowing it", async () => {
      mockInitializeStorage.mockRejectedValue("indexeddb exploded");

      const result = await initializeDatabaseWithErrorHandling(
        mockInitializeStorage,
      );

      expect(result.dbInitError).toBeInstanceOf(DatabaseInitError);
      expect(result.dbInitError?.message).toBe(
        "local storage could not be opened",
      );
      expect(result.dbInitError?.cause).toBe("indexeddb exploded");
    });

    it("should not throw when storage initialization fails", async () => {
      const dbError = new DatabaseInitError("Database version mismatch");
      mockInitializeStorage.mockRejectedValue(dbError);

      await expect(
        initializeDatabaseWithErrorHandling(mockInitializeStorage),
      ).resolves.toEqual({
        dbInitError: dbError,
      });
    });
  });

  describe("showDbInitErrorToast", () => {
    it("should show error toast with correct message after paint", () => {
      const dbError = new DatabaseInitError("Storage quota exceeded");

      showDbInitErrorToast(dbError);

      expect(mocks.error).not.toHaveBeenCalled();

      runToastAfterPaint();

      expect(mocks.error).toHaveBeenCalledWith(
        "Compass can't use offline storage right now: Storage quota exceeded. Your changes won't be saved on this device.",
        {
          autoClose: false,
          position: "bottom-right",
          toastId: DB_INIT_ERROR_TOAST_ID,
        },
      );
    });

    it("should include the error message in the toast", () => {
      const dbError = new DatabaseInitError("Database version mismatch");

      showDbInitErrorToast(dbError);
      runToastAfterPaint();

      expect(mocks.error).toHaveBeenCalledWith(
        expect.stringContaining("Database version mismatch"),
        expect.any(Object),
      );
    });

    it("should set autoClose to false so user must dismiss", () => {
      const dbError = new DatabaseInitError("Test error");

      showDbInitErrorToast(dbError);
      runToastAfterPaint();

      expect(mocks.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ autoClose: false }),
      );
    });

    it("does not stack a second init toast while one is already visible", () => {
      mocks.isActive.mockReturnValue(true);
      showDbInitErrorToast(new DatabaseInitError("Storage quota exceeded"));
      runToastAfterPaint();

      expect(mocks.error).not.toHaveBeenCalled();
    });
  });

  describe("integration", () => {
    it("should handle full initialization flow with error", async () => {
      const dbError = new DatabaseInitError(
        "Failed to initialize IndexedDB after 3 attempts",
      );
      mockInitializeStorage.mockRejectedValue(dbError);

      const { dbInitError } = await initializeDatabaseWithErrorHandling(
        mockInitializeStorage,
      );

      expect(dbInitError).not.toBeNull();

      if (dbInitError) {
        showDbInitErrorToast(dbInitError);
        runToastAfterPaint();

        expect(mocks.error).toHaveBeenCalledWith(
          "Compass can't use offline storage right now: Failed to initialize IndexedDB after 3 attempts. Your changes won't be saved on this device.",
          expect.objectContaining({
            autoClose: false,
            position: "bottom-right",
            toastId: DB_INIT_ERROR_TOAST_ID,
          }),
        );
      }
    });

    it("should handle full initialization flow without error", async () => {
      mockInitializeStorage.mockResolvedValue(undefined);

      const { dbInitError } = await initializeDatabaseWithErrorHandling(
        mockInitializeStorage,
      );

      expect(dbInitError).toBeNull();

      runToastAfterPaint();
      expect(mocks.error).not.toHaveBeenCalled();
    });
  });
});
