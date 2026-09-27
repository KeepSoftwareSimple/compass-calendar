import {
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
} from "@floating-ui/react";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { useLocation, useNavigate } from "@tanstack/react-router";
import classNames from "classnames";
import { useRef, useState } from "react";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import { Z_INDEX_FLOATING_MENU } from "@web/common/constants/web.constants";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import { useFloatingLayer } from "@web/shortcuts/floating-layer";
import { pageJumpAttrs } from "@web/shortcuts/page-jump/page-jump.targets";
import {
  LIFE_SHORTCUT,
  VIEW_SHORTCUTS,
} from "@web/shortcuts/shortcuts.constants";

interface SelectViewProps {
  /** The date heading text, e.g. "July 2026" or "Monday, July 20". */
  label: string;
  onToday?: () => void;
}

export const SelectView = ({ label, onToday }: SelectViewProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const listRef = useRef<Array<HTMLElement | null>>([]);
  useFloatingLayer("viewSelect", isOpen);

  const getCurrentView = (): "Day" | "Week" | "Life" => {
    const pathname = location.pathname;
    if (
      pathname === ROOT_ROUTES.DAY ||
      pathname.startsWith(`${ROOT_ROUTES.DAY}/`)
    ) {
      return "Day";
    }
    if (pathname === ROOT_ROUTES.WEEK) {
      return "Week";
    }
    if (pathname === ROOT_ROUTES.LIFE) {
      return "Life";
    }
    return "Week";
  };

  const currentView = getCurrentView();

  const options = [
    ...(onToday
      ? [
          {
            label: currentView === "Week" ? "This Week" : "Today",
            view: null,
            key: "t",
            onSelect: onToday,
          },
        ]
      : []),
    {
      label: VIEW_SHORTCUTS.day.label,
      view: "Day" as const,
      key: VIEW_SHORTCUTS.day.key,
      onSelect: () => navigate({ to: VIEW_SHORTCUTS.day.route }),
    },
    {
      label: VIEW_SHORTCUTS.week.label,
      view: "Week" as const,
      key: VIEW_SHORTCUTS.week.key,
      onSelect: () => navigate({ to: VIEW_SHORTCUTS.week.route }),
    },
    {
      label: LIFE_SHORTCUT.label,
      view: "Life" as const,
      key: LIFE_SHORTCUT.key,
      onSelect: () => navigate({ to: LIFE_SHORTCUT.route }),
    },
  ];

  const { refs, context } = useFloating({
    open: isOpen,
    onOpenChange: (open) => {
      setIsOpen(open);
      if (open) {
        setActiveIndex(
          options.findIndex((option) => option.view === currentView),
        );
      } else {
        setActiveIndex(null);
        listRef.current = [];
      }
    },
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "menu" });

  const listNavigation = useListNavigation(context, {
    listRef,
    activeIndex,
    onNavigate: setActiveIndex,
    loop: true,
  });

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions(
    [click, dismiss, role, listNavigation],
  );

  const selectOption = (onSelect: () => void) => {
    onSelect();
    setIsOpen(false);
  };

  const dropdownId = "view-select-dropdown";

  return (
    <div className="relative" {...pageJumpAttrs("view-select")}>
      <h1 className="text-text" aria-live="polite">
        <button
          ref={refs.setReference}
          {...getReferenceProps({
            onKeyDown: (e) => {
              // While the list is open, focus can sit on this trigger for a
              // frame - useListNavigation moves it to the active option
              // asynchronously - so a fast ArrowDown+Enter lands Enter here.
              // The button's native Enter-click would then toggle the
              // dropdown closed and LOSE the selection. Commit the active
              // option instead, mirroring the floating element's handler.
              if (
                isOpen &&
                activeIndex !== null &&
                (e.key === "Enter" || e.key === " ")
              ) {
                e.preventDefault();
                const option = options[activeIndex];
                if (option) {
                  selectOption(option.onSelect);
                }
              }
            },
          })}
          type="button"
          className="c-focus-ring flex cursor-pointer items-center gap-1.5 rounded px-1 text-xl transition-colors hover:bg-text/10"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={isOpen ? dropdownId : undefined}
        >
          <span>{label}</span>
          <CaretDownIcon size={14} aria-hidden="true" />
        </button>
      </h1>

      {isOpen && (
        <div
          ref={refs.setFloating}
          {...getFloatingProps({
            onKeyDown: (e) => {
              if (
                activeIndex !== null &&
                (e.key === "Enter" || e.key === " ")
              ) {
                e.preventDefault();
                const option = options[activeIndex];
                if (option) {
                  selectOption(option.onSelect);
                }
              }
            },
          })}
          id={dropdownId}
          data-testid="view-select-dropdown"
          className="absolute inset-inline-start-0 top-full mt-1 min-w-[180px] rounded border border-border bg-surface py-1 shadow-lg"
          role="listbox"
          style={{ zIndex: Z_INDEX_FLOATING_MENU }}
        >
          {options.map((option, index) => {
            const isSelected =
              option.view !== null && currentView === option.view;
            const isActive = activeIndex === index;

            return (
              <div
                key={option.label}
                ref={(node) => {
                  listRef.current[index] = node;
                }}
                {...getItemProps({
                  onClick: () => selectOption(option.onSelect),
                  active: isActive,
                })}
                role="option"
                aria-selected={isSelected}
                tabIndex={isActive ? 0 : -1}
                className={classNames(
                  "c-focus-ring flex w-full cursor-pointer items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm transition-colors",
                  isSelected ? "text-accent" : "text-text-muted",
                  isActive ? "bg-text/10" : "hover:bg-text/10",
                )}
              >
                <span>{option.label}</span>
                <ShortcutKeys keys={option.key} className="ml-auto" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
