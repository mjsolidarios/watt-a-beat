import { useEffect, useRef, useState } from "react";
import type { SceneProps } from "./types";

type ExportState = {
  status:
    | "idle"
    | "checking"
    | "rendering"
    | "cancelling"
    | "cancelled"
    | "done"
    | "failed";
  progress: number;
  message: string;
  url?: string;
  filename?: string;
};

export function useVideoExport() {
  const [state, setState] = useState<ExportState>({
    status: "idle",
    progress: 0,
    message: "",
  });
  const controller = useRef<AbortController | null>(null);
  const downloadUrl = useRef("");
  useEffect(
    () => () => {
      controller.current?.abort();
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    },
    [],
  );

  const start = async (
    scene: SceneProps,
    audio: Blob | null,
    height: number,
    seconds: number,
    format: "mp4" | "webm",
  ) => {
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    const sourceUrl = audio ? URL.createObjectURL(audio) : "";
    if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    downloadUrl.current = "";
    setState({
      status: "checking",
      progress: 0,
      message: "Checking your browser…",
    });
    try {
      if (!scene.mapData)
        throw new Error("Wait for the map to load before exporting.");
      const [
        { canRenderMediaOnWeb, renderMediaOnWeb },
        { ExportScene, loadExportFont },
      ] = await Promise.all([
        import("@remotion/web-renderer"),
        import("./ExportScene"),
      ]);
      abort.signal.throwIfAborted();
      const width = height === 1080 ? 1920 : 1280;
      const options = { width, height, container: format, muted: !audio };
      const support = await canRenderMediaOnWeb(options);
      abort.signal.throwIfAborted();
      if (!support.canRender) {
        throw new Error(
          format === "mp4"
            ? "MP4 export isn’t supported in this browser. Choose WebM, or try Chrome or Edge."
            : "Video export isn’t supported in this browser. Try an updated Chrome or Edge browser over HTTPS.",
        );
      }
      const duration = Math.min(seconds, scene.duration);
      const props = {
        ...scene,
        exportFontCss: await loadExportFont(),
        audioSrc: sourceUrl,
        duration,
        onSelect: undefined,
        ripple: undefined,
        branding: true,
      };
      abort.signal.throwIfAborted();
      setState({
        status: "rendering",
        progress: 0,
        message: `Rendering ${format.toUpperCase()} on your device…`,
      });
      const result = await renderMediaOnWeb({
        composition: {
          id: "WattABeat",
          component: ExportScene,
          defaultProps: props,
          width,
          height,
          fps: 30,
          durationInFrames: Math.max(1, Math.round(duration * 30)),
        },
        inputProps: props,
        container: format,
        videoCodec: support.resolvedVideoCodec,
        audioCodec: support.resolvedAudioCodec,
        muted: !audio,
        signal: abort.signal,
        pageResponsiveness: "high",
        onProgress: ({ progress }) => {
          if (!abort.signal.aborted)
            setState((s) => ({ ...s, progress: Math.min(0.99, progress) }));
        },
      });
      abort.signal.throwIfAborted();
      const blob = await result.getBlob();
      abort.signal.throwIfAborted();
      downloadUrl.current = URL.createObjectURL(blob);
      const place = scene.mapData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      setState({
        status: "done",
        progress: 1,
        message: "Your video is ready.",
        url: downloadUrl.current,
        filename: `watt-a-beat-${place}-${Math.round(duration)}s.${format}`,
      });
    } catch (error) {
      setState({
        status: abort.signal.aborted ? "cancelled" : "failed",
        progress: 0,
        message: abort.signal.aborted
          ? "Export cancelled. You can start again."
          : error instanceof Error
            ? error.message
            : "Export failed. Try a shorter clip or 720p.",
      });
    } finally {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      if (controller.current === abort) controller.current = null;
    }
  };
  return {
    state,
    busy: ["checking", "rendering", "cancelling"].includes(state.status),
    start,
    cancel: () => {
      if (!controller.current) return;
      setState((s) => ({
        ...s,
        status: "cancelling",
        message: "Cancelling export…",
      }));
      controller.current.abort();
    },
  };
}
