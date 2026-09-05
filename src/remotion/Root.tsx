import { Composition } from "remotion";
import { MapScene } from "../MapScene";
import { defaultScene } from "../types";
import defaultMap from "../data/default-map.json";
import type { MapData } from "../types";
export const RemotionRoot = () => (
  <Composition
    id="WattABeat"
    component={MapScene}
    durationInFrames={960}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{
      ...defaultScene,
      mapData: {
        ...defaultMap,
        location: { ...defaultMap.location, token: "" },
      } as MapData,
    }}
    calculateMetadata={({ props }) => ({
      durationInFrames: Math.max(1, Math.round(props.duration * 30)),
    })}
  />
);
