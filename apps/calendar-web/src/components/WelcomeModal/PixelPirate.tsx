const hat = "var(--accent)";
const skin = "#F4D7B5";
const dark = "#0d1017";
const beard = "#8B5E3C";
const white = "#E6EDF3";
// Also used for the welcome and auth modals' pill button backgrounds
const shirt = "#c2c6cc";

export function PixelPirate({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      role="img"
      aria-label="Pixel pirate cheering"
      shapeRendering="crispEdges"
    >
      {/* Hat with skull mark */}
      <rect x={4} y={0} width={8} height={1} fill={hat} />
      <rect x={3} y={1} width={10} height={1} fill={hat} />
      <rect x={2} y={2} width={12} height={1} fill={hat} />
      <rect x={3} y={3} width={10} height={1} fill={hat} />
      <rect x={7} y={1} width={2} height={1} fill={white} />

      {/* Face with eyepatch strap, patch, and right eye */}
      <rect x={4} y={4} width={8} height={5} fill={skin} />
      <rect x={4} y={5} width={8} height={1} fill={dark} />
      <rect x={5} y={5} width={2} height={2} fill={dark} />
      <rect x={9} y={6} width={1} height={1} fill={dark} />

      {/* Beard */}
      <rect x={4} y={9} width={8} height={1} fill={beard} />
      <rect x={5} y={10} width={6} height={1} fill={beard} />

      {/* Shirt with belt */}
      <rect x={4} y={11} width={8} height={1} fill={shirt} />
      <rect x={5} y={12} width={6} height={1} fill={shirt} />
      <rect x={5} y={13} width={6} height={1} fill={dark} />

      {/* Legs */}
      <rect x={6} y={14} width={1} height={1} fill={dark} />
      <rect x={9} y={14} width={1} height={1} fill={dark} />

      {/* Raised cheering arms */}
      <rect x={3} y={10} width={1} height={1} fill={skin} />
      <rect x={2} y={8} width={1} height={2} fill={skin} />
      <rect x={12} y={10} width={1} height={1} fill={skin} />
      <rect x={13} y={8} width={1} height={2} fill={skin} />
    </svg>
  );
}
