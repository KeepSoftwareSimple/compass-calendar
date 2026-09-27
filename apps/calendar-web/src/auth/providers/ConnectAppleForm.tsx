import { type FC, useEffect, useId, useRef, useState } from "react";
import {
  APPLE_CREDENTIAL_INSTRUCTIONS,
  APPLE_CREDENTIAL_PRIVACY_NOTE,
  APPLE_SELF_HOSTING_DOC_URL,
} from "@web/auth/providers/connect-apple.copy";
import {
  connectAppleActions,
  selectConnectAppleInitialEmail,
  selectConnectAppleOpen,
  useConnectAppleStore,
} from "@web/auth/providers/connect-apple.store";
import { useSubmitAppleCredential } from "@web/auth/providers/useSubmitAppleCredential";
import { AuthInput } from "@web/components/AuthModal/components/AuthInput";
import {
  OverlayPanel,
  OverlayPanelActionButton,
  OverlayPanelActions,
} from "@web/components/OverlayPanel/OverlayPanel";
import { useAppLockReason } from "@web/shortcuts/app-lock";
import { isFloatingLayerOpen } from "@web/shortcuts/floating-layer";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";
import { DiscardUnsavedChangesDialog } from "@web/views/Forms/EventForm/DiscardUnsavedChangesDialog";

export const ConnectAppleForm: FC = () => {
  const isOpen = useConnectAppleStore(selectConnectAppleOpen);
  const initialEmail = useConnectAppleStore(selectConnectAppleInitialEmail);
  const submitCredential = useSubmitAppleCredential();
  const emailRef = useRef<HTMLInputElement>(null);
  const instructionsId = useId();
  const privacyId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [baselineEmail, setBaselineEmail] = useState("");
  useAppLockReason("connectAppleForm", isOpen);

  useEffect(() => {
    if (!isOpen) return;
    setEmail(initialEmail);
    setBaselineEmail(initialEmail);
    setPassword("");
    setError(null);
    setIsSubmitting(false);
    setIsConfirmOpen(false);
  }, [initialEmail, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    emailRef.current?.focus();
  }, [isOpen]);

  const isDirty = email.trim() !== baselineEmail.trim() || password.length > 0;

  const requestClose = () => {
    if (isSubmitting) return;
    if (isDirty) {
      setIsConfirmOpen(true);
      return;
    }
    connectAppleActions.close();
  };

  useAppShortcut(
    "Escape",
    (event) => {
      if (!isOpen || isFloatingLayerOpen()) return;
      event.preventDefault();
      requestClose();
    },
    { ignoreInputs: false },
  );

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    const username = email.trim();
    const secret = password;
    try {
      await submitCredential(username, secret);
      setPassword("");
    } catch (submitError) {
      if (submitError instanceof Error && submitError.message) {
        setError(submitError.message);
      }
    } finally {
      setIsSubmitting(false);
      setPassword("");
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <OverlayPanel
        align="start"
        ariaLabel="Connect Apple Calendar"
        initialFocusRef={emailRef}
        onDismiss={requestClose}
        onModEnter={() => {
          void handleSubmit();
        }}
        onShiftEscape={() => {
          if (isSubmitting) return;
          setIsConfirmOpen(false);
          connectAppleActions.close();
        }}
        title="Connect Apple Calendar"
        variant="modal"
        widthClassName="w-120"
      >
        <div className="flex flex-col gap-4 text-sm text-text">
          <ol
            className="list-decimal space-y-1 pl-5 text-text-muted"
            id={instructionsId}
          >
            {APPLE_CREDENTIAL_INSTRUCTIONS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p>
            <a
              className="c-focus-ring rounded-xs text-accent underline"
              href={APPLE_SELF_HOSTING_DOC_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              Self-hosting guide with screenshots
            </a>
          </p>
          <p className="text-text-muted" id={privacyId}>
            {APPLE_CREDENTIAL_PRIVACY_NOTE}
          </p>
          <AuthInput
            autoComplete="email"
            disabled={isSubmitting}
            label="Apple ID email"
            onChange={(event) => setEmail(event.target.value)}
            ref={emailRef}
            type="email"
            value={email}
          />
          <AuthInput
            aria-describedby={`${instructionsId} ${privacyId}`}
            autoComplete="new-password"
            disabled={isSubmitting}
            error={error ?? undefined}
            hasError={error != null}
            label="App-specific password"
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </div>
        <OverlayPanelActions align="end">
          <OverlayPanelActionButton
            disabled={isSubmitting}
            onClick={requestClose}
          >
            Cancel
          </OverlayPanelActionButton>
          <OverlayPanelActionButton
            aria-busy={isSubmitting || undefined}
            disabled={
              isSubmitting || email.trim().length === 0 || password.length === 0
            }
            onClick={() => {
              void handleSubmit();
            }}
            shortcut={["Mod", "Enter"]}
            showShortcut
            variant="primary"
          >
            {isSubmitting ? "Connecting…" : "Connect"}
          </OverlayPanelActionButton>
        </OverlayPanelActions>
      </OverlayPanel>
      <DiscardUnsavedChangesDialog
        isOpen={isConfirmOpen}
        onCancel={() => setIsConfirmOpen(false)}
        onDiscard={() => {
          setIsConfirmOpen(false);
          connectAppleActions.close();
        }}
      />
    </>
  );
};
