import { type FC } from "react";

interface Props {
  description: string;
}

export const TooltipDescription: FC<Props> = ({ description }) => {
  return (
    <span className="relative" style={{ paddingRight: 10 }}>
      {description}
    </span>
  );
};
