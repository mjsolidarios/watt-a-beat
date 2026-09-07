export function extractYoutubeId(value) {
  try {
    const url = new URL(value.trim());
    if (!["https:", "http:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    let id;
    if (host === "youtu.be") id = url.pathname.split("/")[1];
    else if (
      [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
      ].includes(host)
    ) {
      const parts = url.pathname.split("/");
      id =
        url.pathname === "/watch"
          ? url.searchParams.get("v")
          : ["shorts", "embed", "live"].includes(parts[1])
            ? parts[2]
            : null;
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

let apiPromise;
export function ensureYoutubeApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const previous = window.onYouTubeIframeAPIReady;
    const finish = (error) => {
      clearTimeout(timer);
      window.onYouTubeIframeAPIReady = previous;
      script.onerror = null;
      if (error) {
        script.remove();
        reject(error);
      } else resolve();
    };
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            "YouTube took too long to respond. Check your connection and retry.",
          ),
        ),
      15000,
    );
    window.onYouTubeIframeAPIReady = () => {
      try {
        previous?.();
      } finally {
        finish();
      }
    };
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () =>
      finish(
        new Error(
          "Couldn’t connect to YouTube. Check your connection or content blocker, then retry.",
        ),
      );
    document.head.appendChild(script);
  }).catch((error) => {
    apiPromise = undefined;
    throw error;
  });
  return apiPromise;
}

export function youtubeErrorMessage(code) {
  if (code === 100)
    return "This video is unavailable or private. Try another YouTube URL.";
  if (code === 101 || code === 150)
    return "This video can’t play in embedded players. Try another video or open it on YouTube.";
  if (code === 153)
    return "YouTube couldn’t verify this player. Try another browser or check your privacy settings.";
  if (code === 2)
    return "That video URL isn’t valid. Check the link and try again.";
  return "YouTube couldn’t play this video. Retry, or choose another video.";
}
