import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realUsesession from "@web/auth/compass/session/useSession";
import { createTasksRemovalNotice } from "./TasksRemovalNotice";
import { beforeEach, describe, expect, it, mock } from "bun:test";

// useSession is an auth hook with no injection seam of its own, so it's
// mock.module'd; everything else this component depends on is a plain
// function, injected via createTasksRemovalNotice below — no mock.module,
// no cache-busting.
const mockUseSession = mock();
mockModuleForFile("@web/auth/compass/session/useSession", realUsesession, {
  useSession: mockUseSession,
});

describe("TasksRemovalNotice", () => {
  const mockUseTasksRemovalNotice = mock();
  const mockRunExportMyData = mock();
  const mockShowStatusToast = mock();
  const mockShowErrorToast = mock();

  const buildComponent = () =>
    createTasksRemovalNotice({
      useTasksRemovalNotice: mockUseTasksRemovalNotice,
      runExportMyData: mockRunExportMyData,
      showStatusToast: mockShowStatusToast,
      showErrorToast: mockShowErrorToast,
    });

  beforeEach(() => {
    mockUseSession.mockClear();
    mockUseTasksRemovalNotice.mockClear();
    mockRunExportMyData.mockClear();
    mockShowStatusToast.mockClear();
    mockShowErrorToast.mockClear();

    mockUseSession.mockReturnValue({ authenticated: true });
    mockUseTasksRemovalNotice.mockReturnValue({
      visible: true,
      dismiss: mock(),
    });
    mockRunExportMyData.mockResolvedValue(undefined);
  });

  it("renders nothing when not visible", () => {
    mockUseTasksRemovalNotice.mockReturnValue({
      visible: false,
      dismiss: mock(),
    });
    const TasksRemovalNotice = buildComponent();

    const { container } = render(<TasksRemovalNotice />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when visible but not authenticated", () => {
    mockUseSession.mockReturnValue({ authenticated: false });
    const TasksRemovalNotice = buildComponent();

    const { container } = render(<TasksRemovalNotice />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders the card with the export CTA and a dismiss control", () => {
    const TasksRemovalNotice = buildComponent();

    render(<TasksRemovalNotice />);

    expect(screen.getByRole("button", { name: "Export my data" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
  });

  it("calls dismiss when the dismiss control is clicked", () => {
    const mockDismiss = mock();
    mockUseTasksRemovalNotice.mockReturnValue({
      visible: true,
      dismiss: mockDismiss,
    });
    const TasksRemovalNotice = buildComponent();

    render(<TasksRemovalNotice />);
    screen.getByRole("button", { name: "Dismiss" }).click();

    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });

  it("exports, shows a success toast, and dismisses the card on a successful export", async () => {
    const mockDismiss = mock();
    mockUseTasksRemovalNotice.mockReturnValue({
      visible: true,
      dismiss: mockDismiss,
    });
    const TasksRemovalNotice = buildComponent();

    render(<TasksRemovalNotice />);
    await act(async () => {
      screen.getByRole("button", { name: "Export my data" }).click();
    });

    await waitFor(() => {
      expect(mockShowStatusToast).toHaveBeenCalledWith(
        "export-my-data",
        "Data exported",
      );
    });

    expect(mockRunExportMyData).toHaveBeenCalledTimes(1);
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    expect(mockShowErrorToast).not.toHaveBeenCalled();
  });

  it("ignores a second click while an export is already in flight", async () => {
    let resolveExport: () => void = () => {};
    mockRunExportMyData.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveExport = resolve;
      }),
    );
    const TasksRemovalNotice = buildComponent();

    render(<TasksRemovalNotice />);
    const exportButton = screen.getByRole("button", { name: "Export my data" });

    act(() => {
      exportButton.click();
      exportButton.click();
    });

    expect(mockRunExportMyData).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveExport();
    });
  });

  it("shows an error toast and keeps the card visible when the export fails", async () => {
    mockRunExportMyData.mockRejectedValue(new Error("dexie is closed"));
    const mockDismiss = mock();
    mockUseTasksRemovalNotice.mockReturnValue({
      visible: true,
      dismiss: mockDismiss,
    });
    const TasksRemovalNotice = buildComponent();

    render(<TasksRemovalNotice />);
    await act(async () => {
      screen.getByRole("button", { name: "Export my data" }).click();
    });

    await waitFor(() => {
      expect(mockShowErrorToast).toHaveBeenCalledWith(
        "Couldn't export your data. Please try again.",
        { toastId: "export-my-data" },
      );
    });

    expect(mockDismiss).not.toHaveBeenCalled();
    expect(screen.getByText("Couldn't export your data.")).toBeTruthy();
  });
});
