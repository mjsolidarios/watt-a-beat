import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { PlayerRef } from "@remotion/player";
import type { YoutubeSource } from "./useYoutubeSources";

/** The longest available source owns time; all other sources follow its clock. */
export function useMixPlayback({
  src,
  localDuration,
  youtubeDuration,
  totalFrames,
  youtube,
  player,
  onFrame,
  onPlaying,
  onError,
}: {
  src: string;
  localDuration: number;
  youtubeDuration: number;
  totalFrames: number;
  youtube: RefObject<Map<string, YoutubeSource>>;
  player: RefObject<PlayerRef | null>;
  onFrame: (frame: number) => void;
  onPlaying: (playing: boolean) => void;
  onError: (message: string) => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const settings = useRef({ src, localDuration, totalFrames });
  settings.current = { src, localDuration, totalFrames };
  const desired = useRef(false);
  const running = useRef(false);
  const handling = useRef(false);
  const position = useRef(0);
  const lastTime = useRef(0);
  const buffering = useRef(new Set<string>());
  const expectedPause = useRef(new Map<string, number>());
  const pendingSeek = useRef(
    new Map<string, { resume: boolean; expires: number }>(),
  );
  const callbacks = useRef({ start: (_time: number) => {}, pause: () => {} });
  const videos = useCallback(
    () => [...youtube.current.values()].filter((s) => s.ready && s.player),
    [youtube],
  );
  const master = useCallback(
    () =>
      videos().reduce<YoutubeSource | undefined>(
        (longest, s) =>
          s.duration >
          (longest?.duration ??
            (settings.current.src ? settings.current.localDuration : 0))
            ? s
            : longest,
        undefined,
      ),
    [videos],
  );
  const time = useCallback(
    () =>
      master()?.player?.getCurrentTime() ??
      (settings.current.src
        ? (audio.current?.currentTime ?? 0)
        : position.current),
    [master],
  );
  const draw = useCallback(
    (seconds: number) => {
      position.current = seconds;
      const frame = Math.max(
        0,
        Math.min(settings.current.totalFrames - 1, Math.floor(seconds * 30)),
      );
      if (player.current?.getCurrentFrame() !== frame)
        player.current?.seekTo(frame);
      onFrame(frame);
    },
    [onFrame, player],
  );
  const state = useCallback(
    (value: boolean) => {
      running.current = value;
      onPlaying(value);
    },
    [onPlaying],
  );
  const pauseVideo = useCallback((source: YoutubeSource) => {
    const p = source.player;
    if (
      !p ||
      p.getPlayerState() === 2 ||
      p.getPlayerState() === 0 ||
      p.getPlayerState() === 5
    )
      return;
    expectedPause.current.set(source.key, performance.now() + 2000);
    p.pauseVideo();
  }, []);
  const playLocal = useCallback(() => {
    const media = audio.current;
    if (
      !media ||
      !settings.current.src ||
      !media.paused ||
      position.current >= settings.current.localDuration
    )
      return;
    void media.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      callbacks.current.pause();
      onError("Playback could not start. Press play to try again.");
    });
  }, [onError]);
  const settle = useCallback(() => {
    if (!desired.current || buffering.current.size) return;
    const active = videos().filter((s) => position.current < s.duration);
    if (active.some((s) => s.player!.getPlayerState() !== 1)) return;
    playLocal();
    if (active.length || (settings.current.src && !audio.current?.paused))
      state(true);
  }, [playLocal, state, videos]);
  const pause = useCallback(() => {
    const seconds = time();
    desired.current = false;
    buffering.current.clear();
    pendingSeek.current.clear();
    state(false);
    handling.current = true;
    audio.current?.pause();
    for (const source of videos()) pauseVideo(source);
    handling.current = false;
    draw(seconds);
  }, [draw, pauseVideo, state, time, videos]);
  const seekSeconds = useCallback(
    (seconds: number) => {
      draw(seconds);
      lastTime.current = seconds;
      handling.current = true;
      if (audio.current && settings.current.src) {
        audio.current.currentTime = Math.min(
          seconds,
          settings.current.localDuration,
        );
        if (seconds >= settings.current.localDuration && master())
          audio.current.pause();
      }
      for (const source of videos()) {
        pendingSeek.current.set(source.key, {
          resume: desired.current,
          expires: performance.now() + 2000,
        });
        source.player!.seekTo(Math.min(seconds, source.duration), true);
        if (seconds >= source.duration) pauseVideo(source);
        else if (desired.current) source.player!.playVideo();
      }
      handling.current = false;
      if (desired.current) settle();
    },
    [draw, master, pauseVideo, settle, videos],
  );
  const start = useCallback(
    (seconds: number) => {
      desired.current = true;
      pendingSeek.current.clear();
      buffering.current.clear();
      draw(seconds);
      handling.current = true;
      for (const source of videos()) {
        if (seconds >= source.duration) continue;
        const p = source.player!;
        if (Math.abs(p.getCurrentTime() - seconds) > 0.35) {
          pendingSeek.current.set(source.key, {
            resume: true,
            expires: performance.now() + 2000,
          });
          p.seekTo(seconds, true);
        }
        p.playVideo();
      }
      handling.current = false;
      settle();
    },
    [draw, settle, videos],
  );
  callbacks.current = { start, pause };
  const toggle = useCallback(() => {
    if (desired.current || running.current) pause();
    else if (settings.current.src || videos().length) start(time());
  }, [pause, start, time, videos]);
  const seek = useCallback(
    (frame: number) => {
      seekSeconds(
        Math.max(0, Math.min(settings.current.totalFrames - 1, frame)) / 30,
      );
    },
    [seekSeconds],
  );
  const youtubeState = useCallback(
    (key: string, value: number) => {
      const source = youtube.current.get(key);
      if (!source?.ready || !source.player) return;
      if (
        value === 2 &&
        (expectedPause.current.get(key) ?? 0) > performance.now()
      ) {
        expectedPause.current.delete(key);
        return;
      }
      if (handling.current) return;
      const pending = pendingSeek.current.get(key);
      if (pending && pending.expires < performance.now())
        pendingSeek.current.delete(key);
      else if (pending && (value === 1 || value === 2)) {
        if (!pending.resume) {
          if (value === 1) pauseVideo(source);
          return;
        }
        if (position.current >= source.duration) return;
        if (value === 2) {
          source.player.playVideo();
          return;
        }
        pendingSeek.current.delete(key);
      }
      if (value === 1) {
        if (buffering.current.delete(key)) {
          if (!buffering.current.size && desired.current)
            start(position.current);
          return;
        }
        if (!desired.current) {
          seekSeconds(source.player.getCurrentTime());
          start(source.player.getCurrentTime());
        } else settle();
      } else if (
        value === 3 &&
        desired.current &&
        position.current < source.duration
      ) {
        if (!buffering.current.size) draw(time());
        buffering.current.add(key);
        state(false);
        handling.current = true;
        audio.current?.pause();
        for (const other of videos())
          if (other.key !== key && !buffering.current.has(other.key))
            pauseVideo(other);
        handling.current = false;
      } else if (value === 2 && position.current < source.duration) {
        pause();
      } else if (value === 0 && desired.current && master()?.key === key) {
        seekSeconds(0);
        start(0);
      }
    },
    [
      draw,
      master,
      pause,
      pauseVideo,
      seekSeconds,
      settle,
      start,
      state,
      time,
      videos,
      youtube,
    ],
  );
  useEffect(() => {
    const media = audio.current;
    if (!media) return;
    let raf = 0;
    const play = () => {
      if (!media.paused && !buffering.current.size) {
        desired.current = true;
        state(true);
        draw(time());
      }
    };
    const paused = () => {
      if (
        handling.current ||
        !media.paused ||
        master() ||
        buffering.current.size ||
        !desired.current
      )
        return;
      pause();
    };
    const sync = () => {
      if (!master()) draw(media.currentTime);
    };
    const visible = () => {
      if (!document.hidden) draw(time());
    };
    const tick = () => {
      const seconds = time();
      if (running.current) {
        draw(seconds);
        const main = master();
        if (seconds < lastTime.current - 0.5) {
          seekSeconds(seconds);
          start(seconds);
        } else {
          if (
            main &&
            settings.current.src &&
            seconds < settings.current.localDuration
          ) {
            if (Math.abs(media.currentTime - seconds) > 0.6)
              media.currentTime = seconds;
            playLocal();
          }
          for (const source of videos()) {
            if (source.key === main?.key || seconds >= source.duration)
              continue;
            const p = source.player!;
            if (Math.abs(p.getCurrentTime() - seconds) > 0.6) {
              pendingSeek.current.set(source.key, {
                resume: true,
                expires: performance.now() + 2000,
              });
              p.seekTo(seconds, true);
            }
            if (p.getPlayerState() === 0) p.playVideo();
          }
        }
      }
      lastTime.current = seconds;
      raf = requestAnimationFrame(tick);
    };
    media.addEventListener("play", play);
    media.addEventListener("pause", paused);
    media.addEventListener("seeked", sync);
    media.addEventListener("timeupdate", sync);
    media.addEventListener("loadedmetadata", sync);
    document.addEventListener("visibilitychange", visible);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      media.removeEventListener("play", play);
      media.removeEventListener("pause", paused);
      media.removeEventListener("seeked", sync);
      media.removeEventListener("timeupdate", sync);
      media.removeEventListener("loadedmetadata", sync);
      document.removeEventListener("visibilitychange", visible);
      media.pause();
    };
  }, [
    draw,
    master,
    pause,
    pauseVideo,
    playLocal,
    seekSeconds,
    start,
    state,
    time,
    videos,
  ]);
  return {
    audio,
    toggle,
    seek,
    pause,
    youtubeState,
    loopLocal: !!src && localDuration >= youtubeDuration,
  };
}
