# Watt a Beat

**Music-reactive maps of the Philippines.**

Load a track and watch Philippine streets light up with the music. Quiet passages dim the map; louder beats bring the lights back. Choose a lighting theme, switch districts on or off, and export the map with audio as an MP4.

Built with React, Vite, Remotion, and OpenStreetMap data.

## Features

- 🎵 **Audio-reactive lighting** — Bass, mids, and treble drive different districts in real time
- 🌆 **Multiple atmospheres** — City lights, Christmas (with snow), Moonlight, and Rain (with rain streaks)
- 🏘️ **Building footprints** — Mapped buildings light up with their district’s streets, using the chosen color and music response in both preview and MP4 exports
- 🗺️ **Philippine map search** — Search cities, towns, and landmarks via Photon + OpenStreetMap
- 🎥 **Video export** — Render your mix as an MP4 using Remotion (local rendering)
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

1. **Play or upload** — Hit play or drag & drop / browse for your soundtrack anywhere on the map.
2. **Choose an atmosphere** — Switch between City lights, Christmas, Moonlight, or Rain in the floating dock.
3. **Adjust & explore** — Open settings (sliders icon) to tweak intensity, sensitivity, toggle map labels, weather particles, or disconnect districts.
4. **Pan & zoom** — Drag the map to pan. Use the zoom and reset buttons in the bottom-right.
5. **Export** — Click the export button (top right) → choose resolution & duration → Render video. Files are saved to `exports/`.

Use **Cancel export** in the export panel to stop an export, including while it
is preparing. Once cancellation finishes, you can start another video.

## Tech Stack

- React 19 + Vite
- Remotion (Player + Renderer) for video export
- GSAP for UI animations
- Phosphor Icons
- Express backend for audio analysis + Remotion rendering
- OpenStreetMap + Overpass + Photon geocoding (PH filtered)

## Project Structure

```
src/
  App.tsx              # Main UI, transport, settings, export flow
  MapScene.tsx         # The Remotion scene (shared by preview + export)
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

Video exports are rendered locally using Remotion. Requires a Chromium-based browser.

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
