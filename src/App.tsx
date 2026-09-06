import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import {
  ArrowCounterClockwise,
  ArrowUpRight,
  ArrowsOut,
  Check,
  CircleNotch,
  Crosshair,
  DownloadSimple,
  Headphones,
  Info,
  Minus,
  Moon,
  MusicNotes,
  Pause,
  Play,
  Plus,
  SlidersHorizontal,
  Snowflake,
  SpeakerHigh,
  SpeakerSlash,
  Sparkle,
  Lightning,
  CloudRain,
  UploadSimple,
  X,
  YoutubeLogo,
} from "@phosphor-icons/react";
import { MapScene } from "./MapScene";
import { defaultScene, type ColorMode, type SceneProps, type Theme } from "./types";
import { analyzeSamples } from "./audio-analysis.mjs";
import { isLightColor } from "./scene-effects.mjs";
import { useMapArea } from "./useMapArea";
import { useAudioPlayback } from "./useAudioPlayback";
import { LocationSearch } from "./LocationSearch";
import { TooltipLayer } from "./TooltipLayer";
import gsap from "gsap";

const formatTime = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;
const themes: { id: Theme; name: string; desc: string }[] = [
  { id: "midnight", name: "City lights", desc: "Amber street lights" },
  { id: "christmas", name: "Christmas", desc: "Red and green lights with snow" },
  { id: "moonlight", name: "Moonlight", desc: "Cool blue street lights" },
  { id: "rain", name: "Rain", desc: "Blue lights with rain" },
];

function extractYoutubeId(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/i,
    /^([A-Za-z0-9_-]{11})$/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

function createSyntheticEnvelopes(durationSec: number): number[][] {
  const frames = Math.max(1, Math.ceil(durationSec * 30));
  const result: number[][] = [];
  for (let f = 0; f < frames; f++) {
    const t = f / 30;
    // Rhythmic pulses to simulate music energy
    const beatPhase = ((t * 2.13) % 1);
    const bassPulse = Math.pow(Math.max(0, Math.sin(beatPhase * Math.PI * 2)), 2.2);
    const groove = 0.5 + 0.5 * Math.sin(t * 0.65);
    const bass = Math.min(1, 0.12 + bassPulse * (0.72 + groove * 0.22));
    const mid = Math.min(1, 0.1 + (0.45 + 0.5 * Math.sin(t * 1.9 + 1)) * (0.38 + bassPulse * 0.25));
    const treble = Math.min(1, 0.07 + Math.abs(Math.sin(t * 4.3)) * 0.32 + (Math.sin(t * 7.1) + 1) * 0.06);
    result.push([bass, mid, treble]);
  }
  return result;
}
export function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const panGesture = useRef<{
    x: number;
    y: number;
    pan: { x: number; y: number };
    scale: number;
  } | null>(null);
  const [scene, setScene] = useState<SceneProps>(defaultScene);
  const sceneElement = useRef<HTMLDivElement>(null);
  const [sceneWidth, setSceneWidth] = useState(1600);
  useEffect(() => {
    const element = sceneElement.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setSceneWidth(entry.contentRect.width),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [isPanning, setIsPanning] = useState(false);
  const area = useMapArea(scene, setScene, isPanning);
  const districtNames = useMemo(
    () => scene.mapData?.districts.map((d) => d.name) ?? [],
    [scene.mapData],
  );
  const [track, setTrack] = useState({
    name: "After hours",
    artist: "Demo track",
    isDemo: true,
  });
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [playing, setPlaying] = useState(false),
    [frame, setFrame] = useState(0),
    [muted, setMuted] = useState(false),
    [dragging, setDragging] = useState(false);
  const [youtubeId, setYoutubeId] = useState<string | null>(null);
  const [showYtInput, setShowYtInput] = useState(false);
  const [ytUrlInput, setYtUrlInput] = useState("");
  const ytPlayerRef = useRef<any>(null);
  const ytSyncRaf = useRef<number>(0);
  const [modal, setModal] = useState(false),
    [help, setHelp] = useState(false),
    [resolution, setResolution] = useState("1080"),
    [exportDuration, setExportDuration] = useState("full");
  const [job, setJob] = useState<{
    id: string;
    status: string;
    progress: number;
    error?: string;
  } | null>(null);
  const cancelRequested = useRef(false);
  const browserRecorderRef = useRef<MediaRecorder | null>(null);
  const [exportError, setExportError] = useState("");
  const player = useRef<PlayerRef>(null),
    upload = useRef<HTMLInputElement>(null),
    audioBytes = useRef<Blob | null>(null),
    loadId = useRef(0),
    blobUrl = useRef(""),
    transportRef = useRef<HTMLElement>(null),
    playBtnRef = useRef<HTMLButtonElement>(null),
    focusChipRef = useRef<HTMLButtonElement>(null);
  const totalFrames = Math.max(
    1,
    scene.envelopes.length || Math.round(scene.duration * 30),
  );
  const totalFramesRef = useRef(totalFrames);
  useEffect(() => { totalFramesRef.current = totalFrames; }, [totalFrames]);
  const {
    audio: previewAudio,
    toggle: toggleAudio,
    seek: seekAudio,
  } = useAudioPlayback({
    src: scene.audioSrc,
    totalFrames,
    player,
    onFrame: setFrame,
    onPlaying: setPlaying,
    onError: setError,
  });

  // YouTube playback helpers (audio sourced live from YouTube, no download/extract)
  const ensureYoutubeApi = () =>
    new Promise<void>((resolve, reject) => {
      const w = window as any;
      if (w.YT && w.YT.Player) {
        resolve();
        return;
      }
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const first = document.getElementsByTagName("script")[0];
      first?.parentNode?.insertBefore(tag, first);
      const prev = w.onYouTubeIframeAPIReady;
      w.onYouTubeIframeAPIReady = () => {
        if (prev) prev();
        resolve();
      };
      tag.onerror = () => reject(new Error("YT API load failed"));
      // safety timeout
      setTimeout(() => {
        if (w.YT && w.YT.Player) resolve();
      }, 8000);
    });

  const stopYtSyncRef = useCallback(() => {
    if (ytSyncRaf.current) {
      cancelAnimationFrame(ytSyncRaf.current);
      ytSyncRaf.current = 0;
    }
  }, []);
  const syncFrameFromYt = useCallback(() => {
    const p = ytPlayerRef.current;
    if (!p || typeof p.getCurrentTime !== "function") return;
    const t = p.getCurrentTime() || 0;
    const tf = totalFramesRef.current || totalFrames;
    const fr = Math.min(tf - 1, Math.max(0, Math.floor(t * 30)));
    setFrame(fr);
    player.current?.seekTo(fr);
  }, [totalFrames]);
  const startYtSync = useCallback(() => {
    stopYtSyncRef();
    const tick = () => {
      syncFrameFromYt();
      ytSyncRaf.current = requestAnimationFrame(tick);
    };
    ytSyncRaf.current = requestAnimationFrame(tick);
  }, [stopYtSyncRef, syncFrameFromYt]);

  const loadYoutube = useCallback(async (rawUrl: string) => {
    const id = extractYoutubeId(rawUrl.trim());
    if (!id) {
      setError("Enter a valid YouTube URL (youtu.be or youtube.com).");
      return;
    }
    const loadToken = ++loadId.current;
    setLoading(true);
    setError("");
    setShowYtInput(false);
    setYtUrlInput("");
    previewAudio.current?.pause();
    stopYtSyncRef();
    // teardown previous YT
    if (ytPlayerRef.current) {
      try { ytPlayerRef.current.destroy?.(); } catch {}
      ytPlayerRef.current = null;
    }
    // teardown file
    if (blobUrl.current) {
      URL.revokeObjectURL(blobUrl.current);
      blobUrl.current = "";
    }
    audioBytes.current = null;
    setYoutubeId(id);
    setTrack({ name: "Loading YouTube…", artist: "YouTube", isDemo: false });
    // provisional scene (synthetic reactivity)
    const provisionalDur = 120;
    setScene((s) => ({
      ...s,
      audioSrc: "",
      envelopes: createSyntheticEnvelopes(provisionalDur),
      duration: provisionalDur,
    }));
    setFrame(0);
    player.current?.seekTo(0);

    // Ensure YT IFrame API is ready
    try {
      await ensureYoutubeApi();
    } catch {
      if (loadToken === loadId.current) {
        setError("Could not load YouTube player.");
        setLoading(false);
      }
      return;
    }

    // Find or create offscreen container for the player (we only need its audio)
    let container = document.getElementById("yt-audio-host");
    if (!container) {
      container = document.createElement("div");
      container.id = "yt-audio-host";
      container.style.position = "absolute";
      container.style.width = "1px";
      container.style.height = "1px";
      container.style.left = "-9999px";
      container.style.top = "-9999px";
      document.body.appendChild(container);
    }

    // Create the player
    try {
      ytPlayerRef.current = new (window as any).YT.Player("yt-audio-host", {
        height: "1",
        width: "1",
        videoId: id,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
        },
        events: {
          onReady: (ev: any) => {
            if (loadToken !== loadId.current) return;
            const p = ev.target;
            let dur = 0;
            try { dur = p.getDuration() || 0; } catch {}
            dur = Math.min(Math.max(dur || 120, 10), 600); // cap at 10 min
            const data = p.getVideoData?.() || {};
            const title = data.title || "YouTube audio";
            const author = data.author || "YouTube";
            setTrack({ name: title, artist: author, isDemo: false });
            const envs = createSyntheticEnvelopes(dur);
            setScene((s) => ({
              ...s,
              audioSrc: "",
              envelopes: envs,
              duration: dur,
            }));
            setFrame(0);
            player.current?.seekTo(0);
            if (muted) { try { p.mute?.(); } catch {} }
            setLoading(false);
          },
          onStateChange: (ev: any) => {
            if (loadToken !== loadId.current) return;
            const YT = (window as any).YT;
            const state = ev.data;
            if (state === YT.PlayerState.PLAYING) {
              setPlaying(true);
              startYtSync();
            } else if (state === YT.PlayerState.PAUSED || state === YT.PlayerState.ENDED || state === YT.PlayerState.BUFFERING) {
              setPlaying(false);
              stopYtSyncRef();
              syncFrameFromYt();
            }
          },
          onError: (ev: any) => {
            if (loadToken !== loadId.current) return;
            setError("YouTube player error (video may be unavailable or restricted).");
            setLoading(false);
            setYoutubeId(null);
          },
        },
      });
    } catch (e) {
      if (loadToken === loadId.current) {
        setError("Failed to initialize YouTube playback.");
        setLoading(false);
        setYoutubeId(null);
      }
    }
  }, [stopYtSyncRef, startYtSync, syncFrameFromYt]);

  // Keep YT volume in sync with mute toggle
  useEffect(() => {
    const p = ytPlayerRef.current;
    if (!p || !youtubeId) return;
    try {
      if (muted) {
        p.mute?.();
      } else {
        p.unMute?.();
        p.setVolume?.(100);
      }
    } catch {}
  }, [muted, youtubeId]);

  const update = <K extends keyof SceneProps>(key: K, value: SceneProps[K]) =>
    setScene((s) => ({ ...s, [key]: value }));
  const loadAudio = useCallback(
    async (blob: Blob, name: string, isDemo: boolean) => {
      const id = ++loadId.current;
      setLoading(true);
      setError("");
      previewAudio.current?.pause();
      // Switch away from YouTube source
      setYoutubeId(null);
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy?.(); } catch {}
        ytPlayerRef.current = null;
      }
      stopYtSyncRef();
      let context: AudioContext | undefined;
      try {
        if (blob.size > 60 * 1024 * 1024)
          throw new Error("Please choose an audio file smaller than 60 MB.");
        context = new AudioContext();
        const buffer = await context.decodeAudioData(await blob.arrayBuffer());
        if (buffer.duration > 300)
          throw new Error(
            "Choose a track no longer than 5 minutes.",
          );
        const mono = new Float32Array(buffer.length);
        for (let c = 0; c < buffer.numberOfChannels; c++) {
          const channel = buffer.getChannelData(c);
          for (let i = 0; i < mono.length; i++)
            mono[i] += channel[i] / buffer.numberOfChannels;
        }
        const envelopes = analyzeSamples(mono, buffer.sampleRate);
        if (id !== loadId.current) return;
        // Keep the composition length aligned with the analyzed audio frames.
        const duration = envelopes.length / 30;
        const url = URL.createObjectURL(blob);
        if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
        blobUrl.current = url;
        audioBytes.current = blob;
        setScene((s) => ({
          ...s,
          audioSrc: url,
          envelopes,
          duration,
        }));
        setTrack({
          name: name.replace(/\.[^.]+$/, ""),
          artist: isDemo ? "Demo track" : "Uploaded track",
          isDemo,
        });
        setFrame(0);
        player.current?.seekTo(0);
        setJob((j) =>
          j && ["uploading", "queued", "rendering", "cancelling"].includes(j.status)
            ? j
            : null,
        );
      } catch (e) {
        if (id === loadId.current)
          setError(
            e instanceof Error
              ? e.message
              : "This audio could not be opened. Try an MP3 or WAV file.",
          );
      } finally {
        await context?.close();
        if (id === loadId.current) setLoading(false);
      }
    },
    [],
  );
  useEffect(() => {
    let active = true;
    const initialLoadId = loadId.current;
    fetch("/after-hours.wav")
      .then((r) => {
        if (!r.ok)
          throw new Error("Demo audio unavailable. Upload a track to begin.");
        return r.blob();
      })
      .then((b) => {
        if (active && loadId.current === initialLoadId) {
          void loadAudio(b, "After hours", true);
        }
      })
      .catch((e) => {
        if (active && loadId.current === initialLoadId) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [loadAudio]);
  useEffect(
    () => () => {
      loadId.current++;
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
      stopYtSyncRef();
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy?.(); } catch {}
        ytPlayerRef.current = null;
      }
    },
    [stopYtSyncRef],
  );
  // GSAP entrance for floating transport (studio glassy dock)
  useEffect(() => {
    const el = transportRef.current;
    if (!el) return;
    gsap.fromTo(
      el,
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.6, ease: "power3.out", delay: 0.15 }
    );
  }, []);

  // GSAP micro animation on play button toggle
  useEffect(() => {
    const btn = playBtnRef.current;
    if (!btn || loading) return;
    gsap.to(btn, {
      scale: 0.88,
      duration: 0.08,
      ease: "power2.in",
      onComplete: () => {
        gsap.to(btn, { scale: 1, duration: 0.28, ease: "back.out(2)" });
      },
    });
  }, [playing, loading]);
  const togglePlay = useCallback(() => {
    if (loading) return;
    if (youtubeId && ytPlayerRef.current) {
      const p = ytPlayerRef.current;
      const YT = (window as any).YT;
      const st = p.getPlayerState ? p.getPlayerState() : 0;
      if (st === (YT?.PlayerState?.PLAYING ?? 1)) {
        p.pauseVideo();
      } else {
        p.playVideo();
      }
      return;
    }
    toggleAudio();
  }, [loading, youtubeId, toggleAudio]);

  const seekToFrame = useCallback((requested: number) => {
    const fr = Math.max(0, Math.min(totalFrames - 1, requested));
    if (youtubeId && ytPlayerRef.current) {
      const p = ytPlayerRef.current;
      p.seekTo(fr / 30, true);
      setFrame(fr);
      player.current?.seekTo(fr);
      return;
    }
    seekAudio(fr);
  }, [youtubeId, totalFrames, seekAudio]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (
        e.code === "Space" &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLButtonElement ||
          e.target instanceof HTMLSelectElement
        ) &&
        !modal &&
        !help &&
        !settingsOpen
      ) {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === "Escape") {
        setModal(false);
        setHelp(false);
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [togglePlay, modal, help, settingsOpen]);
  useEffect(() => {
    if (!job?.id || !["queued", "rendering", "cancelling"].includes(job.status))
      return;
    let active = true,
      polling = false;
    const interval = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const res = await fetch(`/api/exports/${job.id}`);
        if (!res.ok) throw new Error("Could not check export progress.");
        const result = await res.json();
        if (active) {
          setJob((j) => {
            if (j?.id !== job.id || j.status !== job.status) return j;
            if (j.status === "cancelling" && ["queued", "rendering"].includes(result.status))
              return j;
            return result;
          });
          setExportError("");
        }
      } catch (e) {
        if (active)
          setExportError(e instanceof Error ? e.message : "Connection lost");
      } finally {
        polling = false;
      }
    }, 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [job?.id, job?.status]);
  const selectDistrict = useCallback(
    (name: string) =>
      setScene((s) => ({ ...s, selected: s.selected === name ? null : name })),
    [],
  );
  const inputProps = useMemo(
    () => ({ ...scene, audioSrc: "", onSelect: selectDistrict, branding: false }),
    [scene, selectDistrict],
  );
  const waveform = useMemo(
    () =>
      Array.from({ length: 120 }, (_, i) => {
        const chunk =
          scene.envelopes[
            Math.min(
              scene.envelopes.length - 1,
              Math.floor((i * scene.envelopes.length) / 120),
            )
          ];
        return chunk ? Math.max(0.08, ...chunk) : 0.15;
      }),
    [scene.envelopes],
  );
  const receiveFile = (file?: File) => {
    if (file) void loadAudio(file, file.name, false);
  };
  const requestCancellation = async (id: string, previousStatus: string) => {
    try {
      const res = await fetch(`/api/exports/${id}/cancel`, { method: "POST" });
      const result = await res.json();
      if (!res.ok)
        throw new Error(result.error || "Could not cancel export. Try again.");
      setJob((j) => (j?.id === id && j.status === "cancelling" ? result : j));
    } catch (e) {
      cancelRequested.current = false;
      setExportError(
        e instanceof Error ? e.message : "Could not cancel export. Try again.",
      );
      setJob((j) =>
        j?.id === id && j.status === "cancelling"
          ? { ...j, status: previousStatus }
          : j,
      );
    }
  };
  const cancelExport = async () => {
    if (!job || cancelRequested.current) return;
    cancelRequested.current = true;
    setExportError("");
    setJob({ ...job, status: "cancelling" });
    // Let the upload return its job ID so cancellation cannot orphan a render.
    if (job.id) await requestCancellation(job.id, job.status);
  };
  const exportVideo = async () => {
    if (!audioBytes.current) return;
    cancelRequested.current = false;
    setExportError("");
    setJob({ id: "", status: "uploading", progress: 0 });
    try {
      const form = new FormData();
      form.append("audio", audioBytes.current, "track.wav");
      form.append(
        "settings",
        JSON.stringify({
          ...scene,
          mapData: undefined,
          mapId: scene.mapData?.id,
          audioSrc: "",
          selected: null,
          duration:
            exportDuration === "full"
              ? scene.duration
              : Math.min(10, scene.duration),
          resolution: Number(resolution),
        }),
      );
      const res = await fetch("/api/exports", { method: "POST", body: form });
      const result = await res.json();
      if (!res.ok) {
        // Server-side export not available (e.g. Vercel). Fall back to browser recording.
        const msg = result?.error || "";
        if (msg.includes("not available") || msg.includes("not supported") || res.status === 501) {
          setJob(null);
          void exportInBrowser();
          return;
        }
        throw new Error(msg || "Export failed.");
      }
      if (cancelRequested.current) {
        setJob({ ...result, status: "cancelling" });
        await requestCancellation(result.id, result.status);
      } else setJob(result);
    } catch (e) {
      // If server call itself fails (network, HTML instead of JSON, etc.), offer browser export
      const message = e instanceof Error ? e.message : "Export failed.";
      if (message.includes("JSON") || message.toLowerCase().includes("unexpected")) {
        setJob(null);
        void exportInBrowser();
        return;
      }
      setJob({
        id: "",
        status: "failed",
        progress: 0,
        error: message || "Export failed. Please try again.",
      });
    }
  };

  const getSupportedMimeType = () => {
    // Firefox does not support vp9 in MediaRecorder in many versions.
    // Chrome supports vp9 well. We try high quality first, then fall back.
    const candidates = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return undefined;
  };

  const exportInBrowser = async () => {
    setExportError("");
    setJob({ id: "browser", status: "recording", progress: 0 });

    const durationSec =
      exportDuration === "full" ? scene.duration : Math.min(10, scene.duration);
    const targetWidth = resolution === "1080" ? 1920 : 1280;
    const targetHeight = Number(resolution);

    let exportCanvas: HTMLCanvasElement | null = null;
    let audioEl: HTMLAudioElement | null = null;
    let audioCtx: AudioContext | null = null;
    let combinedStream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    let stopTimer: number | null = null;

    try {
      // Create high-resolution canvas for direct capture (no screen sharing)
      exportCanvas = document.createElement("canvas");
      exportCanvas.width = targetWidth;
      exportCanvas.height = targetHeight;

      const videoStream = exportCanvas.captureStream(30);

      // Prepare audio for recording
      audioEl = new Audio();
      audioEl.src = URL.createObjectURL(audioBytes.current!);
      audioEl.volume = muted ? 0 : 1;

      audioCtx = new AudioContext();
      const source = audioCtx.createMediaElementSource(audioEl);
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);
      source.connect(audioCtx.destination); // also hear it while exporting

      combinedStream = new MediaStream([
        ...videoStream.getTracks(),
        ...dest.stream.getTracks(),
      ]);

      const mimeType = getSupportedMimeType();
      recorder = new MediaRecorder(combinedStream, mimeType ? { mimeType } : undefined);
      browserRecorderRef.current = recorder;

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const actualType = recorder?.mimeType || mimeType || "video/webm";
        const blob = new Blob(chunks, { type: actualType });

        const ext = actualType.includes("mp4") ? "mp4" : "webm";
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `watt-a-beat-${(scene.mapData?.name || "map").toLowerCase().replace(/\s+/g, "-")}-${exportDuration}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        // Cleanup
        if (audioEl) {
          audioEl.pause();
          URL.revokeObjectURL(audioEl.src);
        }
        if (audioCtx) audioCtx.close().catch(() => {});
        if (combinedStream) combinedStream.getTracks().forEach((t) => t.stop());

        browserRecorderRef.current = null;
        setJob(null);
        setModal(false);
      };

      // Helper to rasterize current preview to the export canvas
      const drawFrame = async () => {
        if (!exportCanvas) return;
        const ctx = exportCanvas.getContext("2d", { alpha: false })!;
        ctx.fillStyle = "#101615";
        ctx.fillRect(0, 0, targetWidth, targetHeight);

        const svg = document.querySelector(".scene-player svg") as SVGSVGElement | null;
        if (!svg) return;

        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svg);
        const blob = new Blob([svgString], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);

        await new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
            URL.revokeObjectURL(url);
            resolve();
          };
          img.src = url;
        });
      };

      recorder.start();

      // Pause normal playback and take control
      previewAudio.current?.pause();
      player.current?.seekTo(0);

      // Start audio (muted visually if needed, but we capture the stream)
      await audioEl.play();

      // Drive export by advancing time and capturing frames
      const startTime = performance.now();
      const tick = async () => {
        if (!recorder || recorder.state !== "recording") return;

        const elapsed = (performance.now() - startTime) / 1000;
        if (elapsed >= durationSec) {
          if (recorder.state === "recording") recorder.stop();
          return;
        }

        const currentFrame = Math.floor(elapsed * 30);
        player.current?.seekTo(currentFrame);

        // Wait for React/Remotion to render the frame
        await new Promise((r) => requestAnimationFrame(r));
        await new Promise((r) => requestAnimationFrame(r));

        await drawFrame();

        // Update rough progress
        setJob((j) =>
          j ? { ...j, progress: Math.min(0.99, elapsed / durationSec) } : j
        );

        requestAnimationFrame(tick);
      };

      // Start the capture loop
      requestAnimationFrame(tick);

      // Safety timeout
      stopTimer = window.setTimeout(() => {
        if (recorder && recorder.state === "recording") {
          recorder.stop();
        }
      }, (durationSec + 1) * 1000);

    } catch (e) {
      // Cleanup on error
      if (audioEl) {
        audioEl.pause();
        if (audioEl.src) URL.revokeObjectURL(audioEl.src);
      }
      if (audioCtx) audioCtx.close().catch(() => {});
      if (combinedStream) combinedStream.getTracks().forEach((t) => t.stop());
      if (stopTimer) clearTimeout(stopTimer);
      browserRecorderRef.current = null;

      if ((e as Error)?.name === "NotAllowedError") {
        setExportError("Export cancelled.");
      } else if (e instanceof Error && /unsupported codec|MediaRecorder/i.test(e.message)) {
        setExportError("Your browser does not support video recording in this format. Try Chrome or Edge.");
      } else {
        setExportError(e instanceof Error ? e.message : "Could not export in browser.");
      }
      setJob(null);
    }
  };
  const exportBusy =
    !!job &&
    ["uploading", "queued", "rendering", "cancelling", "recording"].includes(job.status);
  return (
    <div className="app-shell">
      <TooltipLayer />
      <audio
        ref={previewAudio}
        src={scene.audioSrc || undefined}
        preload="auto"
        loop
        muted={muted}
        onError={() =>
          setError("This audio could not be played. Try another MP3 or WAV file.")
        }
      />
      <input
        ref={upload}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac"
        hidden
        onChange={(e) => {
          receiveFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <header className="header">
        <a href="/" className="brand" aria-label="Watt a Beat home">
          <span className="brand-symbol">
            <Lightning size={25} weight="fill" />
          </span>
          <span className="brand-copy">
            <span className="brand-name">Watt a Beat</span>
          </span>
          <span className="brand-divider" />
          <span className="brand-place" data-tooltip={scene.mapData?.name}>
            {scene.mapData?.name ?? "Philippines"}
          </span>
        </a>
        <div className="header-right">
          <button
            className="icon-button help-button"
            aria-label="How to use Watt a Beat"
            data-tooltip="How to use Watt a Beat"
            onClick={() => setHelp(true)}
          >
            <Info size={20} />
          </button>
          <button
            className="icon-button settings-button"
            aria-label="Map settings"
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            data-tooltip="Map settings"
            onClick={() => setSettingsOpen(true)}
          >
            <SlidersHorizontal size={21} />
          </button>
          {/* Export button hidden for now — separate export server planned */} 
        </div>
      </header>
      <main>
        <section className="workspace" aria-label="Map preview and playback">
          <div
            className={`map-frame ${dragging ? "file-dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (e.dataTransfer.types.includes("Files")) setDragging(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node))
                setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              receiveFile(e.dataTransfer.files[0]);
            }}
            onPointerDown={(e) => {
              if (
                e.button !== 0 ||
                (e.target as Element).closest('button,a,input,[role="button"]')
              )
                return;
              const rect = e.currentTarget
                .querySelector(".scene-player")!
                .getBoundingClientRect();
              panGesture.current = {
                x: e.clientX,
                y: e.clientY,
                pan: scene.pan,
                scale: rect.width / 1600,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
              setIsPanning(true);
            }}
            onPointerMove={(e) => {
              const gesture = panGesture.current;
              if (!gesture) return;
              update("pan", {
                x: Math.max(
                  -900,
                  Math.min(
                    900,
                    gesture.pan.x + (e.clientX - gesture.x) / gesture.scale,
                  ),
                ),
                y: Math.max(
                  -650,
                  Math.min(
                    650,
                    gesture.pan.y + (e.clientY - gesture.y) / gesture.scale,
                  ),
                ),
              });
            }}
            onPointerUp={() => {
              panGesture.current = null;
              setIsPanning(false);
            }}
            onPointerCancel={() => {
              panGesture.current = null;
              setIsPanning(false);
            }}
          >
            <div className="scene-player" ref={sceneElement}>
              <Player
                ref={player}
                component={MapScene}
                inputProps={inputProps}
                durationInFrames={totalFrames}
                fps={30}
                compositionWidth={1600}
                compositionHeight={900}
                style={{ width: "100%", height: "100%" }}
                controls={false}
                clickToPlay={false}
                spaceKeyToPlayOrPause={false}
                numberOfSharedAudioTags={0}
                acknowledgeRemotionLicense
              />
            </div>
            <LocationSearch
              current={scene.mapData?.name ?? ""}
              onSelect={area.select}
            />
            {(area.busy || area.error || scene.mapData?.roadCount === 0) && (
              <div
                className="area-notice"
                role={area.error ? "alert" : "status"}
              >
                {area.busy ? (
                  <>
                    <CircleNotch className="spin" size={15} /> Loading{" "}
                    {area.pendingName}…
                  </>
                ) : area.error ? (
                  <>
                    {area.error}
                    <button onClick={area.retry}>Retry</button>
                  </>
                ) : (
                  "No mapped streets in this view. Try another area."
                )}
              </div>
            )}
            <button
              className="map-upload"
              onClick={() => upload.current?.click()}
              disabled={loading}
              data-tooltip="Audio file (MP3/WAV/etc) or click YouTube icon for video link"
            >
              <UploadSimple size={21} />
              <span>
                {loading
                  ? "Loading audio…"
                  : dragging
                    ? "Release to load audio"
                    : "Drop an audio file on the map"}{" "}
                <span className="browse-copy">
                  or <u>browse files</u> · <u>YouTube</u>
                </span>
              </span>
            </button>
            {error && (
              <div className="map-error" role="alert">
                {error}
                <button
                  className="icon-button"
                  aria-label="Dismiss audio error"
                  onClick={() => setError("")}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            <div className="compass">
              <span>N</span>
              <span className="compass-arrow">↑</span>
            </div>
            <div className="map-controls">
              <button
                aria-label="Zoom in"
                data-tooltip="Zoom in"
                disabled={
                  area.busy ||
                  !scene.mapData ||
                  scene.mapData.view.widthKm / scene.zoom <= 2.05 ||
                  scene.zoom >= 2.2
                }
                onClick={() => update("zoom", Math.min(2.2, scene.zoom + 0.2))}
              >
                <Plus size={17} />
              </button>
              <button
                aria-label="Zoom out"
                data-tooltip="Zoom out"
                disabled={
                  area.busy ||
                  !scene.mapData ||
                  scene.mapData.view.widthKm / scene.zoom >= 19.95 ||
                  scene.zoom <= 0.8
                }
                onClick={() => update("zoom", Math.max(0.8, scene.zoom - 0.2))}
              >
                <Minus size={17} />
              </button>
              <span />
              <button
                aria-label="Reset map view"
                data-tooltip="Reset map view"
                onClick={() =>
                  setScene((s) => ({
                    ...s,
                    zoom: 1,
                    pan: { x: 0, y: 0 },
                    selected: null,
                  }))
                }
              >
                <Crosshair size={18} />
              </button>
            </div>
            {scene.selected && (
              <button
                ref={focusChipRef}
                className="focus-chip"
                onClick={() => update("selected", null)}
              >
                {scene.selected}
                <X size={12} />
              </button>
            )}
            <button
              className="fullscreen-button"
              aria-label="Fullscreen map"
              data-tooltip="Fullscreen map"
              onClick={() => {
                player.current?.requestFullscreen();
              }}
            >
              <ArrowsOut size={18} />
            </button>
            <div className="map-scale">
              <span
                style={{
                  width:
                    (sceneWidth / (scene.mapData?.view.widthKm ?? 14)) *
                    scene.zoom *
                    ((scene.mapData?.view.widthKm ?? 14) / scene.zoom < 5
                      ? 0.25
                      : 1),
                }}
              />
              {(scene.mapData?.view.widthKm ?? 14) / scene.zoom < 5
                ? "250 m"
                : "1 km"}
            </div>
          </div>
          <section className="transport" aria-label="Audio playback" ref={transportRef}>
            <div className="track-row">
              <div className="track-art">
                <MusicNotes size={22} />
              </div>
              <div className="track-details">
                <strong>
                  {loading ? "Loading audio…" : track.name}
                </strong>
                <span>
                  {track.artist}
                  {track.isDemo && <span className="demo-tag">DEMO</span>}
                  {youtubeId && <span className="demo-tag" style={{borderColor:"#9a6b4a",color:"#d4a67f"}}>YOUTUBE</span>}
                </span>
              </div>
              <button
                className="icon-button"
                aria-label="Replace soundtrack"
                data-tooltip="Replace soundtrack"
                onClick={() => upload.current?.click()}
              >
                <UploadSimple size={17} />
              </button>
              <button
                className="icon-button"
                aria-label="Load from YouTube"
                data-tooltip="Load audio from a YouTube video URL"
                onClick={() => {
                  setShowYtInput((v) => {
                    const next = !v;
                    if (next) setYtUrlInput("");
                    return next;
                  });
                }}
              >
                <YoutubeLogo size={17} />
              </button>
            </div>
            {showYtInput && (
              <div
                style={{
                  gridColumn: "1 / -1",
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  margin: "8px 0 4px",
                  padding: "6px 8px",
                  background: "#0f1613",
                  border: "1px solid #3a4639",
                  borderRadius: 8,
                }}
              >
                <input
                  type="text"
                  value={ytUrlInput}
                  onChange={(e) => setYtUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      void loadYoutube(ytUrlInput);
                    }
                    if (e.key === "Escape") {
                      setShowYtInput(false);
                    }
                  }}
                  placeholder="https://youtube.com/watch?v=... or youtu.be/..."
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    color: "inherit",
                    fontSize: 12,
                    outline: "none",
                  }}
                  autoFocus
                />
                <button
                  onClick={() => void loadYoutube(ytUrlInput)}
                  disabled={!ytUrlInput.trim() || loading}
                  style={{
                    fontSize: 11,
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "1px solid #5c6b52",
                    background: "#1f2923",
                    color: "#d9e3d0",
                  }}
                >
                  Load
                </button>
                <button
                  onClick={() => {
                    setShowYtInput(false);
                    setYtUrlInput("");
                  }}
                  style={{
                    fontSize: 11,
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid #3a4639",
                    background: "transparent",
                    color: "#a3ac9f",
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
            <div className="waveform-row">
              <button
                ref={playBtnRef}
                className="play-button"
                aria-label={playing ? "Pause" : "Play"}
                onClick={togglePlay}
                disabled={loading}
              >
                {loading ? (
                  <CircleNotch size={20} className="spin" />
                ) : playing ? (
                  <Pause size={19} weight="fill" />
                ) : (
                  <Play size={19} weight="fill" />
                )}
              </button>
              <div className="waveform">
                <div className="waveform-bars" aria-hidden="true">
                  {waveform.map((v, i) => (
                    <span
                      key={i}
                      style={{
                        height: `${Math.max(10, v * 100)}%`,
                        background:
                          i / 120 < frame / totalFrames ? "#dfc48d" : undefined,
                      }}
                    />
                  ))}
                </div>
                <input
                  type="range"
                  min="0"
                  max={totalFrames - 1}
                  value={frame}
                  aria-label="Playback position"
                  onChange={(e) => seekToFrame(Number(e.target.value))}
                />
                <div
                  className="playhead"
                  style={{ left: `${(frame / totalFrames) * 100}%` }}
                />
              </div>
              <span className="timecode">
                {formatTime(frame / 30)}
                <span> / {formatTime(scene.duration)}</span>
              </span>
            </div>
            <div className="dock-themes">
              <button
                className="icon-button volume-button"
                aria-label={muted ? "Unmute" : "Mute"}
                data-tooltip={muted ? "Unmute" : "Mute"}
                onClick={() => {
                  const next = !muted;
                  setMuted(next);
                  if (youtubeId && ytPlayerRef.current) {
                    try {
                      ytPlayerRef.current.setVolume?.(next ? 0 : 100);
                      if (next) ytPlayerRef.current.mute?.(); else ytPlayerRef.current.unMute?.();
                    } catch {}
                  }
                }}
              >
                {muted ? <SpeakerSlash size={20} /> : <SpeakerHigh size={20} />}
              </button>
              <ThemePicker
                theme={scene.theme}
                onChange={(theme) => update("theme", theme)}
              />
            </div>
            <div className="transport-footer">
              <span data-tooltip="Best experienced with headphones">
                <Headphones size={13} />
              </span>
              <span>
                <kbd>space</kbd> to play or pause
              </span>
            </div>
          </section>
          <div className="workspace-footer">
            <span>A music-reactive map of the Philippines.</span>
            <span>
              Created with React + Remotion <ArrowUpRight size={12} />
            </span>
          </div>
        </section>
        {settingsOpen && (
          <Modal
            title="Map settings"
            className="settings-modal"
            description="Shape how your map responds to music."
            onClose={() => setSettingsOpen(false)}
          >
            <aside className="sidebar">
              <section
                className="control-section"
                data-panel="effects"
                id="panel-effects"
              >
                <div className="section-label">
                  <h3>Light & response</h3>
                </div>
                <div className="slider-group">
                  <label htmlFor="intensity">
                    Glow intensity
                    <output htmlFor="intensity">{scene.intensity}%</output>
                  </label>
                  <input
                    id="intensity"
                    type="range"
                    min="0"
                    max="100"
                    value={scene.intensity}
                    aria-valuetext={`${scene.intensity} percent`}
                    style={
                      {
                        "--range": `${scene.intensity}%`,
                      } as React.CSSProperties
                    }
                    onChange={(e) => update("intensity", +e.target.value)}
                  />
                </div>
                <div className="slider-group">
                  <label htmlFor="sensitivity">
                    Audio sensitivity
                    <output htmlFor="sensitivity">{scene.sensitivity}%</output>
                  </label>
                  <input
                    id="sensitivity"
                    type="range"
                    min="0"
                    max="100"
                    value={scene.sensitivity}
                    aria-valuetext={`${scene.sensitivity} percent`}
                    style={
                      {
                        "--range": `${scene.sensitivity}%`,
                      } as React.CSSProperties
                    }
                    onChange={(e) => update("sensitivity", +e.target.value)}
                  />
                  <div className="range-labels">
                    <span>Subtle</span>
                    <span>Reactive</span>
                  </div>
                </div>
                <div className="color-modes">
                  <span id="light-color-label">Light color</span>
                  <div
                    className="color-segments"
                    role="group"
                    aria-labelledby="light-color-label"
                  >
                    {(
                      [
                        { id: "theme", name: "Theme" },
                        { id: "custom", name: "Custom" },
                        { id: "random", name: "Random" },
                      ] as { id: ColorMode; name: string }[]
                    ).map((mode) => (
                      <button
                        aria-pressed={scene.colorMode === mode.id}
                        className={scene.colorMode === mode.id ? "on" : ""}
                        key={mode.id}
                        onClick={() => update("colorMode", mode.id)}
                      >
                        {mode.name}
                      </button>
                    ))}
                  </div>
                </div>
                {scene.colorMode === "custom" && (
                  <div className="color-row">
                    <input
                      type="color"
                      aria-label="Custom light color"
                      value={
                        isLightColor(scene.lightColor)
                          ? scene.lightColor
                          : "#e6c283"
                      }
                      onChange={(e) => update("lightColor", e.target.value)}
                    />
                    <code>
                      {isLightColor(scene.lightColor)
                        ? scene.lightColor
                        : "#e6c283"}
                    </code>
                  </div>
                )}
                {scene.colorMode === "random" && (
                  <p className="area-hint">
                    Each district lights up in its own color.
                  </p>
                )}
                <Toggle
                  label="Map labels"
                  checked={scene.labels}
                  onChange={() => update("labels", !scene.labels)}
                />
                {(scene.theme === "christmas" || scene.theme === "rain") && (
                  <>
                    <Toggle
                      label={scene.theme === "rain" ? "Rainfall" : "Snowfall"}
                      checked={scene.particles}
                      onChange={() => update("particles", !scene.particles)}
                    />
                    <p className="area-hint">
                      Rain and snow animate while the track plays and appear in exports.
                    </p>
                  </>
                )}
              </section>
              <section
                className="control-section areas-section"
                data-panel="power"
                id="panel-power"
              >
                <div className="section-label">
                  <h3>District power</h3>
                  <span>
                    {scene.enabled.length} of {districtNames.length} on
                  </span>
                </div>
                <p className="power-description">
                  Choose which districts light up to the beat.
                </p>
                <div
                  className="district-chips"
                  role="group"
                  aria-label="District power"
                >
                  {districtNames.map((name) => (
                    <button
                      aria-pressed={scene.enabled.includes(name)}
                      className={scene.enabled.includes(name) ? "on" : ""}
                      key={name}
                      onClick={() =>
                        update(
                          "enabled",
                          scene.enabled.includes(name)
                            ? scene.enabled.filter((n) => n !== name)
                            : [...scene.enabled, name],
                        )
                      }
                    >
                      <span className="district-check" aria-hidden="true">
                        {scene.enabled.includes(name) ? (
                          <Check size={12} weight="bold" />
                        ) : (
                          <Minus size={12} />
                        )}
                      </span>
                      {name}
                    </button>
                  ))}
                </div>
                <div className="power-actions">
                  <button
                    className="text-button"
                    disabled={scene.enabled.length === 0}
                    onClick={() => update("enabled", [])}
                  >
                    <Lightning size={16} weight="regular" />
                    Cut all power
                  </button>
                  <button
                    className="text-button"
                    disabled={scene.enabled.length === districtNames.length}
                    onClick={() => update("enabled", districtNames)}
                  >
                    <ArrowCounterClockwise size={16} weight="regular" />
                    Reconnect all
                  </button>
                </div>
              </section>
            </aside>
            <footer className="settings-footer">
              <button
                className="settings-reset"
                onClick={() =>
                  setScene((s) => ({
                    ...defaultScene,
                    mapData: s.mapData,
                    enabled: s.mapData?.districts.map((d) => d.name) ?? [],
                    audioSrc: s.audioSrc,
                    envelopes: s.envelopes,
                    duration: s.duration,
                  }))
                }
              >
                <ArrowCounterClockwise size={17} weight="regular" />
                Reset defaults
              </button>
              <button
                className="settings-done"
                onClick={() => setSettingsOpen(false)}
              >
                Done <Check size={16} weight="bold" />
              </button>
            </footer>
          </Modal>
        )}
      </main>
      {/* Export UI hidden for now - separate export server planned in the future */}
      {false && modal && (
        <Modal onClose={() => setModal(false)} title="Export video">
          <p className="modal-description">
            Export your map and soundtrack as an MP4 video.
          </p>
          <label className="select-label">
            Resolution
            <select
              aria-label="Resolution"
              value={resolution}
              disabled={exportBusy}
              onChange={(e) => setResolution(e.target.value)}
            >
              <option value="1080">Full HD · 1920 × 1080</option>
              <option value="720">HD · 1280 × 720</option>
            </select>
          </label>
          <label className="select-label">
            Duration
            <select
              aria-label="Duration"
              value={exportDuration}
              disabled={exportBusy}
              onChange={(e) => setExportDuration(e.target.value)}
            >
              <option value="full">
                Full soundtrack · {formatTime(scene.duration)}
              </option>
              <option value="10">First 10 seconds</option>
            </select>
          </label>
          <div className="export-summary">
            <span>Server MP4 (local only)</span>
            <span>or Browser WebM</span>
            <span>30 fps</span>
          </div>
          <p className="area-hint" style={{ marginTop: 4 }}>
            High-quality MP4 requires running the full studio locally. Browser export captures the preview directly as WebM (no screen sharing).
          </p> 
          {job?.status === "failed" && (
            <p role="alert" className="error-message">
              {job!.error}
            </p>
          )}
          {exportError && (
            <p role="alert" className="error-message">{exportError}</p>
          )}
          {job?.status === "cancelled" && (
            <p role="status" className="modal-description">
              Export cancelled. You can start another video.
            </p>
          )}
          {exportBusy ? (
            <div className="render-progress" role="status">
              <div>
                <span>
                  {job?.status === "cancelling"
                    ? "Cancelling export…"
                    : job?.status === "uploading"
                    ? "Preparing audio…"
                    : job?.status === "queued"
                      ? "Starting export…"
                      : job?.status === "recording"
                        ? "Exporting in browser…"
                        : "Rendering video…"}
                </span> 
                <span>{Math.round((job?.progress ?? 0) * 100)}%</span>
              </div>
              <progress max="1" value={job?.progress ?? 0} />
              <small>
                {job?.status === "recording"
                  ? "Capturing preview + audio directly in the browser."
                  : job?.status === "cancelling"
                  ? "You can close this panel while cancellation finishes."
                  : "You can close this panel while your video renders."}
              </small> 
              <button
                className="render-again text-button"
                onClick={job?.status === "recording" ? () => {
                  const rec = browserRecorderRef.current;
                  if (rec && rec.state === "recording") {
                    rec.stop();
                  } else {
                    setJob(null);
                  }
                } : cancelExport} 
                disabled={job?.status === "cancelling"}
              >
                {job?.status === "recording" ? "Stop export" : job?.status === "cancelling" ? "Cancelling…" : "Cancel export"} 
              </button>
            </div>
          ) : job?.status === "done" ? (
            <div>
              <a
                className="primary-action"
                href={`/api/exports/${job!.id}/download`}
                download
              >
                <DownloadSimple size={18} /> Download video
              </a>
              <button
                className="render-again text-button"
                onClick={() => setJob(null)}
              >
                Create another video
              </button>
            </div>
          ) : (
            <>
              <button className="primary-action" onClick={exportVideo}>
                <ArrowUpRight size={18} /> Export video
              </button>
              <button
                className="text-button"
                style={{ marginTop: 8 }}
                onClick={exportInBrowser}
              >
                Export in browser (WebM)
              </button> 
            </>
          )}
        </Modal>
      )}
      {help && (
        <Modal
          onClose={() => setHelp(false)}
          title="How to use Watt a Beat"
        >
          <div className="help-content">
            <p>
              Play the demo or load an audio file (or paste a YouTube URL). The
              audio is sourced directly from YouTube when you use a video link —
              no download or extraction. Bass, midrange, and treble light up
              different districts. Quiet passages dim the streets; louder beats
              bring the lights back. (YouTube uses simulated beat response.)
            </p>
            <p>
              Search for a place in the Philippines, drag to pan, and scroll to
              zoom. Click a map label to focus on a district. Use Map settings
              to adjust the lights or cut power to individual districts.
            </p>
            <p>
              Choose City lights, Christmas, Moonlight, or Rain in the bottom
              bar. Video export is planned for a future separate server.
            </p> 
            <p>
              Districts group nearby streets for the lighting effect. They do
              not represent official boundaries or live power outages.
            </p>
            <p>
              Map data:{" "}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
              >
                OpenStreetMap contributors
              </a>
              , ODbL. Audio preview uses{" "}
              <a
                href="https://www.remotion.dev/docs/player"
                target="_blank"
                rel="noreferrer"
              >
                Remotion
              </a>
              .
            </p>
            <p className="author-credit">
              Created by{" "}
              <a
                href="https://github.com/mjsolidarios"
                target="_blank"
                rel="noreferrer"
              >
                mjsolidarios
              </a>
              .
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      className="toggle-row"
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={onChange}
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        className={`toggle ${checked ? "checked" : ""}`}
      >
        <span />
      </span>
    </button>
  );
}
function ThemeIcon({ theme }: { theme: Theme }) {
  return theme === "rain" ? (
    <CloudRain size={22} />
  ) : theme === "christmas" ? (
    <Snowflake size={22} />
  ) : theme === "moonlight" ? (
    <Moon size={22} />
  ) : (
    <Sparkle size={22} />
  );
}
function ThemePicker({
  theme,
  onChange,
}: {
  theme: Theme;
  onChange: (theme: Theme) => void;
}) {
  const themesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = themesRef.current;
    if (!container) return;
    const items = container.querySelectorAll(".theme-option");
    gsap.fromTo(
      items,
      { opacity: 0, y: 8, scale: 0.98 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.4,
        ease: "power2.out",
        stagger: 0.05,
        delay: 0.1,
      }
    );
  }, []);

  return (
    <div ref={themesRef} className="themes" aria-label="Atmosphere">
      {themes.map((option) => (
        <button
          key={option.id}
          className={`theme-option ${theme === option.id ? "selected" : ""}`}
          aria-pressed={theme === option.id}
          aria-label={option.name}
          data-tooltip={`${option.name}: ${option.desc}`}
          onClick={() => onChange(option.id)}
        >
          <span className={`theme-thumb ${option.id}`}>
            <ThemeIcon theme={option.id} />
          </span>
        </button>
      ))}
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
  className = "",
  description,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  description?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    const content = contentRef.current;
    if (!dialog) return;

    const previousFocus = document.activeElement;
    dialog.showModal();

    if (content && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.fromTo(
        content,
        { opacity: 0, y: 16, scale: 0.985 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.38,
          ease: "power3.out",
          delay: 0.02,
        }
      );
    }
    return () => {
      if (content) gsap.killTweensOf(content);
      dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div ref={contentRef} className="modal-content">
        <div className="modal-heading">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && (
              <p id={descriptionId} className="settings-description">
                {description}
              </p>
            )}
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            data-tooltip="Close dialog"
            onClick={onClose}
          >
            <X size={20} weight="regular" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
