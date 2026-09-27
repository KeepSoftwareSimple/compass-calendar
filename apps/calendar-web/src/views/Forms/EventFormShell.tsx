import classNames from "classnames";
import { type ComponentPropsWithoutRef, type ReactNode } from "react";

interface EventFormShellProps extends ComponentPropsWithoutRef<"form"> {
  children: ReactNode;
}

/**
 * Outer `<form>` for the event form. Transparent full-height flex column so
 * the sidebar's own background shows through. Children own scrolling and padding
 * (EventForm renders a scrollable body plus a pinned footer). The
 * resizable sidebar width is the single source of the form's size.
 * Content-agnostic: callers pass their fields as children and any
 * form-specific props (`name`, mouse handlers, an extra `className`).
 */
export const EventFormShell = ({
  className,
  children,
  ...props
}: EventFormShellProps) => (
  <form
    {...props}
    // biome-ignore lint/a11y/noRedundantRoles: <form> only gets its implicit "form" role when it has an accessible name, which this one doesn't; e2e tests rely on getByRole("form").
    role="form"
    className={classNames("flex min-h-0 w-full flex-1 flex-col", className)}
  >
    {children}
  </form>
);
