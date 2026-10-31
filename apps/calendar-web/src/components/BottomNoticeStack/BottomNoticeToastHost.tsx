import classNames from "classnames";
import { Slide, ToastContainer } from "react-toastify";
import { TOAST_CHROME_STYLE } from "@web/common/constants/toast.constants";
import { useEscapeToDismissToast } from "@web/common/utils/toast/useEscapeToDismissToast";
import { useEphemeralToastQueue } from "@web/components/BottomNoticeStack/useEphemeralToastQueue";
import { selectTheme, useThemeStore } from "@web/settings/theme/theme.store";

/** react-toastify host slotted into {@link BottomNoticeStack}. */
export function BottomNoticeToastHost() {
  const theme = useThemeStore(selectTheme);
  const toastQueueVisible = useEphemeralToastQueue();
  useEscapeToDismissToast();

  return (
    <ToastContainer
      autoClose={5000}
      className={classNames(
        "compass-bottom-notice-stack__toasts pointer-events-auto",
        !toastQueueVisible && "compass-bottom-notice-stack__toasts--hidden",
      )}
      closeButton={false}
      closeOnClick
      draggable
      hideProgressBar={false}
      limit={1}
      newestOnTop={false}
      pauseOnFocusLoss
      pauseOnHover
      position="bottom-left"
      rtl={false}
      theme={theme === "dark-abyss" ? "dark" : "light"}
      toastStyle={TOAST_CHROME_STYLE}
      transition={Slide}
    />
  );
}
