import { memo, useMemo } from "react";
import type { buildingBlockBatches } from "./building-blocks.mjs";

type Batches = ReturnType<typeof buildingBlockBatches>;
type Batch = Batches[number];

export const BuildingBlocks = memo(function BuildingBlocks({
  batches,
  region,
  powered,
  brightness,
  color,
  focused,
}: {
  batches: Batches;
  region: string;
  powered: boolean;
  brightness: number;
  color: string;
  focused: boolean;
}) {
  const count = useMemo(
    () => batches.reduce((n, b) => n + b.count, 0),
    [batches],
  );
  return (
    <g
      data-region-3d={region}
      data-building-district={region}
      data-powered={powered}
      data-block-count={count}
      opacity={focused ? undefined : 0.32}
      shapeRendering="optimizeSpeed"
    >
      <BuildingFaces batches={batches} />
      {powered && (
        <g data-block-lights="" opacity={brightness} pointerEvents="none">
          <BuildingLights batches={batches} color={color} />
        </g>
      )}
    </g>
  );
});

const BuildingFaces = memo(function BuildingFaces({
  batches,
}: {
  batches: Batches;
}) {
  return (
    <g strokeLinejoin="round">
      {batches.map((batch, i) => (
        <BlockFaces key={i} batch={batch} />
      ))}
    </g>
  );
});

// Roof and window glows share one path each so playback can change brightness
// by compositing a single group instead of rewriting thousands of attributes.
const BuildingLights = memo(function BuildingLights({
  batches,
  color,
}: {
  batches: Batches;
  color: string;
}) {
  const roof = useMemo(() => batches.map((b) => b.roof).join(""), [batches]);
  const windows = useMemo(
    () => batches.map((b) => b.windows).join(""),
    [batches],
  );
  return (
    <>
      <path
        data-block-light="roof"
        d={roof}
        fill={color}
        fillOpacity={0.55}
        fillRule="evenodd"
      />
      <path
        data-block-light="windows"
        d={windows}
        fill="none"
        stroke={color}
        strokeWidth="0.65"
        strokeLinecap="round"
      />
    </>
  );
});

const BlockFaces = memo(function BlockFaces({ batch }: { batch: Batch }) {
  return (
    <>
      <path
        data-block-face="side"
        d={batch.left}
        fill="#26332f"
        stroke="#45554a"
        strokeWidth="0.25"
      />
      <path
        data-block-face="front"
        d={batch.front}
        fill="#354238"
        stroke="#52604b"
        strokeWidth="0.25"
      />
      <path
        data-block-face="roof"
        d={batch.roof}
        fill="#53614b"
        stroke="#758063"
        strokeWidth="0.35"
        fillRule="evenodd"
      />
    </>
  );
});
