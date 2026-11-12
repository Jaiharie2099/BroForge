# README media

- `hero.png`: approved BroForge action-poster artwork, generated with the built-in image tool using the supplied game-title image as a visual reference. The tagline is “Forge Bros. Then Bro the Force.” The artwork depicts character concepts; these characters have not been implemented.
- `workflow.gif`: a 20-second, looping documentation replay at 1280×820. The agent pane is an authored presentation of real MCP operations, not a screen recording of a particular coding-agent application. The browser panes are captures of the actual local BroForge Web UI.
- `workflow-poster.png`: the final composition as a still image.

The capture connects through the real MCP stdio transport, inspects the installation, creates a dedicated `Furnace Escape` documentation project, edits its terrain and objects, starts the preview site, and builds native `.bfc` and `.bfg` files. It uses an edited copy of the short Hell template. The preview is schematic. No game installation or playtest is performed by this media workflow. Animation timing is edited for readability and is not a performance benchmark.

## Regenerate

Requires the normal development setup (`npm ci` and `npm run setup`), Chromium, Python with Pillow, and the Noto Sans/DejaVu fonts used by the compositor. Chromium defaults to `/snap/bin/chromium`; override with `BROFORCE_CHROMIUM=/path/to/chromium` if needed.

```bash
node scripts/capture_readme_demo.js
python3 scripts/render_readme_media.py
```

Raw screenshots, the real tool transcript, and the dedicated project live under ignored `runtime/readme-demo/`. Regeneration replaces that documentation project's working copy. It does not touch the normal `projects/` library. The GIF and poster are derived from the captured results. The banner is a separate approved image-generation asset.

BroMaker is by [Gorzontrok](https://github.com/Gorzontrok/Bro-Maker). The native campaign files require an installed copy of Broforce. The banner is illustrative fan artwork; it is not a gameplay screenshot or a bundled character package.

## Spider Bro gameplay

- `spider-bro-gameplay.gif`: an approximately 12-second, 768×480 loop (under 1 MB) showing actual combat, Spider Sense and a sustained web swing. Frames come from Unity at the end of rendered frames through the MCP bridge, not a staged sprite animation or stale desktop screenshot.
- `spider-bro-gameplay-poster.png`: still from the real combat footage.
- `spider-bro-gameplay.json`: sanitized capture evidence: assembly identity, normal special activation, kills/pellets, and airborne attached-frame counts.

Regenerate with `node scripts/capture_spider_demo.js` after workspace setup. It creates the bundled character and showcase arena through MCP, calls play_project, records with normal bounded inputs, and runs `scripts/render_spider_gif.py`. This takes over player-one controls; no teleport or test invulnerability hooks are installed. Raw PNGs, per-frame game state, and transcripts remain in ignored `.broforge/runtime/`. `--prepare-only` performs build/install/launch verification without recording.

Composition crops and nearest-neighbor scales the actual game frames, retains their elapsed timing, adds captions and a cropped copy of the actual HUD, and joins the three clips. The raw recording runs below the requested capture FPS on this machine because of PNG capture cost; the GIF preserves that real cadence. It does not show campaign completion. Spider-Man fan-character attribution and inherited Broforce/BroMaker behavior are listed in the bundled character credits.
