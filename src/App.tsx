import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Player, type PlayerRef } from "@remotion/player";
import {
  ArrowCounterClockwise,
  ArrowRight,
  ArrowUpRight,
  ArrowsOut,
  CaretDown,
  CaretUp,
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
  Cube,
  Shuffle,
  HandTap,
  UploadSimple,
  X,
  YoutubeLogo,
} from "@phosphor-icons/react";
import { MapScene } from "./MapScene";
import {
  PlaybackProgress,
  formatTime,
  usePlaybackPosition,
} from "./PlaybackProgress";
import {
  defaultScene,
  type ColorMode,
  type SceneProps,
  type Theme,
} from "./types";
import { analyzeSamples } from "./audio-analysis.mjs";
import { isLightColor } from "./scene-effects.mjs";
import { useMapArea } from "./useMapArea";
import { useMixPlayback } from "./useMixPlayback";
import { mixChannels, encodeWav } from "./audio-mix.mjs";
import { LocationSearch } from "./LocationSearch";
import { TooltipLayer } from "./TooltipLayer";
import gsap from "gsap";
import { useVideoExport } from "./useVideoExport";
import { useSurprise } from "./useSurprise";
import {
  extractYoutubeId,
  ensureYoutubeApi,
  youtubeErrorMessage,
} from "./youtube.mjs";

const themes: { id: Theme; name: string; desc: string }[] = [
  { id: "midnight", name: "City lights", desc: "Amber street lights" },
  {
    id: "christmas",
    name: "Christmas",
    desc: "Red and green lights with snow",
  },
  { id: "moonlight", name: "Moonlight", desc: "Cool blue street lights" },
  { id: "rain", name: "Rain", desc: "Blue lights with rain" },
];

function createSyntheticEnvelopes(durationSec: number): number[][] {
  const frames = Math.max(1, Math.ceil(durationSec * 30));
  const result: number[][] = [];
  for (let f = 0; f < frames; f++) {
    const t = f / 30;
    // Rhythmic pulses to simulate music energy
    const beatPhase = (t * 2.13) % 1;
    const bassPulse = Math.pow(
      Math.max(0, Math.sin(beatPhase * Math.PI * 2)),
      2.2,
    );
    const groove = 0.5 + 0.5 * Math.sin(t * 0.65);
    const bass = Math.min(1, 0.12 + bassPulse * (0.72 + groove * 0.22));
    const mid = Math.min(
      1,
      0.1 + (0.45 + 0.5 * Math.sin(t * 1.9 + 1)) * (0.38 + bassPulse * 0.25),
    );
    const treble = Math.min(
      1,
      0.07 +
        Math.abs(Math.sin(t * 4.3)) * 0.32 +
        (Math.sin(t * 7.1) + 1) * 0.06,
    );
    result.push([bass, mid, treble]);
  }
  return result;
}
function useHudOpen(storageKey: string) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(storageKey) !== "0";
    } catch {
      return true;
    }
  });
  const toggle = useCallback(() => {
    setOpen((current) => {
      const next = !current;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* private mode */
      }
      return next;
    });
  }, [storageKey]);
  return [open, toggle] as const;
}
export function App() {
  const [mixOpen, setMixOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [musicPanelOpen, toggleMusicPanel] = useHudOpen("watt.hud.music");
  const [toolsPanelOpen, toggleToolsPanel] = useHudOpen("watt.hud.explore");
  const [youtubePreviewOpen, toggleYoutubePreview] =
    useHudOpen("watt.hud.youtube");
  const panGesture = useRef<{
    x: number;
    y: number;
    pan: { x: number; y: number };
    scale: number;
    pointerId: number;
    district: string | null;
    moved: boolean;
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
  const splashStarted = useRef(
    typeof performance !== "undefined" ? performance.now() : 0,
  );
  const [pageLoaded, setPageLoaded] = useState(
    () => typeof document !== "undefined" && document.readyState === "complete",
  );
  useEffect(() => {
    if (pageLoaded) return;
    const done = () => setPageLoaded(true);
    if (document.readyState === "complete") {
      done();
      return;
    }
    window.addEventListener("load", done);
    return () => window.removeEventListener("load", done);
  }, [pageLoaded]);
  useEffect(() => {
    const splash = document.getElementById("app-splash");
    if (!splash) return;
    const appReady = !!scene.mapData || !!area.error || !area.busy;
    if (!pageLoaded || !appReady) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const minMs = reduce ? 0 : 1400;
    const wait = Math.max(
      0,
      minMs - (performance.now() - splashStarted.current),
    );
    const hide = window.setTimeout(() => {
      splash.classList.add("is-leaving");
      splash.setAttribute("aria-hidden", "true");
      window.setTimeout(() => splash.remove(), reduce ? 80 : 650);
    }, wait);
    return () => clearTimeout(hide);
  }, [pageLoaded, area.busy, area.error, scene.mapData]);
  const districtNames = useMemo(
    () => scene.mapData?.districts.map((d) => d.name) ?? [],
    [scene.mapData],
  );
  const [localTracks, setLocalTracks] = useState<
    { id: string; name: string; isDemo: boolean }[]
  >([]);
  const decodedTracks = useRef<
    { id: string; name: string; isDemo: boolean; channels: Float32Array[] }[]
  >([]);
  const [localAnalysis, setLocalAnalysis] = useState({
    duration: 0,
    envelopes: [] as number[][],
  });
  const [youtubeDuration, setYoutubeDuration] = useState(0);
  const [localVolume, setLocalVolume] = useState(100);
  const [youtubeVolume, setYoutubeVolume] = useState(100);
  const ytLoadId = useRef(0);
  const [track, setTrack] = useState({
    name: "After hours",
    artist: "Demo track",
    isDemo: true,
  });
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [playing, setPlaying] = useState(false),
    [muted, setMuted] = useState(false),
    [dragging, setDragging] = useState(false);
  const playbackPosition = usePlaybackPosition();
  const { setFrame } = playbackPosition;
  const [youtubeId, setYoutubeId] = useState<string | null>(null);
  const [showYtInput, setShowYtInput] = useState(false);
  const [ytUrlInput, setYtUrlInput] = useState("");
  const [ytError, setYtError] = useState("");
  const [ytStatus, setYtStatus] = useState("Ready to play");
  const ytHost = useRef<HTMLDivElement>(null);
  const ytReadyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [interactionMode, setInteractionMode] = useState<
    "ripple" | "focus" | "power"
  >("ripple");
  const [ripple, setRipple] = useState<{ district: string; id: number }>();
  const [interactionMessage, setInteractionMessage] = useState("");
  const [playDemoWhenReady, setPlayDemoWhenReady] = useState(false);
  const surprise = useSurprise(scene, setScene, area);
  const videoExport = useVideoExport();
  const [exportFormat, setExportFormat] = useState<"mp4" | "webm">("mp4");
  const ytPlayerRef = useRef<any>(null);
  const [modal, setModal] = useState(false),
    [help, setHelp] = useState(false),
    [resolution, setResolution] = useState("1080"),
    [exportDuration, setExportDuration] = useState("10");
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
  const {
    audio: previewAudio,
    toggle: toggleAudio,
    seek: seekAudio,
    pause: pauseMix,
    youtubeState,
    loopLocal,
  } = useMixPlayback({
    src: scene.audioSrc,
    localDuration: localAnalysis.duration,
    youtubeDuration,
    totalFrames,
    youtube: ytPlayerRef,
    player,
    onFrame: setFrame,
    onPlaying: setPlaying,
    onError: setError,
  });
  useEffect(() => {
    const duration = Math.max(localAnalysis.duration, youtubeDuration, 1);
    const envelopes = localAnalysis.duration
      ? Array.from(
          { length: Math.ceil(duration * 30) },
          (_, i) => localAnalysis.envelopes[i] ?? [0, 0, 0],
        )
      : createSyntheticEnvelopes(duration);
    setScene((s) => ({ ...s, duration: envelopes.length / 30, envelopes }));
  }, [localAnalysis, youtubeDuration]);
  useEffect(() => {
    if (previewAudio.current) previewAudio.current.volume = localVolume / 100;
  }, [localVolume]);

  const removeYoutube = useCallback(() => {
    ++ytLoadId.current;
    pauseMix();
    if (ytReadyTimer.current) clearTimeout(ytReadyTimer.current);
    ytPlayerRef.current?.destroy?.();
    ytPlayerRef.current = null;
    setYoutubeId(null);
    setYoutubeDuration(0);
    setYtError("");
    setLoading(false);
    seekAudio(0);
  }, [pauseMix, seekAudio]);

  const loadYoutube = useCallback(
    async (rawUrl: string) => {
      const id = extractYoutubeId(rawUrl);
      if (!id) {
        setYtError("Enter a valid YouTube URL (youtu.be or youtube.com).");
        setShowYtInput(true);
        return;
      }
      const loadToken = ++ytLoadId.current;
      ++loadId.current;
      if (ytReadyTimer.current) clearTimeout(ytReadyTimer.current);
      setLoading(true);
      setPlaying(false);
      setPlayDemoWhenReady(false);
      setError("");
      setYtError("");
      setYtStatus("Connecting to YouTube…");
      setShowYtInput(false);
      setYtUrlInput(rawUrl.trim());
      pauseMix();
      seekAudio(0);
      setYoutubeDuration(0);
      ytPlayerRef.current?.destroy?.();
      ytPlayerRef.current = null;
      if (decodedTracks.current.every((t) => t.isDemo)) {
        decodedTracks.current = [];
        setLocalTracks([]);
        setLocalAnalysis({ duration: 0, envelopes: [] });
        audioBytes.current = null;
        if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
        blobUrl.current = "";
        setScene((s) => ({ ...s, audioSrc: "" }));
      }
      setYoutubeId(id);
      setTrack({
        name: "Loading video details…",
        artist: "YouTube",
        isDemo: false,
      });
      setFrame(0);
      player.current?.seekTo(0);
      const fail = (message: string) => {
        if (loadToken !== ytLoadId.current) return;
        if (ytReadyTimer.current) clearTimeout(ytReadyTimer.current);
        ++ytLoadId.current;
        setYtError(message);
        setYtStatus("Unable to play");
        setLoading(false);
        setPlaying(false);
        pauseMix();
        setYoutubeDuration(0);
        ytPlayerRef.current?.destroy?.();
        ytPlayerRef.current = null;
      };
      try {
        await ensureYoutubeApi();
        if (loadToken !== ytLoadId.current) return;
        // React owns the outer host; YouTube may replace only its inner child.
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        if (loadToken !== ytLoadId.current || !ytHost.current) return;
        ytHost.current.replaceChildren();
        const element = document.createElement("div");
        ytHost.current.appendChild(element);
        setYtStatus("Loading video…");
        ytReadyTimer.current = setTimeout(
          () =>
            fail(
              "This video took too long to load. Retry or choose another URL.",
            ),
          15000,
        );
        const refreshDetails = (p: any) => {
          const data = p.getVideoData?.() || {};
          setTrack({
            name: data.title || "YouTube video",
            artist: data.author || "YouTube",
            isDemo: false,
          });
          const duration = p.getDuration?.();
          if (Number.isFinite(duration) && duration > 0) {
            setYoutubeDuration(duration);
          }
        };
        ytPlayerRef.current = new (window as any).YT.Player(element, {
          height: "200",
          width: "100%",
          videoId: id,
          playerVars: {
            autoplay: 0,
            controls: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (ev: any) => {
              if (loadToken !== ytLoadId.current) return;
              if (ytReadyTimer.current) clearTimeout(ytReadyTimer.current);
              refreshDetails(ev.target);
              setYtStatus("Ready to play");
              setLoading(false);
            },
            onStateChange: (ev: any) => {
              if (loadToken !== ytLoadId.current) return;
              const state = ev.data;
              if (state === 1) {
                refreshDetails(ev.target);
                setYtStatus("Playing");
              } else {
                setYtStatus(
                  state === 3
                    ? "Buffering…"
                    : state === 0
                      ? "Finished"
                      : "Paused",
                );
              }
              youtubeState(state);
            },
            onAutoplayBlocked: () => {
              if (loadToken === ytLoadId.current) {
                pauseMix();
                setYtStatus("Press play in the video to begin.");
              }
            },
            onError: (ev: any) => fail(youtubeErrorMessage(ev.data)),
          },
        });
      } catch (e) {
        fail(
          e instanceof Error
            ? e.message
            : "Couldn’t connect to YouTube. Please retry.",
        );
      }
    },
    [pauseMix, seekAudio, youtubeState],
  );

  // Keep YT volume in sync with mute toggle
  useEffect(() => {
    const p = ytPlayerRef.current;
    if (!p || !youtubeId) return;
    try {
      if (muted) {
        p.mute?.();
      } else {
        p.unMute?.();
        p.setVolume?.(youtubeVolume);
      }
    } catch {}
  }, [muted, youtubeId, loading, youtubeVolume]);
  useEffect(() => {
    const player = ytPlayerRef.current;
    const host = ytHost.current;
    if (!player || !host || !youtubeId) return;
    try {
      if (youtubePreviewOpen) player.setSize?.(host.clientWidth, 200);
      else player.setSize?.(120, 68);
    } catch {}
  }, [youtubePreviewOpen, youtubeId, loading]);

  const update = <K extends keyof SceneProps>(key: K, value: SceneProps[K]) =>
    setScene((s) => ({ ...s, [key]: value }));
  const commitLocalMix = useCallback(
    (tracks: typeof decodedTracks.current) => {
      pauseMix();
      if (tracks.length === 0) {
        if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
        blobUrl.current = "";
        audioBytes.current = null;
        setScene((s) => ({ ...s, audioSrc: "" }));
        setLocalAnalysis({ duration: 0, envelopes: [] });
      } else {
        const channels = mixChannels(tracks.map((t) => t.channels));
        const mono = new Float32Array(channels[0].length);
        for (const channel of channels) {
          for (let i = 0; i < mono.length; i++)
            mono[i] += channel[i] / channels.length;
        }
        const blob = encodeWav(channels, 44100);
        const url = URL.createObjectURL(blob);
        if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
        blobUrl.current = url;
        audioBytes.current = blob;
        setScene((s) => ({ ...s, audioSrc: url }));
        const envelopes = analyzeSamples(mono, 44100);
        setLocalAnalysis({ duration: channels[0].length / 44100, envelopes });
      }
      decodedTracks.current = tracks;
      setLocalTracks(
        tracks.map(({ id, name, isDemo }) => ({ id, name, isDemo })),
      );
      seekAudio(0);
      setFrame(0);
      player.current?.seekTo(0);
    },
    [pauseMix, seekAudio, setFrame],
  );
  const loadAudio = useCallback(
    async (files: { blob: Blob; name: string; isDemo: boolean }[]) => {
      if (!files.length) return;
      const existing = files[0].isDemo
        ? []
        : decodedTracks.current.filter((t) => !t.isDemo);
      if (existing.length + files.length > 8) {
        setError(
          "A mix can hold up to 8 audio files. Remove a track before adding more.",
        );
        return;
      }
      const id = ++loadId.current;
      setLoading(true);
      setError("");
      setPlayDemoWhenReady(false);
      pauseMix();
      let context: AudioContext | undefined;
      try {
        context = new AudioContext({ sampleRate: 44100 });
        const added: typeof decodedTracks.current = [];
        for (const file of files) {
          if (file.blob.size > 60 * 1024 * 1024)
            throw new Error(
              `${file.name}: choose an audio file smaller than 60 MB.`,
            );
          let buffer: AudioBuffer;
          try {
            buffer = await context.decodeAudioData(
              await file.blob.arrayBuffer(),
            );
          } catch {
            throw new Error(
              `${file.name} could not be opened. Try an MP3 or WAV file.`,
            );
          }
          if (id !== loadId.current) return;
          if (buffer.duration > 300)
            throw new Error(
              `${file.name}: choose a track no longer than 5 minutes.`,
            );
          added.push({
            id: crypto.randomUUID(),
            name: file.name.replace(/\.[^.]+$/, ""),
            isDemo: file.isDemo,
            channels: Array.from(
              { length: Math.min(2, buffer.numberOfChannels) },
              (_, c) => buffer.getChannelData(c).slice(),
            ),
          });
        }
        if (id !== loadId.current) return;
        commitLocalMix([...existing, ...added]);
        if (files[0].isDemo) removeYoutube();
      } catch (e) {
        if (id === loadId.current)
          setError(
            e instanceof Error ? e.message : "This audio could not be opened.",
          );
      } finally {
        await context?.close();
        if (id === loadId.current) setLoading(false);
      }
    },
    [commitLocalMix, pauseMix, removeYoutube],
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
          void loadAudio([{ blob: b, name: "After hours", isDemo: true }]);
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
      ytLoadId.current++;
      if (ytReadyTimer.current) clearTimeout(ytReadyTimer.current);
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy?.();
        } catch {}
        ytPlayerRef.current = null;
      }
    },
    [],
  );
  // GSAP entrance for floating transport (studio glassy dock)
  useEffect(() => {
    const el = transportRef.current;
    if (!el) return;
    gsap.fromTo(
      el,
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.6, ease: "power3.out", delay: 0.15 },
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
    toggleAudio();
  }, [loading, toggleAudio]);
  const seekToFrame = seekAudio;
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
        !settingsOpen &&
        !mixOpen
      ) {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === "Escape") {
        setModal(false);
        setHelp(false);
        setSettingsOpen(false);
        setMixOpen(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [togglePlay, modal, help, settingsOpen, mixOpen]);
  const selectDistrict = useCallback(
    (name: string) => {
      if (interactionMode === "power") {
        const powered = scene.enabled.includes(name);
        setScene((s) => ({
          ...s,
          selected: null,
          enabled: s.enabled.includes(name)
            ? s.enabled.filter((n) => n !== name)
            : [...s.enabled, name],
        }));
        setInteractionMessage(`${name}: power ${powered ? "off" : "on"}.`);
      } else if (interactionMode === "focus") {
        setScene((s) => ({
          ...s,
          selected: s.selected === name ? null : name,
        }));
        setInteractionMessage(`Focus changed: ${name}.`);
      } else {
        setRipple({ district: name, id: performance.now() });
        setInteractionMessage(`Light ripple in ${name}.`);
      }
    },
    [interactionMode, scene.enabled],
  );
  const inputProps = useMemo(
    () => ({
      ...scene,
      audioSrc: "",
      onSelect: selectDistrict,
      interactionMode,
      ripple,
      branding: false,
    }),
    [scene, selectDistrict, interactionMode, ripple],
  );
  const receiveFiles = (files: FileList | null) => {
    if (files)
      void loadAudio(
        Array.from(files, (file) => ({
          blob: file,
          name: file.name,
          isDemo: false,
        })),
      );
  };
  const isDemo =
    localTracks.length === 1 && localTracks[0].isDemo && !youtubeId;
  const sourceCount = localTracks.length + (youtubeId ? 1 : 0);
  const mixName =
    sourceCount > 1
      ? `${sourceCount} sources · Your mix`
      : (localTracks[0]?.name ??
        (youtubeId ? track.name : "Add music to begin"));
  const mixArtist =
    sourceCount > 1
      ? `${localTracks.length} audio file${localTracks.length === 1 ? "" : "s"}${youtubeId ? " + YouTube" : ""}`
      : localTracks.length
        ? isDemo
          ? "Demo track"
          : "Uploaded track"
        : track.artist;
  const playDemo = async () => {
    if (isDemo && scene.audioSrc && !loading) {
      void previewAudio.current
        ?.play()
        .catch(() => setError("Press play to start the demo."));
      return;
    }
    const token = ++loadId.current;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/after-hours.wav");
      if (!response.ok)
        throw new Error("Demo audio unavailable. Upload a track or try again.");
      const blob = await response.blob();
      if (token !== loadId.current) return;
      await loadAudio([{ blob, name: "After hours", isDemo: true }]);
      setPlayDemoWhenReady(true);
    } catch (e) {
      if (token === loadId.current) {
        setError(e instanceof Error ? e.message : "Couldn’t load the demo.");
        setLoading(false);
      }
    }
  };
  useEffect(() => {
    if (!playDemoWhenReady || loading || !scene.audioSrc || !isDemo) return;
    setPlayDemoWhenReady(false);
    void previewAudio.current
      ?.play()
      .catch(() => setError("Demo ready. Press play to begin."));
  }, [playDemoWhenReady, loading, scene.audioSrc, isDemo]);
  const openYoutubeInput = () => {
    setShowYtInput(true);
    document.getElementById("youtube-url-input")?.focus();
  };
  const exportBusy = videoExport.busy;
  return (
    <div className={`app-shell${youtubeId ? " has-youtube" : ""}`}>
      <TooltipLayer />
      <audio
        ref={previewAudio}
        src={scene.audioSrc || undefined}
        preload="auto"
        loop={loopLocal}
        muted={muted}
        onError={() => {
          pauseMix();
          setError(
            "This audio could not be played. Try another MP3 or WAV file.",
          );
        }}
      />
      <input
        ref={upload}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac"
        hidden
        multiple
        onChange={(e) => {
          receiveFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <header className="header">
        <a href="/" className="brand" aria-label="Watt a Beat home">
          <span className={`brand-symbol${playing ? " is-playing" : ""}`}>
            <img
              src="/app-logo.svg"
              alt=""
              width={30}
              height={30}
              className="brand-logo"
            />
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
          <button
            type="button"
            className="icon-button export-trigger"
            aria-label={exportBusy ? "Export progress" : "Export video"}
            data-tooltip={exportBusy ? "Export progress" : "Export video"}
            aria-haspopup="dialog"
            aria-expanded={modal}
            onClick={() => setModal(true)}
          >
            {exportBusy ? (
              <CircleNotch size={21} className="spin" />
            ) : (
              <DownloadSimple size={21} />
            )}
          </button>
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
              receiveFiles(e.dataTransfer.files);
            }}
            onPointerDown={(e) => {
              if (
                e.button !== 0 ||
                !e.isPrimary ||
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
                pointerId: e.pointerId,
                district: (() => {
                  const element = (e.target as Element).closest(
                    "[data-district],[data-building-district]",
                  );
                  return (
                    element?.getAttribute("data-district") ??
                    element?.getAttribute("data-building-district") ??
                    null
                  );
                })(),
                moved: false,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
              setIsPanning(true);
            }}
            onPointerMove={(e) => {
              const gesture = panGesture.current;
              if (!gesture || gesture.pointerId !== e.pointerId) return;
              if (
                !gesture.moved &&
                Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) < 6
              )
                return;
              gesture.moved = true;
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
            onPointerUp={(e) => {
              const gesture = panGesture.current;
              if (!gesture || gesture.pointerId !== e.pointerId) return;
              panGesture.current = null;
              setIsPanning(false);
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                e.currentTarget.releasePointerCapture(e.pointerId);
              if (
                !gesture.moved &&
                gesture.district &&
                interactionMode === "power"
              ) {
                selectDistrict(gesture.district);
              }
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
              onSelect={(location) => {
                surprise.cancel();
                void area.select(location);
              }}
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
            <HudPanel
              className="start-toolbar"
              label="Start creating"
              bodyId="music-panel-body"
              open={musicPanelOpen}
              onToggle={toggleMusicPanel}
              restoreLabel="Choose music"
              restoreIcon={<MusicNotes size={16} aria-hidden="true" />}
              hideLabel="Hide music panel"
              showLabel="Show music panel"
              header={
                <p className="start-hint">
                  Pick a place <ArrowRight /> Choose music <ArrowRight /> Watch
                  it light up
                </p>
              }
            >
              <div
                className="source-choices"
                role="group"
                aria-label="Choose music"
              >
                <button
                  className="demo-choice"
                  onClick={() => {
                    if (playing && isDemo && !youtubeId) togglePlay();
                    else void playDemo();
                  }}
                  disabled={loading}
                  aria-label={
                    playing && isDemo && !youtubeId ? "Pause demo" : "Play demo"
                  }
                >
                  {playing && isDemo && !youtubeId ? (
                    <>
                      <Pause size={16} weight="fill" /> Pause
                    </>
                  ) : (
                    <>
                      <Play size={16} /> Play demo
                    </>
                  )}
                </button>
                <button
                  onClick={() => upload.current?.click()}
                  disabled={loading}
                >
                  <UploadSimple size={16} /> Add audio files
                </button>
                <button
                  onClick={openYoutubeInput}
                  disabled={loading}
                  aria-expanded={showYtInput}
                  aria-controls="youtube-url-input"
                >
                  <YoutubeLogo size={18} /> Paste YouTube URL
                </button>
              </div>
              <button
                className="mix-summary"
                onClick={() => setMixOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={mixOpen}
              >
                <SlidersHorizontal size={14} /> Your mix · {sourceCount} source
                {sourceCount === 1 ? "" : "s"}
                <span>
                  {dragging ? "Drop to add audio" : "Manage mix"}{" "}
                  <ArrowRight size={13} />
                </span>
              </button>
            </HudPanel>
            <HudPanel
              className="explore-tools"
              label="Map tools"
              bodyId="map-tools-body"
              open={toolsPanelOpen}
              onToggle={toggleToolsPanel}
              restoreLabel="Map tools"
              restoreIcon={<HandTap size={16} aria-hidden="true" />}
              hideLabel="Hide map tools"
              showLabel="Show map tools"
              header={<p className="hud-title">Map tools</p>}
            >
              <div className="surprise-actions">
                <button
                  className="surprise-button"
                  disabled={surprise.busy || area.busy}
                  onClick={() => void surprise.surprise()}
                >
                  {surprise.busy ? (
                    <CircleNotch className="spin" size={17} />
                  ) : (
                    <Shuffle size={17} />
                  )}{" "}
                  Surprise me
                </button>
                {surprise.canUndo && (
                  <button disabled={surprise.busy} onClick={surprise.undo}>
                    <ArrowCounterClockwise size={16} /> Undo
                  </button>
                )}
              </div>
              <div
                className="map-modes"
                role="group"
                aria-label="Map interaction"
              >
                <HandTap size={17} />
                {(["ripple", "focus", "power"] as const).map((mode) => (
                  <button
                    key={mode}
                    aria-pressed={interactionMode === mode}
                    onClick={() => {
                      setInteractionMode(mode);
                      setScene((s) => ({ ...s, selected: null }));
                      setInteractionMessage(
                        mode === "power"
                          ? "Tap a district to switch its power on or off."
                          : mode === "focus"
                            ? "Tap a district to focus its lights."
                            : "Tap a district to send a light ripple.",
                      );
                    }}
                  >
                    {mode === "ripple"
                      ? "Ripple"
                      : mode === "focus"
                        ? "Focus"
                        : "Power"}
                  </button>
                ))}
              </div>
              <p className="interaction-hint">
                {interactionMode === "power"
                  ? "Tap a street, building, or district label to switch power."
                  : interactionMode === "focus"
                    ? "Tap a district to focus its lights."
                    : "Tap a district to send a light ripple."}
              </p>
              <div className="region-view-controls">
                <button
                  className="region-3d-button"
                  aria-label="3D buildings"
                  aria-pressed={!!scene.buildings3D}
                  disabled={!scene.mapData || area.busy}
                  data-tooltip={
                    scene.buildings3D
                      ? "Return visible buildings to 2D"
                      : "Raise buildings in the visible map area. Heights are illustrative."
                  }
                  onClick={() => update("buildings3D", !scene.buildings3D)}
                >
                  <Cube size={18} /> 3D buildings
                </button>
                <span>Visible map area</span>
              </div>
              {scene.buildings3D && (
                <p className="region-3d-hint" role="status">
                  {scene.mapData?.districts.some((d) => d.buildings?.length)
                    ? "Visible districts are in 3D. Powered buildings light up with the music."
                    : "No building footprints are available in this area. Try another place."}
                </p>
              )}
              {surprise.message && <p role="status">{surprise.message}</p>}
              {surprise.error && <p role="alert">{surprise.error}</p>}
              <span
                className={
                  interactionMode === "power" ? "power-feedback" : "sr-only"
                }
                role="status"
              >
                {interactionMode === "power"
                  ? `${scene.enabled.length} of ${districtNames.length} districts on. ${interactionMessage}`
                  : interactionMessage}
              </span>
            </HudPanel>
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
          {youtubeId && (
            <aside
              className={`youtube-source${youtubePreviewOpen ? "" : " is-mini"}`}
              aria-label="YouTube video"
            >
              <div className="youtube-head">
                <p className="hud-title">YouTube</p>
                <button
                  type="button"
                  className="hud-toggle"
                  aria-expanded={youtubePreviewOpen}
                  aria-label={
                    youtubePreviewOpen
                      ? "Switch to mini player"
                      : "Expand video preview"
                  }
                  data-tooltip={
                    youtubePreviewOpen
                      ? "Switch to mini player"
                      : "Expand video preview"
                  }
                  onClick={toggleYoutubePreview}
                >
                  {youtubePreviewOpen ? (
                    <CaretUp size={14} aria-hidden="true" />
                  ) : (
                    <CaretDown size={14} aria-hidden="true" />
                  )}
                </button>
              </div>
              <div className="youtube-video-host" ref={ytHost} />
              <div className="youtube-details">
                <span className="youtube-thumbnail">
                  <YoutubeLogo size={24} aria-hidden="true" />
                  <img
                    key={youtubeId}
                    src={`https://i.ytimg.com/vi/${youtubeId}/default.jpg`}
                    alt="Video thumbnail"
                    width="64"
                    height="48"
                    onError={(event) => {
                      event.currentTarget.hidden = true;
                    }}
                  />
                </span>
                <div>
                  <strong>{track.name}</strong>
                  <span>{track.artist}</span>
                </div>
              </div>
              <p className="youtube-status" role="status">
                {ytStatus}
              </p>
              <p className="youtube-note">
                {localTracks.length
                  ? "Lights follow your audio files. YouTube plays alongside the mix."
                  : "Simulated rhythm · lights may not match the beat."}
              </p>
              {ytError && !showYtInput && (
                <p role="alert" className="source-error">
                  {ytError}
                </p>
              )}
              <div
                className="youtube-actions"
                hidden={!youtubePreviewOpen && !ytError}
              >
                {ytError && (
                  <button
                    onClick={() =>
                      void loadYoutube(
                        `https://www.youtube.com/watch?v=${youtubeId}`,
                      )
                    }
                    disabled={loading}
                  >
                    Retry video
                  </button>
                )}
                <button onClick={openYoutubeInput}>Change URL</button>
                <a
                  href={`https://www.youtube.com/watch?v=${youtubeId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open on YouTube <ArrowUpRight size={13} />
                </a>
              </div>
            </aside>
          )}
          <section
            className="transport"
            aria-label="Audio playback"
            ref={transportRef}
          >
            <div className="track-row">
              <div className="track-art">
                <MusicNotes size={22} />
              </div>
              <div className="track-details">
                <strong>
                  {loading
                    ? youtubeId
                      ? ytStatus
                      : "Loading audio…"
                    : mixName}
                </strong>
                <span>
                  {mixArtist}
                  {isDemo && <span className="demo-tag">DEMO</span>}
                  {youtubeId && (
                    <span
                      className="demo-tag"
                      style={{ borderColor: "#9a6b4a", color: "#d4a67f" }}
                    >
                      YOUTUBE
                    </span>
                  )}
                </span>
              </div>
            </div>
            {showYtInput && (
              <form
                className="youtube-form"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!loading) void loadYoutube(ytUrlInput);
                }}
              >
                <label htmlFor="youtube-url-input">YouTube video URL</label>
                <div className="youtube-input-row">
                  <input
                    id="youtube-url-input"
                    type="url"
                    required
                    autoFocus
                    aria-label="YouTube video URL"
                    aria-describedby="youtube-source-note"
                    value={ytUrlInput}
                    onChange={(e) => {
                      setYtUrlInput(e.target.value);
                      setYtError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        setShowYtInput(false);
                      }
                    }}
                    placeholder="https://youtube.com/watch?v=…"
                  />
                  <button
                    type="submit"
                    disabled={!ytUrlInput.trim() || loading}
                  >
                    Load
                  </button>
                  <button type="button" onClick={() => setShowYtInput(false)}>
                    Cancel
                  </button>
                </div>
                <p id="youtube-source-note">
                  Adds one video alongside your audio files. With audio files
                  loaded, the lights follow their combined beat.
                </p>
                {ytError && (
                  <p role="alert" className="source-error">
                    {ytError}
                  </p>
                )}
              </form>
            )}
            <div className="waveform-row">
              <button
                ref={playBtnRef}
                className="play-button"
                aria-label={playing ? "Pause" : "Play"}
                onClick={togglePlay}
                disabled={
                  loading || (!scene.audioSrc && (!youtubeId || !!ytError))
                }
              >
                {loading ? (
                  <CircleNotch size={20} className="spin" />
                ) : playing ? (
                  <Pause size={19} weight="fill" />
                ) : (
                  <Play size={19} weight="fill" />
                )}
              </button>
              <PlaybackProgress
                position={playbackPosition}
                envelopes={scene.envelopes}
                totalFrames={totalFrames}
                duration={scene.duration}
                onSeek={seekToFrame}
              />
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
                      if (next) ytPlayerRef.current.mute?.();
                      else ytPlayerRef.current.unMute?.();
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
                      Rain and snow animate while the track plays and appear in
                      exports.
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
      {mixOpen && (
        <Modal
          onClose={() => setMixOpen(false)}
          title="Your music mix"
          description="Layer up to 8 audio files and a YouTube video. All sources start together."
        >
          <div className="mix-sources" aria-label="Mix sources">
            <div className="mix-heading">
              <strong>Your mix</strong>
              <span>
                {sourceCount} source{sourceCount === 1 ? "" : "s"} · play
                together
              </span>
            </div>
            <ul>
              {localTracks.map((t) => (
                <li key={t.id}>
                  <MusicNotes size={15} aria-hidden="true" />
                  <span title={t.name}>
                    {t.name}
                    {t.isDemo ? " · Demo" : ""}
                  </span>
                  <button
                    className="icon-button"
                    aria-label={`Remove ${t.name}`}
                    disabled={loading}
                    onClick={() =>
                      commitLocalMix(
                        decodedTracks.current.filter(
                          (item) => item.id !== t.id,
                        ),
                      )
                    }
                  >
                    <X size={15} />
                  </button>
                </li>
              ))}
              {youtubeId && (
                <li>
                  <YoutubeLogo size={16} aria-hidden="true" />
                  <span title={track.name}>{track.name}</span>
                  <button
                    className="icon-button"
                    aria-label="Remove YouTube video"
                    onClick={removeYoutube}
                  >
                    <X size={15} />
                  </button>
                </li>
              )}
            </ul>
            <div className="mix-levels">
              {localTracks.length > 0 && (
                <label>
                  Audio volume
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={localVolume}
                    onChange={(e) => setLocalVolume(+e.target.value)}
                  />
                  <output>{localVolume}%</output>
                </label>
              )}
              {youtubeId && (
                <label>
                  YouTube volume
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={youtubeVolume}
                    onChange={(e) => setYoutubeVolume(+e.target.value)}
                  />
                  <output>{youtubeVolume}%</output>
                </label>
              )}
            </div>
            <p>
              Play, pause, and seek all sources together. Editing sources
              restarts the mix.
            </p>
          </div>

          {sourceCount === 0 && (
            <p className="mix-guidance">
              Add audio files or a YouTube URL to begin.
            </p>
          )}
          <p className="mix-guidance">
            Audio files: up to 5 minutes and 60 MB each. Drop multiple files on
            the map or use Add audio files.
          </p>
          {error && (
            <p role="alert" className="source-error">
              {error}
            </p>
          )}
          <div className="mix-actions">
            <button
              className="primary-action"
              disabled={
                loading || (!scene.audioSrc && (!youtubeId || !!ytError))
              }
              onClick={togglePlay}
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
              {playing ? "Pause mix" : "Play mix"}
            </button>
            <button
              className="text-button"
              disabled={loading}
              onClick={() => upload.current?.click()}
            >
              <Plus size={16} /> Add audio files
            </button>
            <button
              className="text-button"
              disabled={loading}
              onClick={() => {
                setMixOpen(false);
                openYoutubeInput();
              }}
            >
              <YoutubeLogo size={17} />{" "}
              {youtubeId ? "Change video" : "Add YouTube"}
            </button>
          </div>
        </Modal>
      )}
      {modal && (
        <Modal
          onClose={() => setModal(false)}
          title="Export video"
          description="Create a video on your device. Keep this tab open while it renders."
        >
          <div className="export-options">
            <label>
              Format
              <select
                aria-label="Export format"
                value={exportFormat}
                disabled={exportBusy}
                onChange={(e) =>
                  setExportFormat(e.target.value as "mp4" | "webm")
                }
              >
                <option value="mp4">MP4</option>
                <option value="webm">WebM</option>
              </select>
            </label>
            <label>
              Resolution
              <select
                aria-label="Resolution"
                value={resolution}
                disabled={exportBusy}
                onChange={(e) => setResolution(e.target.value)}
              >
                <option value="1080">1080p · Full HD</option>
                <option value="720">720p · Smaller file</option>
              </select>
            </label>
            <label>
              Duration
              <select
                aria-label="Duration"
                value={exportDuration}
                disabled={exportBusy}
                onChange={(e) => setExportDuration(e.target.value)}
              >
                <option value="10">First 10 seconds</option>
                <option value="30">First 30 seconds</option>
                <option value="full">
                  Full track · {formatTime(scene.duration)}
                </option>
              </select>
            </label>
          </div>
          <p className="export-source-note">
            {youtubeId
              ? "Exports include your local audio mix; YouTube sound is not included. With no audio files, exports are silent. Preview volume and mute do not change exported audio."
              : "Includes your soundtrack and current map, colors, and effects. Preview volume and mute do not change the exported audio."}
          </p>
          <div
            className="export-feedback"
            role={videoExport.state.status === "failed" ? "alert" : "status"}
          >
            {videoExport.state.message}
          </div>
          {exportBusy && (
            <>
              <progress
                aria-label="Video export progress"
                max="1"
                value={videoExport.state.progress}
              />
              <p>
                {Math.round(videoExport.state.progress * 100)}% complete. You
                can close this panel and keep exploring.
              </p>
              <button
                className="text-button"
                disabled={videoExport.state.status === "cancelling"}
                onClick={videoExport.cancel}
              >
                Cancel export
              </button>
            </>
          )}
          {!exportBusy && (
            <div className="export-actions">
              {videoExport.state.url && (
                <a
                  className="primary-action"
                  href={videoExport.state.url}
                  download={videoExport.state.filename}
                >
                  <DownloadSimple size={18} /> Download video
                </a>
              )}
              <button
                className={
                  videoExport.state.url ? "text-button" : "primary-action"
                }
                disabled={
                  loading ||
                  !scene.mapData ||
                  (!youtubeId && !audioBytes.current)
                }
                onClick={() => {
                  pauseMix();
                  void videoExport.start(
                    scene,
                    audioBytes.current,
                    Number(resolution),
                    exportDuration === "full"
                      ? scene.duration
                      : Number(exportDuration),
                    exportFormat,
                  );
                }}
              >
                {videoExport.state.url
                  ? "Create another video"
                  : videoExport.state.status === "failed"
                    ? "Retry export"
                    : "Create video"}
              </button>
            </div>
          )}
        </Modal>
      )}
      {help && (
        <Modal onClose={() => setHelp(false)} title="How to use Watt a Beat">
          <div className="help-content">
            <p>
              Add multiple audio files and a YouTube URL to play them together
              as one mix. Open Your mix to adjust audio and YouTube volumes.
              Shorter sources finish, then all sources restart when the longest
              ends. Adding or removing a source pauses and restarts the mix. The
              audio is sourced directly from YouTube when you use a video link —
              no download or extraction. Bass, midrange, and treble light up
              different districts. Quiet passages dim the streets; louder beats
              bring the lights back. (YouTube uses simulated beat response.)
            </p>
            <p>
              Search for a place in the Philippines, drag to pan, and scroll to
              zoom. Use Ripple, Focus, or Power and tap a district label to play
              with the lights. Surprise me changes your place and look; Undo
              restores them. Hide the music and map tool panels, or shrink the
              YouTube preview to a mini player, when you want more of the map.
              Use Map settings to adjust the lights or cut power to individual
              districts.
            </p>
            <p>
              Choose City lights, Christmas, Moonlight, or Rain in the bottom
              bar. Export an MP4 or WebM on your device. YouTube exports are
              silent unless you add audio files; exports include the combined
              local soundtrack, without YouTube sound.
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
function HudPanel({
  className,
  label,
  bodyId,
  open,
  onToggle,
  restoreLabel,
  restoreIcon,
  hideLabel,
  showLabel,
  header,
  children,
}: {
  className: string;
  label: string;
  bodyId: string;
  open: boolean;
  onToggle: () => void;
  restoreLabel: string;
  restoreIcon: ReactNode;
  hideLabel: string;
  showLabel: string;
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className={`hud-panel ${className}${open ? "" : " is-collapsed"}`}
      aria-label={label}
    >
      <button
        type="button"
        className={open ? "hud-toggle" : "hud-restore"}
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={open ? hideLabel : showLabel}
        data-tooltip={open ? hideLabel : showLabel}
        onClick={onToggle}
      >
        {open ? (
          <CaretUp size={14} aria-hidden="true" />
        ) : (
          <>
            {restoreIcon}
            {restoreLabel}
          </>
        )}
      </button>
      <div className="hud-bar" hidden={!open}>
        {header}
      </div>
      <div className="hud-body" id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
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
      <span aria-hidden="true" className={`toggle ${checked ? "checked" : ""}`}>
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
      },
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

    if (
      content &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
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
        },
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
