import { CaretDownIcon } from "@phosphor-icons/react";
import classNames from "classnames";
import {
  type FC,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  type ProviderKind,
  providerDisplayName,
} from "@core/types/sync/identity.contracts";
import { openingProviderLabel } from "@web/auth/providers/connection-provider.util";
import { BOOKING_CONNECT_BUTTON_LABEL } from "@web/auth/providers/provider-copy.util";
import { useAvailableConnectProviders } from "@web/auth/providers/useAvailableConnectProviders";
import { useConnectProvider } from "@web/auth/providers/useConnectProvider";
import { focusOnPointerEnter } from "@web/common/utils/focus-on-pointer-enter";
import { MicrosoftLogo } from "@web/components/AuthModal/components/MicrosoftButton";
import {
  OverlayPanelActionButton,
  OverlayPanelActions,
} from "@web/components/OverlayPanel/OverlayPanel";

const PROVIDER_MENU_ICON: Partial<Record<ProviderKind, typeof MicrosoftLogo>> =
  {
    microsoft: MicrosoftLogo,
  };

const SIDEBAR_PRIMARY_CLASSNAME =
  "c-button-compact c-button-primary mb-2 w-full rounded-xs px-2 py-1.5 text-left text-xs";

type ConnectProviderChooserProps = {
  idleLabel: string;
  newAccount?: boolean;
  variant?: "overlay-primary" | "sidebar-primary" | "prompt";
  showShortcut?: boolean;
  shortcut?: string;
  shortcutAttrs?: Record<string, string>;
};

export const ConnectProviderChooser: FC<ConnectProviderChooserProps> = ({
  idleLabel,
  newAccount,
  variant = "overlay-primary",
  showShortcut = false,
  shortcut,
  shortcutAttrs,
}) => {
  const available = useAvailableConnectProviders();
  const google = useConnectProvider("google", { newAccount });
  const microsoft = useConnectProvider("microsoft", { newAccount });
  const apple = useConnectProvider("apple", { newAccount });
  const byKind: Record<ProviderKind, ReturnType<typeof useConnectProvider>> = {
    google,
    microsoft,
    apple,
  };
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const connectingKind = available.find((kind) => byKind[kind].isConnecting);
  const isConnecting = connectingKind != null;
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    firstItemRef.current?.focus();
    const onPointerDown = (event: MouseEvent) => {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  if (available.length === 0) return null;

  const runConnect = (kind: ProviderKind) => {
    setMenuOpen(false);
    byKind[kind].connect();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]',
      ),
    );
    if (items.length === 0) return;
    const active = document.activeElement;
    const index = items.indexOf(active as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setMenuOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus();
    }
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowDown" && !menuOpen) {
      event.preventDefault();
      setMenuOpen(true);
    }
    if (event.key === "Escape" && menuOpen) {
      event.preventDefault();
      setMenuOpen(false);
    }
  };

  if (variant === "prompt") {
    return (
      <OverlayPanelActions align="start">
        {available.map((kind) => (
          <OverlayPanelActionButton
            aria-busy={byKind[kind].isConnecting || undefined}
            disabled={isConnecting}
            key={kind}
            onClick={() => runConnect(kind)}
            variant="primary"
          >
            {byKind[kind].isConnecting
              ? openingProviderLabel(kind)
              : BOOKING_CONNECT_BUTTON_LABEL[kind]}
          </OverlayPanelActionButton>
        ))}
      </OverlayPanelActions>
    );
  }

  const buttonLabel = isConnecting
    ? openingProviderLabel(connectingKind ?? "google")
    : idleLabel;

  if (available.length === 1) {
    const kind = available[0];
    const singleLabel = isConnecting
      ? buttonLabel
      : (byKind[kind].commandAction?.label ?? idleLabel);
    if (variant === "sidebar-primary") {
      return (
        <button
          aria-busy={isConnecting || undefined}
          className={SIDEBAR_PRIMARY_CLASSNAME}
          disabled={isConnecting}
          onClick={() => runConnect(kind)}
          type="button"
          {...shortcutAttrs}
        >
          {singleLabel}
        </button>
      );
    }
    return (
      <OverlayPanelActionButton
        aria-busy={isConnecting || undefined}
        disabled={isConnecting}
        onClick={() => runConnect(kind)}
        shortcut={shortcut}
        showShortcut={showShortcut}
        variant="primary"
        {...shortcutAttrs}
      >
        {singleLabel}
      </OverlayPanelActionButton>
    );
  }

  const menu = menuOpen ? (
    <div
      className="absolute top-full z-10 mt-1 min-w-full rounded border border-border bg-surface-overlay py-1 shadow-lg"
      id={menuId}
      onKeyDown={onMenuKeyDown}
      role="menu"
    >
      {available.map((kind, index) => {
        const Icon = PROVIDER_MENU_ICON[kind];
        return (
          <button
            className="c-focus-ring flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text hover:bg-surface-panel"
            key={kind}
            onClick={() => runConnect(kind)}
            onPointerEnter={focusOnPointerEnter}
            ref={index === 0 ? firstItemRef : undefined}
            role="menuitem"
            type="button"
          >
            {Icon ? <Icon size={14} /> : null}
            {providerDisplayName(kind)}
          </button>
        );
      })}
    </div>
  ) : null;

  if (variant === "sidebar-primary") {
    return (
      <div className="relative" ref={rootRef}>
        <button
          aria-busy={isConnecting || undefined}
          aria-controls={menuId}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className={classNames(
            SIDEBAR_PRIMARY_CLASSNAME,
            "inline-flex items-center gap-1",
          )}
          disabled={isConnecting}
          onClick={() => setMenuOpen((open) => !open)}
          onKeyDown={onTriggerKeyDown}
          type="button"
          {...shortcutAttrs}
        >
          {buttonLabel}
          <CaretDownIcon aria-hidden size={12} />
        </button>
        {menu}
      </div>
    );
  }

  return (
    <div className="relative" ref={rootRef}>
      <OverlayPanelActionButton
        aria-busy={isConnecting || undefined}
        aria-controls={menuId}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        disabled={isConnecting}
        onClick={() => setMenuOpen((open) => !open)}
        onKeyDown={onTriggerKeyDown}
        shortcut={shortcut}
        showShortcut={showShortcut}
        variant="primary"
        {...shortcutAttrs}
      >
        <span className="inline-flex items-center gap-1">
          {buttonLabel}
          <CaretDownIcon aria-hidden size={12} />
        </span>
      </OverlayPanelActionButton>
      {menu}
    </div>
  );
};
