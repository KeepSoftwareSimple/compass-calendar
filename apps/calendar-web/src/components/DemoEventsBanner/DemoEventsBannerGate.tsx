import { type FC, useCallback, useState } from "react";
import {
  DemoEventsBanner,
  dismissDemoEventsBanner,
  hasDismissedDemoEventsBanner,
} from "@web/components/DemoEventsBanner/DemoEventsBanner";
import { type DemoEventsRange } from "@web/events/demo-events.util";
import { useDemoEventsPresent } from "@web/events/hooks/useDemoEventsPresent";

interface DemoEventsBannerGateProps {
  /** Visible calendar range; banner only shows when sample events overlap it. */
  range: DemoEventsRange;
}

export const DemoEventsBannerGate: FC<DemoEventsBannerGateProps> = ({
  range,
}) => {
  const hasDemoEvents = useDemoEventsPresent(range);
  const [dismissed, setDismissed] = useState(hasDismissedDemoEventsBanner);

  const handleDismiss = useCallback(() => {
    dismissDemoEventsBanner();
    setDismissed(true);
  }, []);

  if (!hasDemoEvents || dismissed) {
    return null;
  }

  return <DemoEventsBanner onDismiss={handleDismiss} />;
};
