import { memo } from "react";
import type { buildingBlockBatches } from "./building-blocks.mjs";

export function BuildingBlocks({
  batches,
  region,
  powered,
  brightness,
  color,
  focused,
}: {
  batches: ReturnType<typeof buildingBlockBatches>;
  region: string;
  powered: boolean;
  brightness: number;
  color: string;
  focused: boolean;
}) {
  return (
    <g
      data-region-3d={region}
      data-building-district={region}
      data-powered={powered}
      data-block-count={batches.reduce((n, b) => n + b.count, 0)}
      opacity={focused ? 1 : 0.32}
    >
      {batches.map((batch, i) => (
        <g key={i} strokeLinejoin="round">
          <BlockFaces batch={batch} />
          {powered && (
            <>
              <path
                data-block-light="roof"
                d={batch.roof}
                fill={color}
                fillOpacity={brightness * 0.55}
                fillRule="evenodd"
                pointerEvents="none"
              />
              <path
                data-block-light="windows"
                d={batch.windows}
                fill="none"
                stroke={color}
                strokeWidth="0.65"
                strokeDasharray="1.2 0.8"
                opacity={brightness}
                pointerEvents="none"
              />
            </>
          )}
        </g>
      ))}
    </g>
  );
}

const BlockFaces = memo(function BlockFaces({
  batch,
}: {
  batch: ReturnType<typeof buildingBlockBatches>[number];
}) {
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
