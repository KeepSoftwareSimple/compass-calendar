import classNames from "classnames";
import { type ButtonHTMLAttributes, type ReactNode, useId } from "react";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";

export interface SwitchProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "onChange" | "role" | "type"
  > {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  busy?: boolean;
  disabled?: boolean;
  shortcutKeys?: readonly string[];
}

/**
 * A labelled `role="switch"` with an accent track. The hold-Mod chip sits in
 * the label so the control's accessible name stays the label text.
 */
export function Switch({
  id,
  checked,
  onCheckedChange,
  label,
  description,
  busy = false,
  disabled = false,
  shortcutKeys,
  className,
  ...props
}: SwitchProps) {
  const descriptionId = useId();
  const chip =
    shortcutKeys && shortcutKeys.length > 0 ? (
      <span aria-hidden="true">
        <ShortcutKeys keys={[...shortcutKeys]} />
      </span>
    ) : null;

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1 text-sm text-text" htmlFor={id}>
        {label}
        {chip}
      </label>
      <button
        {...props}
        aria-busy={busy || undefined}
        aria-checked={checked}
        aria-describedby={description ? descriptionId : undefined}
        className={classNames(
          "c-focus-ring group inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-border-strong p-0.5 disabled:cursor-not-allowed disabled:opacity-60 aria-busy:animate-pulse aria-checked:bg-accent",
          className,
        )}
        disabled={disabled || busy}
        id={id}
        onClick={() => onCheckedChange(!checked)}
        role="switch"
        type="button"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none block size-4 rounded-full bg-background group-aria-checked:translate-x-4 group-aria-checked:bg-on-accent motion-safe:transition-transform"
        />
      </button>
      {description ? (
        <span className="sr-only" id={descriptionId}>
          {description}
        </span>
      ) : null}
    </div>
  );
}
