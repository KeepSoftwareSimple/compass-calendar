export function TimezoneOptionButton({
  active,
  description,
  id,
  label,
  onSelect,
  selected,
}: {
  active: boolean;
  description: string;
  id: string;
  label: string;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <button
      aria-selected={selected}
      className={`flex w-full flex-col items-start rounded-sm px-3 py-2 text-left text-sm ${
        active ? "bg-surface-overlay" : ""
      } ${selected ? "text-text" : "text-text-muted"} hover:bg-surface-overlay hover:text-text`}
      id={id}
      onClick={onSelect}
      role="option"
      tabIndex={-1}
      type="button"
    >
      <span className="text-text">{label}</span>
      <span className="text-text-muted text-xs">{description}</span>
    </button>
  );
}
