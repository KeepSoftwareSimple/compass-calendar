import { MinusIcon } from "@phosphor-icons/react/dist/csr/Minus";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { type ChangeEvent } from "react";

interface NumberInputProps {
  ariaLabel: string;
  id: string;
  max: number;
  min: number;
  onChange: (value: string) => void;
  value: string;
}

export function NumberInput({
  ariaLabel,
  id,
  max,
  min,
  onChange,
  value,
}: NumberInputProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  };

  const adjustValue = (delta: number) => {
    const current = Number(value);
    const next = Number.isFinite(current) ? current + delta : min;
    onChange(String(Math.min(max, Math.max(min, Math.round(next)))));
  };

  return (
    <div className="relative w-32">
      <input
        aria-label={ariaLabel}
        className="c-number-input h-12 w-full rounded-lg border border-border bg-surface px-3 pr-10 text-center text-sm text-text outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
        id={id}
        inputMode="numeric"
        max={max}
        min={min}
        onChange={handleChange}
        type="number"
        value={value}
      />
      <div className="absolute inset-y-0 right-0 flex w-8 flex-col overflow-hidden rounded-r-lg border-border border-l bg-surface-raised">
        <button
          aria-label="Increase value"
          className="flex min-h-0 flex-1 items-center justify-center text-text-muted transition-colors hover:bg-surface-overlay hover:text-text focus-visible:z-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onClick={() => adjustValue(1)}
          type="button"
        >
          <PlusIcon aria-hidden="true" size={14} weight="bold" />
        </button>
        <button
          aria-label="Decrease value"
          className="flex min-h-0 flex-1 items-center justify-center text-text-muted transition-colors hover:bg-surface-overlay hover:text-text focus-visible:z-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onClick={() => adjustValue(-1)}
          type="button"
        >
          <MinusIcon aria-hidden="true" size={14} weight="bold" />
        </button>
      </div>
    </div>
  );
}
