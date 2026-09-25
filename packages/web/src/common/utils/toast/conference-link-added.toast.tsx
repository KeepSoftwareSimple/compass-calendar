import { createElement, useState } from "react";
import { type Conference } from "@core/types/event-attendance.contracts";
import {
  CONFERENCE_LINK_ADDED_TOAST_ID,
  getToastDefaultOptions,
} from "@web/common/constants/toast.constants";
import { copyText } from "@web/common/utils/clipboard/clipboard.util";
import { ToastActionButton } from "@web/common/utils/toast/ToastActionButton";
import { ToastNotice } from "@web/common/utils/toast/ToastNotice";
import { getToast } from "@web/common/utils/toast/toast.port";
import { COPY_LINK_SHORTCUT_KEY } from "@web/shortcuts/notice-focus/useNoticeActionShortcut";
import { swallowNextKeyup } from "@web/shortcuts/swallow-next-keyup";

type CopyState = "idle" | "copied" | "failed";

const COPY_FAILED_MESSAGE = "Could not copy. Open the event to copy the link.";

/**
 * Shown right after a create that asked the provider for a meeting link, so
 * the minted URL is one keypress away without reopening the event. The copy
 * runs inside the click handler because Safari drops the clipboard
 * permission once a handler awaits.
 */
export const ConferenceLinkAddedToast = ({
  conference,
}: {
  conference: Conference;
}) => {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const handleCopy = () => {
    // Bare `l` is also the Life view, which is bound on keyup; the click
    // path has no release to swallow, and the extra listener is harmless.
    swallowNextKeyup(COPY_LINK_SHORTCUT_KEY);
    void copyText(conference.url).then((didCopy) => {
      setCopyState(didCopy ? "copied" : "failed");
    });
  };

  if (copyState === "copied") {
    return <p className="text-sm text-text">Link copied</p>;
  }

  return (
    <ToastNotice>
      <p className="text-sm text-text">
        {copyState === "failed"
          ? COPY_FAILED_MESSAGE
          : `${conference.label ?? "Meeting"} link added`}
      </p>
      {copyState === "idle" && (
        <ToastActionButton
          onClick={handleCopy}
          shortcutKey={COPY_LINK_SHORTCUT_KEY}
        >
          Copy link
        </ToastActionButton>
      )}
    </ToastNotice>
  );
};

export function showConferenceLinkAddedToast(conference: Conference): void {
  getToast()(createElement(ConferenceLinkAddedToast, { conference }), {
    ...getToastDefaultOptions(),
    toastId: CONFERENCE_LINK_ADDED_TOAST_ID,
  });
}
