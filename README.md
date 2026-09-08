# Watt a Beat

**Music-reactive maps of the Philippines.**

Load a track and watch Philippine streets light up with the music. Quiet passages dim the map; louder beats bring the lights back. Choose a lighting theme, switch districts on or off, and export the map as a muted MP4 or WebM.

Built with React, Vite, Remotion, and OpenStreetMap data.

## Features

- 🎵 **Audio-reactive lighting** — Bass, mids, and treble drive different districts in real time
- 🌆 **Multiple atmospheres** — City lights, Christmas (with snow), Moonlight, and Rain (with rain streaks)
- 🏘️ **Building footprints** — Mapped buildings light up with their district’s streets, using the chosen color and music response in both preview and MP4 exports
- 🗺️ **Philippine map search** — Search cities, towns, and landmarks via Photon + OpenStreetMap
- 🎥 **Browser video export** — Render a muted MP4 or WebM on your device with `@remotion/web-renderer`, including progress, cancellation, and download
- **Music mixer** — Add up to 8 audio files and 8 YouTube videos to play together, with shared play/pause/seek and a local audio volume control and individual video volumes
- **Surprise me + Undo** — Explore another Philippine place with randomized lighting, then restore the previous scene without changing music
- **District tap modes** — Send a light ripple, focus a district, or toggle its power
- **Visible-area 3D** — Raise buildings across all visible districts into blocks with music-reactive roofs and windows. Only the loaded map area is used; heights are illustrative.
- **YouTube feedback** — Visible player, video details, loading timeout, retry, and synchronized buffering. Lights follow the combined local audio, or a simulated rhythm for YouTube alone.
- **Playing logo** — The app logo pulses and glows during playback; reduced-motion preferences keep a steady glow.
- ✨ **Modern glassy UI** — Icon-only controls with tooltips, GSAP animations, smooth interactions
- 📱 **Responsive** — Works in desktop and mobile viewports
- ♿ **Accessible** — Proper ARIA labels, keyboard support (space to play/pause)

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Development mode restarts the backend when its code changes, keeping export
validation in sync with the preview. If a server was started before this update,
restart it once with `npm run dev`. Production servers must be restarted after
deploying updated code.

An original ambient demo track is included. Drop your own MP3, WAV, or M4A (up to 60 MB / 5 min).

## How to Use

1. **Choose music** — Select Add audio files (multiple selection and drag-and-drop supported), then use Paste YouTube URL for each video you want to add (up to 8 videos). Adding a URL keeps the existing videos. Open Your mix to remove sources and adjust local audio volume and each video’s volume. Up to 8 local files, each at most 60 MB and 5 minutes. The first user source replaces the demo; further files are additive. All sources start together, shorter sources finish, and the entire mix loops at the end of the longest source. Editing sources pauses and resets the mix. Uploaded audio drives real beat response; YouTube alone uses a simulated rhythm. YouTube synchronization is approximate because iframe playback is independently buffered.
2. **Choose an atmosphere** — Switch between City lights, Christmas, Moonlight, or Rain in the floating dock.
3. **Adjust & explore** — Open settings (sliders icon) to tweak intensity, sensitivity, toggle map labels, weather particles, or disconnect districts.
4. **Pan & zoom** — Drag the map to pan. Use the zoom and reset buttons in the bottom-right.
5. **Play with the map** — Select Ripple, Focus, or Power and tap a district label. Surprise me changes your place and lighting; Undo restores the previous visual settings.
6. **Export** — Click Export video → choose MP4 or WebM, resolution, and duration → Create video → Download video. Rendering happens in the browser; no audio upload or render server is used. Video exports are currently muted to keep browser rendering performant. Preview volume and mute do not affect the exported video.

Use **3D buildings** to raise buildings across the visible districts. Power mode toggles each district independently by tapping its roofs or walls. Panning, zooming, and loading another place keep the 3D setting; only buildings in the current view are rendered. The 3D view is included in video exports.

Use **Cancel export** in the export panel to stop an export, including while it
is preparing. Once cancellation finishes, you can start another video.

## Tech Stack

- React 19 + Vite
- Remotion Player for preview; `@remotion/web-renderer` and `@remotion/media` for browser export
- GSAP for UI animations
- Phosphor Icons
- Browser AudioContext for audio analysis; Express for map data and the retained legacy export API
- OpenStreetMap + Overpass + Photon geocoding (PH filtered)

## Project Structure

```
src/
  App.tsx              # Main UI, transport, settings, export flow
  MapScene.tsx         # The Remotion scene (shared by preview + export)
  ExportScene.tsx      # Export composition with @remotion/media audio
  useVideoExport.ts    # Browser rendering, compatibility, progress, cancellation
  useSurprise.ts       # Random location and lighting with visual-only Undo
  audio-mix.mjs       # Local PCM mixing and WAV encoding
  useMixPlayback.ts  # Shared transport and longest-source media clock
  useYoutubeSources.ts # Independent YouTube loading, retry, volume and cleanup
  youtube.mjs         # URL validation and recoverable YouTube API loading
  audio-analysis.mjs   # Real-time + export audio envelope extraction
  scene-effects.mjs    # District lighting + particle logic
  useMapArea.ts        # Geocoding + map data loading
server/
  index.mjs            # Dev/prod server + export API
  map-service.mjs      # OSM snapshot loading & caching
```

## Building & Exporting

```bash
npm run build
npm start
npm test
```

Video exports use WebCodecs through `@remotion/web-renderer`. Browser support is checked before each render; if MP4 is unavailable, choose WebM. Use HTTPS or localhost and keep the tab open until rendering finishes. Exports are currently muted because including audio adds too much browser rendering overhead.

Run the browser feature and real export checks with the studio running:

```bash
CHROME_BIN=/usr/bin/google-chrome npx playwright test tests/multi-youtube.spec.mjs tests/audio-mix.spec.mjs tests/audio-playback.spec.mjs tests/experience.spec.mjs --workers=1
```

Omit `CHROME_BIN` to use Playwright’s installed Chromium. `TEST_BASE_URL` selects a different local server. The checks cover source choices, YouTube error recovery, Surprise/Undo, district interactions, mobile layout, and a decoded muted browser export.

The following older scripts exercise the retained **server export API**, which the app UI no longer calls:

With the studio running, `npm run test:export-colors` renders two short MP4s and
checks that their decoded frames contain the requested custom colors. Set
`TEST_BASE_URL` to test a server on a different port.
Run `npm run test:export-cancel` to check queued and active cancellation, cleanup,
and starting a new export afterwards.

## Credits & Data

- Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL)
- Geocoding via Photon (filtered to Philippines)
- Demo audio synthesized for this project
- Created by [mjsolidarios](https://github.com/mjsolidarios)

This is an artistic simulation, not live power grid data.

## License

MIT — see LICENSE if added.
