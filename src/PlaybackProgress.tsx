import { useMemo, useSyncExternalStore } from "react";

export const formatTime = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;

// Only the transport subscribes to frame changes. Advancing playback must not
// reconcile the entire app (settings, search, dialogs and Player) 30 times/sec.
export function usePlaybackPosition() {
  return useMemo(() => {
    let frame = 0;
    const listeners = new Set<() => void>();
    return {
      getSnapshot: () => frame,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      setFrame: (next: number) => {
        if (frame === next) return;
        frame = next;
        listeners.forEach((listener) => listener());
      },
    };
  }, []);
}

export function PlaybackProgress({
  position,
  envelopes,
  totalFrames,
  duration,
  onSeek,
}: {
  position: ReturnType<typeof usePlaybackPosition>;
  envelopes: number[][];
  totalFrames: number;
  duration: number;
  onSeek: (frame: number) => void;
}) {
  const frame = useSyncExternalStore(
    position.subscribe,
    position.getSnapshot,
    position.getSnapshot,
  );
  const waveform = useMemo(
    () =>
      Array.from({ length: 120 }, (_, i) => {
        const chunk =
          envelopes[
            Math.min(
              envelopes.length - 1,
              Math.floor((i * envelopes.length) / 120),
            )
          ];
        return chunk ? Math.max(0.08, ...chunk) : 0.15;
      }),
    [envelopes],
  );
  return (
    <>
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
          onChange={(e) => onSeek(Number(e.target.value))}
        />
        <div
          className="playhead"
          style={{ left: `${(frame / totalFrames) * 100}%` }}
        />
      </div>
      <span className="timecode">
        {formatTime(frame / 30)}
        <span> / {formatTime(duration)}</span>
      </span>
    </>
  );
}
