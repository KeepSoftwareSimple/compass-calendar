import type React from "react";
import { useCallback } from "react";
import { Btn, SaveButton } from "@web/components/Button/Button";
import { TooltipWrapper } from "@web/components/Tooltip/TooltipWrapper";

interface Props {
  saveText?: string;
  cancelText?: string;
  onSubmit: () => void;
  onCancel?: () => void;
}

export const SaveSection: React.FC<Props> = ({
  saveText = "Save",
  cancelText = "Cancel",
  onSubmit: _onSubmit,
  onCancel,
}) => {
  const onSave = useCallback(() => _onSubmit(), [_onSubmit]);

  return (
    // Pinned footer bar: EventForm renders this outside its scrollable body,
    // so it stays visible while the fields scroll.
    <div className="flex items-center justify-start gap-3 border-border border-t px-4 py-3">
      {/* onClick lives on the buttons, not the tooltip wrapper div: keyboard
          activation targets the button itself, and the wrapper only worked
          for it by event bubbling. */}
      {onCancel && (
        <TooltipWrapper description={cancelText}>
          <Btn onClick={onCancel} title={cancelText}>
            {cancelText}
          </Btn>
        </TooltipWrapper>
      )}

      <TooltipWrapper shortcut={["Mod", "Enter"]}>
        <SaveButton
          aria-keyshortcuts="Meta+Enter"
          minWidth={110}
          onClick={onSave}
        >
          {saveText}
        </SaveButton>
      </TooltipWrapper>
    </div>
  );
};
