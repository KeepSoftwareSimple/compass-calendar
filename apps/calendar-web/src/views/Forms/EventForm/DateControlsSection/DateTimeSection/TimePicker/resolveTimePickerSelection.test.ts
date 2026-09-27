import { getTimeOptions } from "@web/common/utils/datetime/web.date.util";
import { resolveTimePickerSelection } from "./resolveTimePickerSelection";
import { describe, expect, it } from "bun:test";

describe("resolveTimePickerSelection", () => {
  const options = getTimeOptions();

  it("returns the option object from the list when values match", () => {
    const constructed = { label: "5:30 PM", value: "5:30 PM" };
    const { value, options: nextOptions } = resolveTimePickerSelection(
      constructed,
      options,
    );
    const listed = options.find((option) => option.value === "5:30 PM");
    if (!listed) {
      throw new Error("expected 5:30 PM in getTimeOptions()");
    }

    expect(value).toBe(listed);
    expect(value).not.toBe(constructed);
    expect(nextOptions).toBe(options);
  });

  it("inserts a custom time so react-select can focus it by reference", () => {
    const custom = { label: "5:33 PM", value: "5:33 PM" };
    const { value, options: nextOptions } = resolveTimePickerSelection(
      custom,
      options,
    );

    expect(value).toBe(custom);
    expect(nextOptions).not.toBe(options);
    expect(nextOptions?.find((option) => option.value === "5:33 PM")).toBe(
      custom,
    );

    const index = nextOptions!.findIndex(
      (option) => option.value === "5:33 PM",
    );
    expect(nextOptions![index - 1]?.value).toBe("5:30 PM");
    expect(nextOptions![index + 1]?.value).toBe("5:45 PM");
  });

  it("passes through when options are missing", () => {
    const value = { label: "5:30 PM", value: "5:30 PM" };
    expect(resolveTimePickerSelection(value, undefined)).toEqual({
      value,
      options: undefined,
    });
  });
});
