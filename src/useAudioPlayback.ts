import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { PlayerRef } from "@remotion/player";

const FPS = 30;

/** The browser audio clock owns preview time; rendering must never seek the sound. */
export function useAudioPlayback({
  src,
  totalFrames,
  player,
  onFrame,
  onPlaying,
  onError,
}: {
  src: string;
  totalFrames: number;
  player: RefObject<PlayerRef | null>;
  onFrame: (frame: number) => void;
  onPlaying: (playing: boolean) => void;
  onError: (message: string) => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const media = audio.current;
    if (!media) return;
    let animationFrame = 0;
    let lastFrame = -1;
    const syncFrame = () => {
      const frame = Math.min(
        totalFrames - 1,
        Math.max(0, Math.floor(media.currentTime * FPS)),
      );
      if (frame === lastFrame) return;
      lastFrame = frame;
      player.current?.seekTo(frame);
      onFrame(frame);
    };
    const tick = () => {
      syncFrame();
      if (!media.paused && !media.ended) {
        animationFrame = requestAnimationFrame(tick);
      }
    };
    const play = () => {
      cancelAnimationFrame(animationFrame);
      onPlaying(true);
      tick();
    };
    const pause = () => {
      cancelAnimationFrame(animationFrame);
      onPlaying(false);
      syncFrame();
    };
    const visibility = () => {
      if (!document.hidden) syncFrame();
    };
    media.addEventListener("play", play);
    media.addEventListener("pause", pause);
    media.addEventListener("ended", pause);
    media.addEventListener("timeupdate", syncFrame);
    media.addEventListener("seeked", syncFrame);
    media.addEventListener("loadedmetadata", syncFrame);
    document.addEventListener("visibilitychange", visibility);
    onPlaying(false);
    syncFrame();
    return () => {
      cancelAnimationFrame(animationFrame);
      media.removeEventListener("play", play);
      media.removeEventListener("pause", pause);
      media.removeEventListener("ended", pause);
      media.removeEventListener("timeupdate", syncFrame);
      media.removeEventListener("seeked", syncFrame);
      media.removeEventListener("loadedmetadata", syncFrame);
      document.removeEventListener("visibilitychange", visibility);
      media.pause();
    };
  }, [src, totalFrames, player, onFrame, onPlaying]);

  const toggle = useCallback(() => {
    const media = audio.current;
    if (!media || !src) return;
    if (!media.paused) {
      media.pause();
      return;
    }
    const source = media.src;
    void media.play().catch((error: unknown) => {
      // A pause or track replacement can cancel an outstanding play request.
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (media.src !== source) return;
      onError("Playback could not start. Press play to try again.");
    });
  }, [src, onError]);

  const seek = useCallback((requestedFrame: number) => {
    const media = audio.current;
    if (!media || !src) return;
    const frame = Math.max(0, Math.min(totalFrames - 1, requestedFrame));
    // Only an explicit scrub changes audio time. Normal rendering follows it.
    media.currentTime = frame / FPS;
    player.current?.seekTo(frame);
    onFrame(frame);
  }, [src, totalFrames, player, onFrame]);

  return { audio, toggle, seek };
}
