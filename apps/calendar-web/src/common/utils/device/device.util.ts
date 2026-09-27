interface NavigatorUAData {
  mobile: boolean;
}

type NavigatorWithUAData = Navigator & {
  userAgentData?: NavigatorUAData;
};

/**
 * Whether the app is running on a mobile OS (phone), based on the user agent
 * rather than the window size — narrow desktop windows get the responsive
 * layout instead of the mobile gate. iPads (including desktop-mode Safari,
 * which reports a Mac UA with touch support) are treated as desktop since the
 * responsive layout serves them better than the gate.
 */
export const isMobileOS = (): boolean => {
  if (typeof navigator === "undefined") {
    return false;
  }

  const uaData = (navigator as NavigatorWithUAData).userAgentData;
  if (typeof uaData?.mobile === "boolean") {
    return uaData.mobile;
  }

  return /Android|iPhone|iPod/i.test(navigator.userAgent);
};
