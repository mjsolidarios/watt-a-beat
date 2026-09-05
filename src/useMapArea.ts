import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { SceneProps, LocationResult, MapData, MapView } from "./types";
import { nextView } from "./map-geometry.mjs";
export function useMapArea(
  scene: SceneProps,
  setScene: Dispatch<SetStateAction<SceneProps>>,
  isPanning = false,
) {
  const [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [pendingName, setPendingName] = useState("Iloilo City");
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const controller = useRef<AbortController | null>(null),
    generation = useRef(0),
    mode = useRef("selection");
  const last = useRef<{
    location: LocationResult | null;
    view?: MapView;
    preserve: boolean;
  }>({ location: null, preserve: false });
  const request = useCallback(
    async (
      location: LocationResult | null,
      view?: MapView,
      preserve = false,
    ) => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      const epoch = ++generation.current;
      last.current = { location, view, preserve };
      mode.current = preserve ? "view" : "selection";
      const start = sceneRef.current;
      setBusy(true);
      setError("");
      setPendingName(location?.name ?? "Iloilo City");
      try {
        const response = await fetch(
          location ? "/api/maps" : "/api/maps/default",
          location
            ? {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: location.token, view }),
                signal: abort.signal,
              }
            : { signal: abort.signal },
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Unable to load this area.");
        if (epoch !== generation.current) return;
        const current = sceneRef.current;
        if (
          preserve &&
          (current.mapData?.id !== start.mapData?.id ||
            current.zoom !== start.zoom ||
            current.pan.x !== start.pan.x ||
            current.pan.y !== start.pan.y)
        )
          return;
        const map = data as MapData;
        setScene((s) => ({
          ...s,
          mapData: map,
          zoom: 1,
          pan: { x: 0, y: 0 },
          selected: null,
          enabled: map.districts
            .filter(
              (d) =>
                !preserve ||
                !s.mapData?.districts.some((old) => old.name === d.name) ||
                s.enabled.includes(d.name),
            )
            .map((d) => d.name),
        }));
      } catch (e) {
        if (epoch === generation.current && !abort.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Unable to load this area.",
          );
      } finally {
        if (epoch === generation.current) {
          setBusy(false);
          mode.current = "";
        }
      }
    },
    [setScene],
  );
  useEffect(() => {
    void request(null);
    return () => controller.current?.abort();
  }, [request]);
  useEffect(() => {
    if (isPanning && mode.current === "view") {
      controller.current?.abort();
      generation.current++;
      mode.current = "";
      setBusy(false);
    }
    if (
      isPanning ||
      !scene.mapData ||
      (scene.zoom === 1 && scene.pan.x === 0 && scene.pan.y === 0)
    )
      return;
    const timer = setTimeout(() => {
      if (mode.current === "selection") return;
      void request(
        scene.mapData!.location,
        nextView(scene.mapData, scene.zoom, scene.pan),
        true,
      );
    }, 1200);
    return () => clearTimeout(timer);
  }, [
    scene.mapData?.id,
    scene.zoom,
    scene.pan.x,
    scene.pan.y,
    isPanning,
    request,
  ]);
  return {
    busy,
    error,
    pendingName,
    select: (location: LocationResult) => request(location),
    retry: () =>
      request(last.current.location, last.current.view, last.current.preserve),
  };
}
