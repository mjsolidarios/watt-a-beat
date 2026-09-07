import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { PlayerRef } from "@remotion/player";

/** The longest media source owns time. Rendering never seeks the audio master. */
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
  youtube: RefObject<any>;
  player: RefObject<PlayerRef | null>;
  onFrame: (frame: number) => void;
  onPlaying: (playing: boolean) => void;
  onError: (message: string) => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const running = useRef(false);
  const desired = useRef(false);
  const handling = useRef(false);
  const raf = useRef(0);
  const lastTime = useRef(0);
  const pendingSeek = useRef<{
    time: number;
    resume: boolean;
    expires: number;
  } | null>(null);
  const settings = useRef({ src, localDuration, youtubeDuration, totalFrames });
  settings.current = { src, localDuration, youtubeDuration, totalFrames };
  const ytMaster = () => {
    const s = settings.current;
    return !!youtube.current && (!s.src || s.youtubeDuration > s.localDuration);
  };
  const draw = useCallback(
    (time: number) => {
      const frame = Math.max(
        0,
        Math.min(settings.current.totalFrames - 1, Math.floor(time * 30)),
      );
      // Queue the map update before the synchronous progress subscription flushes.
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
  const playLocal = useCallback(() => {
    const media = audio.current;
    if (!media || !settings.current.src || !media.paused) return;
    void media.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      desired.current = false;
      state(false);
      youtube.current?.pauseVideo?.();
      onError("Playback could not start. Press play to try again.");
    });
  }, [onError, state, youtube]);
  const pause = useCallback(() => {
    desired.current = false;
    pendingSeek.current = null;
    handling.current = true;
    audio.current?.pause();
    youtube.current?.pauseVideo?.();
    handling.current = false;
    state(false);
    draw(
      ytMaster()
        ? youtube.current?.getCurrentTime?.() || 0
        : audio.current?.currentTime || 0,
    );
  }, [draw, state, youtube]);
  const seekSeconds = useCallback(
    (time: number) => {
      handling.current = true;
      const s = settings.current;
      if (audio.current && s.src)
        audio.current.currentTime = Math.min(time, s.localDuration);
      if (youtube.current) {
        pendingSeek.current = {
          time,
          resume: desired.current,
          expires: performance.now() + 2000,
        };
        youtube.current.seekTo?.(Math.min(time, s.youtubeDuration), true);
        if (desired.current && time < s.youtubeDuration)
          youtube.current.playVideo?.();
      }
      handling.current = false;
      lastTime.current = time;
      draw(time);
      if (desired.current && time < s.localDuration) playLocal();
    },
    [draw, playLocal, youtube],
  );
  const seek = useCallback(
    (frame: number) => {
      seekSeconds(
        Math.max(0, Math.min(settings.current.totalFrames - 1, frame)) / 30,
      );
    },
    [seekSeconds],
  );
  const toggle = useCallback(() => {
    if (desired.current || running.current) {
      pause();
      return;
    }
    const s = settings.current;
    if (!s.src && !youtube.current) return;
    desired.current = true;
    pendingSeek.current = null;
    if (youtube.current) {
      const time = ytMaster()
        ? youtube.current.getCurrentTime?.() || 0
        : audio.current?.currentTime || 0;
      if (time < s.youtubeDuration || ytMaster()) {
        // Wait for the iframe's PLAYING event before starting local audio.
        youtube.current.playVideo?.();
        return;
      }
    }
    playLocal();
  }, [pause, playLocal, youtube]);
  const youtubeState = useCallback(
    (value: number) => {
      if (handling.current) return;
      const s = settings.current;
      const p = youtube.current;
      const media = audio.current;
      const seekRequest = pendingSeek.current;
      if (seekRequest && performance.now() > seekRequest.expires)
        pendingSeek.current = null;
      if (pendingSeek.current && (value === 1 || value === 2)) {
        const request = pendingSeek.current;
        if (!request.resume) {
          if (value === 1) p?.pauseVideo?.();
          state(false);
          return;
        }
        if (request.time >= s.youtubeDuration && !ytMaster()) return;
        if (value === 2) {
          p?.playVideo?.();
          return;
        }
        pendingSeek.current = null;
      }
      const videoFinishedBeforeMix =
        !ytMaster() &&
        !!s.src &&
        (media?.currentTime ?? 0) >= s.youtubeDuration;
      if (videoFinishedBeforeMix && (value === 2 || value === 3)) return;
      if (value === 1) {
        desired.current = true;
        const time = p?.getCurrentTime?.() || 0;
        if (media && s.src) {
          if (Math.abs(media.currentTime - time) > 0.35)
            media.currentTime = Math.min(time, s.localDuration);
          if (time < s.localDuration) playLocal();
        }
        state(true);
      } else if (value === 3) {
        // Buffering suspends the whole mix, but preserves the user's play intent.
        handling.current = true;
        media?.pause();
        handling.current = false;
        state(false);
      } else if (value === 2) {
        pause();
      } else if (value === 0 && ytMaster() && desired.current) {
        seekSeconds(0);
        p?.playVideo?.();
      }
      // A shorter video finishing must not stop the remaining local music.
    },
    [pause, playLocal, seekSeconds, state, youtube],
  );

  useEffect(() => {
    const media = audio.current;
    if (!media) return;
    const play = () => {
      if (handling.current || media.paused) return;
      desired.current = true;
      state(true);
    };
    const paused = () => {
      if (
        handling.current ||
        ytMaster() ||
        !media.paused ||
        (desired.current && youtube.current?.getPlayerState?.() === 3)
      )
        return;
      pause();
    };
    const seeked = () => {
      if (!ytMaster()) draw(media.currentTime);
    };
    const tick = () => {
      const s = settings.current;
      const p = youtube.current;
      const masterIsYoutube = ytMaster();
      const time = masterIsYoutube
        ? p?.getCurrentTime?.() || 0
        : media.currentTime || 0;
      if (masterIsYoutube || running.current) draw(time);
      if (running.current) {
        if (masterIsYoutube && s.src) {
          if (time < s.localDuration) {
            if (Math.abs(media.currentTime - time) > 0.6)
              media.currentTime = time;
            playLocal();
          } else if (!media.paused) {
            handling.current = true;
            media.pause();
            handling.current = false;
          }
        } else if (p && s.youtubeDuration > 0 && time < s.youtubeDuration) {
          const videoTime = p.getCurrentTime?.() || 0;
          if (
            time < lastTime.current - 0.5 ||
            Math.abs(videoTime - time) > 0.6
          ) {
            pendingSeek.current = {
              time,
              resume: desired.current,
              expires: performance.now() + 2000,
            };
            p.seekTo?.(time, true);
          }
          if (p.getPlayerState?.() === 0 || p.getPlayerState?.() === 2)
            p.playVideo?.();
        }
      }
      lastTime.current = time;
      raf.current = requestAnimationFrame(tick);
    };
    media.addEventListener("play", play);
    media.addEventListener("pause", paused);
    media.addEventListener("seeked", seeked);
    media.addEventListener("loadedmetadata", seeked);
    raf.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf.current);
      media.removeEventListener("play", play);
      media.removeEventListener("pause", paused);
      media.removeEventListener("seeked", seeked);
      media.removeEventListener("loadedmetadata", seeked);
      media.pause();
    };
  }, [draw, pause, playLocal, state, youtube]);
  return {
    audio,
    toggle,
    seek,
    pause,
    youtubeState,
    loopLocal: !!src && localDuration >= youtubeDuration,
  };
}
