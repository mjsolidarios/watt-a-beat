import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { LocationResult, MapData, SceneProps, Theme } from "./types";

const places = [
  "Iloilo City",
  "Cebu City",
  "Baguio",
  "Bacolod",
  "Dumaguete",
  "Vigan",
];
const themes: Theme[] = ["midnight", "moonlight", "christmas", "rain"];
const pick = <T>(items: readonly T[]) =>
  items[Math.floor(Math.random() * items.length)];
const visualState = ({
  mapData,
  theme,
  colorMode,
  lightColor,
  intensity,
  sensitivity,
  enabled,
  labels,
  particles,
  zoom,
  pan,
  selected,
  buildings3D,
}: SceneProps) => ({
  mapData,
  theme,
  colorMode,
  lightColor,
  intensity,
  sensitivity,
  enabled,
  labels,
  particles,
  zoom,
  pan,
  selected,
  buildings3D,
});

export function useSurprise(
  scene: SceneProps,
  setScene: Dispatch<SetStateAction<SceneProps>>,
  area: {
    select: (location: LocationResult) => Promise<MapData | undefined>;
    cancel: () => void;
  },
) {
  const previous = useRef<ReturnType<typeof visualState> | null>(null);
  const request = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => () => request.current?.abort(), []);
  const cancel = () => {
    request.current?.abort();
    request.current = null;
    setBusy(false);
  };
  const surprise = async () => {
    if (request.current || !scene.mapData) return;
    const abort = new AbortController();
    request.current = abort;
    const snapshot = visualState(scene);
    const place = pick(places.filter((name) => name !== scene.mapData?.name));
    setBusy(true);
    setError("");
    setMessage(`Finding a new scene in ${place}…`);
    try {
      const response = await fetch(
        `/api/locations?q=${encodeURIComponent(place)}`,
        { signal: abort.signal },
      );
      const data = await response.json();
      if (!response.ok || !data.results?.length)
        throw new Error(
          data.error || "Couldn’t find that place. Try Surprise me again.",
        );
      abort.signal.throwIfAborted();
      const location =
        data.results.find(
          (r: LocationResult) => r.name.toLowerCase() === place.toLowerCase(),
        ) ?? data.results[0];
      let map: MapData | undefined;
      try {
        map = await area.select(location);
      } catch (loadError) {
        abort.signal.throwIfAborted();
        const detail =
          loadError instanceof Error && loadError.message
            ? loadError.message
            : "Unable to load this area.";
        throw new Error(
          `${detail} Your previous scene is still here. Try again.`,
        );
      }
      abort.signal.throwIfAborted();
      if (!map)
        throw new Error(
          "That map couldn’t load. Your previous scene is still here. Try again.",
        );
      previous.current = snapshot;
      setCanUndo(true);
      setScene((s) => ({
        ...s,
        theme: pick(themes.filter((t) => t !== scene.theme)),
        colorMode: pick(["theme", "random"] as const),
        intensity: 50 + Math.floor(Math.random() * 36),
        sensitivity: 40 + Math.floor(Math.random() * 46),
        particles: true,
        labels: true,
      }));
      setMessage(`New scene: ${map.name}. Your music stays with you.`);
    } catch (e) {
      if (!abort.signal.aborted) {
        setError(
          e instanceof Error
            ? e.message
            : "Couldn’t change the scene. Try again.",
        );
        setMessage("");
      }
    } finally {
      if (request.current === abort) {
        request.current = null;
        setBusy(false);
      }
    }
  };
  return {
    busy,
    canUndo,
    message,
    error,
    surprise,
    cancel,
    undo: () => {
      cancel();
      area.cancel();
      const snapshot = previous.current;
      if (snapshot) setScene((s) => ({ ...s, ...snapshot }));
      previous.current = null;
      setCanUndo(false);
      setError("");
      setMessage("Previous scene restored.");
    },
  };
}
