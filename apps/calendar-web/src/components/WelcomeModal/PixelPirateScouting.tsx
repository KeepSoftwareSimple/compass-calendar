import classNames from "classnames";

const hat = "var(--accent)";
const skin = "#F4D7B5";
const dark = "#0d1017";
const beard = "#8B5E3C";
const white = "#E6EDF3";
const shirt = "#c2c6cc";
const metal = "#5A6570";
const lens = "#1A2330";

export function PixelPirateScouting({ className }: { className?: string }) {
  return (
    <div className={classNames("c-pirate-scout", className)}>
      <svg
        className="h-full w-full"
        viewBox="0 0 16 16"
        role="img"
        aria-label="Pixel pirate scouting with binoculars"
        shapeRendering="crispEdges"
      >
        {/* Hat with skull mark */}
        <rect x={4} y={0} width={8} height={1} fill={hat} />
        <rect x={3} y={1} width={10} height={1} fill={hat} />
        <rect x={2} y={2} width={12} height={1} fill={hat} />
        <rect x={3} y={3} width={10} height={1} fill={hat} />
        <rect x={7} y={1} width={2} height={1} fill={white} />

        {/* Face (eyes covered by binoculars) */}
        <rect x={4} y={4} width={8} height={5} fill={skin} />

        {/* Binoculars: metal body, dark lenses, white glints */}
        <rect x={4} y={5} width={3} height={3} fill={metal} />
        <rect x={9} y={5} width={3} height={3} fill={metal} />
        <rect x={7} y={6} width={2} height={1} fill={metal} />
        <rect x={5} y={6} width={1} height={1} fill={lens} />
        <rect x={10} y={6} width={1} height={1} fill={lens} />
        <rect x={5} y={5} width={1} height={1} fill={white} />
        <rect x={10} y={5} width={1} height={1} fill={white} />

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

        {/* Arms holding binoculars */}
        <rect x={2} y={6} width={1} height={1} fill={skin} />
        <rect x={3} y={5} width={1} height={2} fill={skin} />
        <rect x={13} y={6} width={1} height={1} fill={skin} />
        <rect x={12} y={5} width={1} height={2} fill={skin} />
        <rect x={2} y={7} width={1} height={2} fill={skin} />
        <rect x={13} y={7} width={1} height={2} fill={skin} />
      </svg>
    </div>
  );
}
