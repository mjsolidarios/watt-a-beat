import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import {
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
} from "@phosphor-icons/react";
import { MapScene } from "./MapScene";
import { defaultScene, type SceneProps, type Theme } from "./types";
import { analyzeSamples } from "./audio-analysis.mjs";
import { useMapArea } from "./useMapArea";
import { LocationSearch } from "./LocationSearch";
import gsap from "gsap";

const formatTime = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;
const themes: { id: Theme; name: string; desc: string }[] = [
  { id: "midnight", name: "City lights", desc: "Warm & cinematic" },
  { id: "christmas", name: "Christmas", desc: "A little holiday magic" },
  { id: "moonlight", name: "Moonlight", desc: "Cool & understated" },
  { id: "rain", name: "Rain", desc: "Rain over the city" },
];
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
    artist: "Original ambient demo",
    isDemo: true,
  });
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [playing, setPlaying] = useState(false),
    [frame, setFrame] = useState(0),
    [muted, setMuted] = useState(false),
    [dragging, setDragging] = useState(false);
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
  const player = useRef<PlayerRef>(null),
    upload = useRef<HTMLInputElement>(null),
    audioBytes = useRef<Blob | null>(null),
    loadId = useRef(0),
    blobUrl = useRef(""),
    transportRef = useRef<HTMLElement>(null),
    playBtnRef = useRef<HTMLButtonElement>(null),
    focusChipRef = useRef<HTMLButtonElement>(null);
  const update = <K extends keyof SceneProps>(key: K, value: SceneProps[K]) =>
    setScene((s) => ({ ...s, [key]: value }));
  const loadAudio = useCallback(
    async (blob: Blob, name: string, isDemo: boolean) => {
      const id = ++loadId.current;
      setLoading(true);
      setError("");
      player.current?.pause();
      let context: AudioContext | undefined;
      try {
        if (blob.size > 60 * 1024 * 1024)
          throw new Error("Please choose an audio file smaller than 60 MB.");
        context = new AudioContext();
        const buffer = await context.decodeAudioData(await blob.arrayBuffer());
        if (buffer.duration > 300)
          throw new Error(
            "Choose a track under 5 minutes for this local studio.",
          );
        const mono = new Float32Array(buffer.length);
        for (let c = 0; c < buffer.numberOfChannels; c++) {
          const channel = buffer.getChannelData(c);
          for (let i = 0; i < mono.length; i++)
            mono[i] += channel[i] / buffer.numberOfChannels;
        }
        const envelopes = analyzeSamples(mono, buffer.sampleRate);
        if (id !== loadId.current) return;
        const url = URL.createObjectURL(blob);
        if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
        blobUrl.current = url;
        audioBytes.current = blob;
        setScene((s) => ({
          ...s,
          audioSrc: url,
          envelopes,
          duration: buffer.duration,
        }));
        setTrack({
          name: name.replace(/\.[^.]+$/, ""),
          artist: isDemo ? "Original ambient demo" : "Your soundtrack",
          isDemo,
        });
        setFrame(0);
        player.current?.seekTo(0);
        setJob(null);
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
    fetch("/after-hours.wav")
      .then((r) => {
        if (!r.ok)
          throw new Error("Demo audio unavailable. Upload a track to begin.");
        return r.blob();
      })
      .then((b) => {
        if (active) void loadAudio(b, "After hours", true);
      })
      .catch((e) => {
        if (active) {
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
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    },
    [],
  );
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const onFrame = ({ detail }: { detail: { frame: number } }) =>
      setFrame(detail.frame);
    const play = () => setPlaying(true),
      pause = () => setPlaying(false);
    p.addEventListener("frameupdate", onFrame);
    p.addEventListener("play", play);
    p.addEventListener("pause", pause);
    p.addEventListener("ended", pause);
    return () => {
      p.removeEventListener("frameupdate", onFrame);
      p.removeEventListener("play", play);
      p.removeEventListener("pause", pause);
      p.removeEventListener("ended", pause);
    };
  }, []);

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
    if (!loading) player.current?.toggle();
  }, [loading]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
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
    if (!job || !["queued", "rendering"].includes(job.status)) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/exports/${job.id}`);
        if (!res.ok) throw new Error("Could not check export progress.");
        setJob(await res.json());
      } catch (e) {
        setJob((j) =>
          j
            ? {
                ...j,
                status: "failed",
                error: e instanceof Error ? e.message : "Connection lost",
              }
            : j,
        );
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [job?.id, job?.status]);
  const selectDistrict = useCallback(
    (name: string) =>
      setScene((s) => ({ ...s, selected: s.selected === name ? null : name })),
    [],
  );
  const inputProps = useMemo(
    () => ({ ...scene, onSelect: selectDistrict, branding: false }),
    [scene, selectDistrict],
  );
  const totalFrames = Math.max(1, Math.ceil(scene.duration * 30));
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
  const exportVideo = async () => {
    if (!audioBytes.current) return;
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
      if (!res.ok) throw new Error(result.error || "Export failed.");
      setJob(result);
    } catch (e) {
      setJob({
        id: "",
        status: "failed",
        progress: 0,
        error:
          e instanceof Error ? e.message : "Export failed. Please try again.",
      });
    }
  };
  const exportBusy =
    !!job && ["uploading", "queued", "rendering"].includes(job.status);
  return (
    <div className="app-shell">
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
          Watt a Beat
          <span className="brand-divider" />
          <span className="brand-place" title={scene.mapData?.name}>
            {scene.mapData?.name ?? "Philippines"}
          </span>
        </a>
        <div className="header-right">
          <span className="local-tag">
            <span />
            You control the power
          </span>
          <button
            className="icon-button help-button"
            aria-label="How to use Watt a Beat"
            title="How to use Watt a Beat"
            onClick={() => setHelp(true)}
          >
            <Info size={20} />
          </button>
          <button
            className="icon-button settings-button"
            aria-label="Visualizer settings"
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            title="Visualizer settings"
            onClick={() => setSettingsOpen(true)}
          >
            <SlidersHorizontal size={21} />
          </button>
          <button
            className="export-button"
            disabled={loading || area.busy || !scene.mapData}
            onClick={() => setModal(true)}
            title="Export video"
          >
            <ArrowUpRight size={17} />
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
                loop
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
              title="MP3, WAV, M4A · up to 60 MB / 5 min"
            >
              <UploadSimple size={21} />
              <span>
                {loading
                  ? "Preparing your soundtrack…"
                  : dragging
                    ? "Release to load your soundtrack"
                    : "Drop your music anywhere on the map"}{" "}
                <span className="browse-copy">
                  or <u>browse files</u>
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
                title="Zoom in"
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
                title="Zoom out"
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
                title="Reset map view"
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
              title="Fullscreen map"
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
            <div className="dock-themes">
              <ThemePicker
                theme={scene.theme}
                onChange={(theme) => update("theme", theme)}
              />
            </div>
            <div className="track-row">
              <div className="track-art">
                <MusicNotes size={22} />
              </div>
              <div className="track-details">
                <strong>
                  {loading ? "Preparing your soundtrack…" : track.name}
                </strong>
                <span>
                  {track.artist}
                  {track.isDemo && <span className="demo-tag">DEMO</span>}
                </span>
              </div>
              <button
                className="icon-button"
                aria-label="Replace soundtrack"
                title="Replace soundtrack"
                onClick={() => upload.current?.click()}
              >
                <UploadSimple size={17} />
              </button>
            </div>
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
                  onChange={(e) => {
                    player.current?.seekTo(Number(e.target.value));
                    setFrame(Number(e.target.value));
                  }}
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
              <button
                className="icon-button volume-button"
                aria-label={muted ? "Unmute" : "Mute"}
                title={muted ? "Unmute" : "Mute"}
                onClick={() => {
                  if (muted) player.current?.unmute();
                  else player.current?.mute();
                  setMuted(!muted);
                }}
              >
                {muted ? <SpeakerSlash size={20} /> : <SpeakerHigh size={20} />}
              </button>
            </div>
            <div className="transport-footer">
              <span title="Best experienced with headphones">
                <Headphones size={13} />
              </span>
              <span>
                <kbd>space</kbd> to play or pause
              </span>
            </div>
          </section>
          <div className="workspace-footer">
            <span>The city’s power, set to your soundtrack.</span>
            <span>
              Created with React + Remotion <ArrowUpRight size={12} />
            </span>
          </div>
        </section>
        {settingsOpen && (
          <Modal
            title="Visualizer settings"
            className="settings-modal"
            onClose={() => setSettingsOpen(false)}
          >
            <aside className="sidebar">
              <div className="panel-title">
                <SlidersHorizontal size={19} />
                <h2>Make it yours</h2>
                <button
                  className="text-button"
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
                  Reset
                </button>
              </div>
              <section className="control-section soundtrack-section">
                <div className="section-label">
                  <h3>Soundtrack</h3>
                  <span>01</span>
                </div>
                <button
                  className={`upload-zone ${dragging ? "dragging" : ""}`}
                  disabled={loading}
                  onClick={() => upload.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    receiveFile(e.dataTransfer.files[0]);
                  }}
                >
                  <span className="upload-icon">
                    <UploadSimple size={21} />
                  </span>
                  <strong>
                    {loading ? "Analyzing audio…" : "Drop your music here"}
                  </strong>
                  <span>
                    or <u>browse files</u>
                  </span>
                  <small>MP3, WAV, M4A · up to 60 MB / 5 min</small>
                </button>
                {error && (
                  <p role="alert" className="error-message">
                    {error}
                  </p>
                )}
                <div className="demo-note">
                  <span className="tiny-dot" />
                  {track.isDemo
                    ? "An original demo is ready to play."
                    : "Your soundtrack is ready."}
                </div>
              </section>
              <section
                className="control-section"
                data-panel="atmosphere"
                id="panel-atmosphere"
              >
                <div className="section-label">
                  <h3>Atmosphere</h3>
                  <span>02</span>
                </div>
                <div className="themes">
                  {themes.map((theme) => (
                    <button
                      key={theme.id}
                      className={`theme-option ${scene.theme === theme.id ? "selected" : ""}`}
                      onClick={() => update("theme", theme.id)}
                      aria-pressed={scene.theme === theme.id}
                      aria-label={`${theme.name} ${theme.desc}`}
                      title={theme.desc}
                    >
                      <span className={`theme-thumb ${theme.id}`}>
                        <span />
                        <span />
                        <span />
                        {theme.id === "rain" ? (
                          <CloudRain size={20} />
                        ) : theme.id === "christmas" ? (
                          <Snowflake size={20} />
                        ) : theme.id === "moonlight" ? (
                          <Moon size={20} />
                        ) : (
                          <Sparkle size={20} />
                        )}
                      </span>
                      <span className="radio-mark">
                        {scene.theme === theme.id && <span />}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
              <section
                className="control-section"
                data-panel="effects"
                id="panel-effects"
              >
                <div className="section-label">
                  <h3>Light & movement</h3>
                  <span>03</span>
                </div>
                <div className="slider-group">
                  <label htmlFor="intensity">
                    Glow intensity <span>{scene.intensity}%</span>
                  </label>
                  <input
                    id="intensity"
                    type="range"
                    min="0"
                    max="100"
                    value={scene.intensity}
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
                    Audio sensitivity <span>{scene.sensitivity}%</span>
                  </label>
                  <input
                    id="sensitivity"
                    type="range"
                    min="0"
                    max="100"
                    value={scene.sensitivity}
                    style={
                      {
                        "--range": `${scene.sensitivity}%`,
                      } as React.CSSProperties
                    }
                    onChange={(e) => update("sensitivity", +e.target.value)}
                  />
                  <div className="range-labels">
                    <span>Subtle</span>
                    <span>Expressive</span>
                  </div>
                </div>
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
                      Weather particles move during playback and video export.
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
                    {scene.enabled.length} / {districtNames.length}
                  </span>
                </div>
                <div className="district-chips">
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
                      {scene.enabled.includes(name) && <Check size={11} />}{" "}
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
                    Cut all power
                  </button>
                  <button
                    className="text-button"
                    disabled={scene.enabled.length === districtNames.length}
                    onClick={() => update("enabled", districtNames)}
                  >
                    Reconnect all
                  </button>
                </div>
                <p className="area-hint">
                  Toggle a district to cut its power. Connected districts react
                  to the music.
                </p>
              </section>
              <div className="sidebar-note">
                <Sparkle size={17} />
                <p>
                  Quiet track. Dark streets. Power on the beat.
                  <br />
                  <span>An artistic simulation of local power.</span>
                </p>
              </div>
            </aside>
          </Modal>
        )}
      </main>
      {modal && (
        <Modal onClose={() => setModal(false)} title="Export your brownout mix">
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
            <span>MP4 / H.264</span>
            <span>30 fps</span>
            <span>Audio included</span>
          </div>
          {job?.status === "failed" && (
            <p role="alert" className="error-message">
              {job.error}
            </p>
          )}
          {exportBusy ? (
            <div className="render-progress" role="status">
              <div>
                <span>
                  {job?.status === "uploading"
                    ? "Preparing audio…"
                    : job?.status === "queued"
                      ? "Preparing the renderer…"
                      : "Rendering your city…"}
                </span>
                <span>{Math.round((job?.progress ?? 0) * 100)}%</span>
              </div>
              <progress max="1" value={job?.progress ?? 0} />
              <small>You can close this panel while your video renders.</small>
            </div>
          ) : job?.status === "done" ? (
            <div>
              <a
                className="primary-action"
                href={`/api/exports/${job.id}/download`}
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
            <button className="primary-action" onClick={exportVideo}>
              <ArrowUpRight size={18} /> Render video
            </button>
          )}
          <p className="modal-footnote">
            Rendered locally with Remotion. Your music stays on this computer.
          </p>
        </Modal>
      )}
      {help && (
        <Modal
          onClose={() => setHelp(false)}
          title="Let the city follow your sound"
        >
          <div className="help-content">
            <p>
              Press play or upload a soundtrack. Bass, midrange, and treble
              restore power to different districts. Quiet passages cause
              brownouts; stronger beats bring the street lights back.
            </p>
            <p>
              Toggle a district to disconnect it, or cut all power at once.
              Reconnect districts to let them follow the music again. Click map
              labels to focus the preview. Christmas adds red and green lights
              with falling crystalline snowflakes. Rain adds cool lights and
              drifting rain streaks. Weather moves during playback and is
              included in video exports.
            </p>
            <p>
              Export video renders your map and audio as an MP4. District
              lighting groups follow nearby street locations; they are artistic
              zones, not official administrative boundaries.
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
              , ODbL. Audio preview and export use{" "}
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
    <div className="toggle-row">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        className={`toggle ${checked ? "checked" : ""}`}
        onClick={onChange}
      >
        <span />
      </button>
    </div>
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
          aria-label={`${option.name} ${option.desc}`}
          title={option.desc}
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
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    const content = contentRef.current;
    if (!dialog) return;

    dialog.showModal();

    if (content) {
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
  }, []);

  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div ref={contentRef} className="modal-content">
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
