import { type SelectOption } from "@web/common/types/component.types";
import { type TimeOption } from "@web/common/types/util.types";
import { minutesFromTimeValue } from "@web/common/utils/datetime/web.date.util";

/**
 * react-select's openMenu focuses the selected option via reference equality
 * (`options.indexOf(value)`). Compass often passes a separately constructed
 * value object, so resolve to the matching option (or insert a custom time)
 * before handing props to CreatableSelect.
 */
export const resolveTimePickerSelection = (
  value: SelectOption<string>,
  options: TimeOption[] | undefined,
): { value: SelectOption<string>; options: TimeOption[] | undefined } => {
  if (!options?.length) {
    return { value, options };
  }

  const exactMatch = options.find((option) => option.value === value.value);
  if (exactMatch) {
    return { value: exactMatch, options };
  }

  const valueMinutes = minutesFromTimeValue(value.value);
  const insertAt = options.findIndex((option) => {
    const optionMinutes = minutesFromTimeValue(option.value);
    return (
      valueMinutes !== null &&
      optionMinutes !== null &&
      optionMinutes > valueMinutes
    );
  });
  const nextOptions =
    insertAt === -1
      ? [...options, value as TimeOption]
      : [
          ...options.slice(0, insertAt),
          value as TimeOption,
          ...options.slice(insertAt),
        ];

  return { value, options: nextOptions };
};
