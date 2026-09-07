import { useCallback, useEffect, useRef, useState } from "react";
import { ensureYoutubeApi, youtubeErrorMessage } from "./youtube.mjs";

export interface YoutubePlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getVideoData(): { title?: string; author?: string };
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  destroy(): void;
}
export type YoutubeSource = {
  key: string;
  videoId: string;
  name: string;
  author: string;
  duration: number;
  volume: number;
  status: string;
  error: string;
  ready: boolean;
  generation: number;
  player?: YoutubePlayer;
};
export const MAX_YOUTUBE_SOURCES = 8;

/** Each video owns its player and load generation, so retry/removal is isolated. */
export function useYoutubeSources(muted: boolean) {
  const entries = useRef(new Map<string, YoutubeSource>());
  const hosts = useRef(new Map<string, HTMLDivElement>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [sources, setSources] = useState<YoutubeSource[]>([]);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const events = useRef({
    onState: (_key: string, _state: number) => {},
    onFailure: () => {},
  });
  const patch = useCallback((key: string, changes: Partial<YoutubeSource>) => {
    const current = entries.current.get(key);
    if (!current) return;
    entries.current.set(key, { ...current, ...changes });
    setSources([...entries.current.values()]);
  }, []);
  const clearTimer = useCallback((key: string) => {
    clearTimeout(timers.current.get(key));
    timers.current.delete(key);
  }, []);
  const connect = useCallback(
    async (key: string) => {
      const source = entries.current.get(key);
      if (!source) return;
      const generation = source.generation;
      const current = () => entries.current.get(key)?.generation === generation;
      const fail = (message: string) => {
        if (!current()) return;
        clearTimer(key);
        const player = entries.current.get(key)?.player;
        patch(key, {
          error: message,
          status: "Unable to play",
          ready: false,
          duration: 0,
          player: undefined,
          generation: generation + 1,
        });
        events.current.onFailure();
        player?.destroy();
      };
      try {
        await ensureYoutubeApi();
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        if (!current()) return;
        const host = hosts.current.get(key);
        if (!host) {
          fail("The video preview could not open. Retry this video.");
          return;
        }
        host.replaceChildren();
        const element = document.createElement("div");
        host.appendChild(element);
        patch(key, { status: "Loading video…" });
        timers.current.set(
          key,
          setTimeout(
            () =>
              fail(
                "This video took too long to load. Retry or remove it from the mix.",
              ),
            15000,
          ),
        );
        const details = (player: YoutubePlayer) => {
          const data = player.getVideoData?.() || {};
          const duration = player.getDuration?.() || 0;
          patch(key, {
            name: data.title || "YouTube video",
            author: data.author || "YouTube",
            duration:
              Number.isFinite(duration) && duration > 0 ? duration : 120,
          });
        };
        const player: YoutubePlayer = new (window as any).YT.Player(element, {
          height: "200",
          width: "100%",
          videoId: source.videoId,
          playerVars: {
            autoplay: 0,
            controls: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: ({ target }: { target: YoutubePlayer }) => {
              if (!current()) return;
              clearTimer(key);
              details(target);
              target.setVolume(entries.current.get(key)?.volume ?? 100);
              if (mutedRef.current) target.mute();
              else target.unMute();
              patch(key, {
                player: target,
                ready: true,
                status: "Ready to play",
              });
            },
            onStateChange: ({
              data,
              target,
            }: {
              data: number;
              target: YoutubePlayer;
            }) => {
              if (!current()) return;
              if (data === 1) details(target);
              patch(key, {
                status:
                  data === 1
                    ? "Playing"
                    : data === 3
                      ? "Buffering…"
                      : data === 0
                        ? "Finished"
                        : "Paused",
              });
              events.current.onState(key, data);
            },
            onAutoplayBlocked: () => {
              if (!current()) return;
              events.current.onFailure();
              patch(key, {
                status: "Press play in this video, then play the mix.",
              });
            },
            onError: ({ data }: { data: number }) =>
              fail(youtubeErrorMessage(data)),
          },
        });
        if (current()) patch(key, { player });
        else player.destroy();
      } catch (error) {
        fail(
          error instanceof Error
            ? error.message
            : "Couldn’t connect to YouTube. Retry this video.",
        );
      }
    },
    [clearTimer, patch],
  );
  const add = useCallback(
    (videoId: string) => {
      if (entries.current.size >= MAX_YOUTUBE_SOURCES) return false;
      const key = crypto.randomUUID();
      entries.current.set(key, {
        key,
        videoId,
        name: "Loading video details…",
        author: "YouTube",
        duration: 0,
        volume: 100,
        status: "Connecting to YouTube…",
        error: "",
        ready: false,
        generation: 0,
      });
      setSources([...entries.current.values()]);
      void connect(key);
      return true;
    },
    [connect],
  );
  const remove = useCallback(
    (key: string) => {
      const source = entries.current.get(key);
      entries.current.delete(key);
      clearTimer(key);
      source?.player?.destroy();
      setSources([...entries.current.values()]);
    },
    [clearTimer],
  );
  const clear = useCallback(() => {
    for (const key of entries.current.keys()) remove(key);
  }, [remove]);
  const retry = useCallback(
    (key: string) => {
      const source = entries.current.get(key);
      if (!source) return;
      clearTimer(key);
      patch(key, {
        player: undefined,
        ready: false,
        error: "",
        duration: 0,
        status: "Connecting to YouTube…",
        generation: source.generation + 1,
      });
      source.player?.destroy();
      void connect(key);
    },
    [clearTimer, connect, patch],
  );
  const setVolume = useCallback(
    (key: string, volume: number) => {
      patch(key, { volume });
      entries.current.get(key)?.player?.setVolume(volume);
    },
    [patch],
  );
  const attachHost = useCallback(
    (key: string, element: HTMLDivElement | null) => {
      if (element) hosts.current.set(key, element);
      else hosts.current.delete(key);
    },
    [],
  );
  useEffect(() => {
    for (const source of entries.current.values()) {
      if (!source.ready) continue;
      if (muted) source.player?.mute();
      else source.player?.unMute();
    }
  }, [muted]);
  useEffect(
    () => () => {
      const old = [...entries.current.values()];
      entries.current.clear();
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
      for (const source of old) source.player?.destroy();
    },
    [],
  );
  return {
    sources,
    entries,
    events,
    add,
    remove,
    clear,
    retry,
    setVolume,
    attachHost,
    loading: sources.some((source) => !source.ready && !source.error),
  };
}
