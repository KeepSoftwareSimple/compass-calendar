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
import { useSession } from "@web/auth/compass/session/useSession";
import { trackSignupStarted } from "@web/auth/posthog/signup-funnel";
import { openingProviderLabel } from "@web/auth/providers/connection-provider.util";
import { PROVIDER_LOGO } from "@web/auth/providers/ProviderMark";
import { CONNECT_CALENDAR_LABEL } from "@web/auth/providers/provider-copy.util";
import { useAvailableConnectProviders } from "@web/auth/providers/useAvailableConnectProviders";
import { useConnectProvider } from "@web/auth/providers/useConnectProvider";
import { useSignInProviders } from "@web/auth/providers/useSignInProviders";
import { focusOnPointerEnter } from "@web/common/utils/focus-on-pointer-enter";
import { SignInProviderButtons } from "@web/components/AuthModal/components/SignInProviderButtons";
import { OverlayPanelActionButton } from "@web/components/OverlayPanel/OverlayPanel";

const SIDEBAR_PRIMARY_CLASSNAME =
  "c-button-compact c-button-primary mb-2 w-full rounded-xs px-2 py-1.5 text-left text-xs";

type ConnectProviderChooserBaseProps = {
  newAccount?: boolean;
  showShortcut?: boolean;
  shortcut?: string;
  shortcutAttrs?: Record<string, string>;
};

type ConnectProviderChooserProps = ConnectProviderChooserBaseProps &
  (
    | { variant: "prompt"; idleLabel?: never }
    | {
        variant?: "overlay-primary" | "sidebar-primary";
        idleLabel: string;
      }
  );

export const ConnectProviderChooser: FC<ConnectProviderChooserProps> = ({
  idleLabel,
  newAccount,
  variant = "overlay-primary",
  showShortcut = false,
  shortcut,
  shortcutAttrs,
}) => {
  const { authenticated } = useSession();
  const signIn = useSignInProviders();
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

  const kinds = authenticated ? available : signIn.available;
  const connectingKind = authenticated
    ? available.find((kind) => byKind[kind].isConnecting)
    : signIn.loadingKind;
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

  if (kinds.length === 0) return null;

  const runConnect = (kind: ProviderKind) => {
    setMenuOpen(false);
    if (authenticated) {
      byKind[kind].connect();
      return;
    }
    trackSignupStarted("connect_chooser");
    signIn.startSignIn(kind);
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
      <SignInProviderButtons
        available={kinds}
        busyLabel={openingProviderLabel}
        labels={CONNECT_CALENDAR_LABEL}
        loadingKind={connectingKind ?? null}
        onSignIn={runConnect}
        shortcutKeys={null}
      />
    );
  }

  const buttonLabel = isConnecting
    ? openingProviderLabel(connectingKind ?? "google")
    : idleLabel;

  if (kinds.length === 1) {
    const kind = kinds[0];
    if (kind === undefined) return null;
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
      // Opaque surface-raised, matching c-context-menu: this floats over
      // Settings copy, and surface-overlay is a 6-7% tint so the explainer
      // showed through.
      className="absolute top-full z-10 mt-1 min-w-full rounded border border-border bg-surface-raised py-1 shadow-[0_4px_6px_var(--color-shadow-default)]"
      id={menuId}
      onKeyDown={onMenuKeyDown}
      role="menu"
    >
      {kinds.map((kind, index) => {
        const Icon = PROVIDER_LOGO[kind];
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
            <Icon size={14} />
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
