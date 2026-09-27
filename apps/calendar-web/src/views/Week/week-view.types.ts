import { type Dayjs } from "@core/util/date/dayjs";

export interface RootProps {
  component: {
    today: Dayjs;
  };
}

export type Category_View = "current" | "pastFuture";
