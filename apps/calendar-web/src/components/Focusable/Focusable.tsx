import {
  type ChangeEventHandler,
  type ElementType,
  type FocusEvent,
  forwardRef,
  type HTMLAttributes,
  useCallback,
  useState,
} from "react";
import { type UnderlinedInput } from "@web/common/types/component.types";
import { Divider } from "@web/components/Divider/Divider";

// Muted placeholders, matching Textarea: full white is what the user typed,
// so a hint that borrows it reads as a real value.
export const INPUT_RESET_CLASSNAME =
  "h-8.5 border-0 px-2 outline-none placeholder:text-text-muted hover:bg-border";

export interface Props
  extends UnderlinedInput,
    Omit<HTMLAttributes<HTMLElement>, "onChange"> {
  autoFocus?: boolean;
  bgColor?: string;
  Component: ElementType;
  /**
   * Not part of the generic `HTMLAttributes<HTMLElement>` this otherwise
   * extends (that's specific to input/textarea/button/select elements) -
   * declared here so callers whose `Component` is one of those can disable
   * it directly, without a wrapping `<fieldset disabled>` that would add an
   * extra DOM level around every Focusable (packet 08 step 8's read-only
   * event form).
   */
  disabled?: boolean;
  name?: string;
  onChange?: ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  placeholder?: string;
  underlineColor?: string;
  value?: string | number | readonly string[];
}

export const Focusable = forwardRef<HTMLElement, Props>(
  (
    {
      autoFocus = false,
      Component,
      underlineColor,
      withUnderline,
      ...props
    }: Props,
    ref,
  ) => {
    const [isFocused, setIsFocused] = useState(false);

    const onFocus = useCallback(
      (event: FocusEvent<HTMLElement>) => {
        setIsFocused(true);
        props.onFocus?.(event);
      },
      [props.onFocus],
    );

    const onBlur = useCallback(
      (event: FocusEvent<HTMLElement>) => {
        setIsFocused(false);
        props.onBlur?.(event);
      },
      [props.onBlur],
    );

    return (
      <>
        <Component
          {...props}
          onFocus={onFocus}
          onBlur={onBlur}
          autoFocus={autoFocus}
          ref={ref}
        />
        {/*
          Keep the underline mounted whenever `withUnderline` and toggle its
          visible width via focus, instead of mounting/unmounting it on blur.
          The Divider always reserves 2px of height while mounted, so
          unmounting it on blur shifted layout — which, in the date picker,
          moved the hovered day out from under the cursor between mousedown and
          mouseup and swallowed the first click. A stable layout fixes that.
        */}
        {!!withUnderline && (
          <Divider color={underlineColor} toggled={isFocused} />
        )}
      </>
    );
  },
);
