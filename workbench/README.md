# The Little Jeweler

A first-person, candlelit jeweler’s workshop directed by Heather Holtz and built with Codex assistance. A seated camera follows the cursor within a small limit. The bench objects are the primary interface: choose from physical felt boxes, drag the lamp shade, and pick up the loupe. Jewelry turns independently; the same world-space loupe travels to the eye as the camera leans in. No hands or avatar are shown.

## Run locally

Requires Node.js 20+. There are no npm dependencies to install and no runtime CDN, account, API key, render server, or asset download.

```sh
npm run dev --prefix workbench
```

Open http://127.0.0.1:4173/. Stop the server with Ctrl-C. From inside this directory, `npm run dev` is equivalent. The server builds `dist/` before starting; after editing source, run `npm run build --prefix workbench` and reload the page. `PORT` selects a different local port.

```sh
npm test --prefix workbench
npm run build --prefix workbench
```

The static `dist/` directory can be hosted anywhere. The Sites project identity is retained in `.openai/hosting.json`; do not create another Site when updating this one. Generated local `dist/` is ignored by the parent Rust repository. Source assets and vendored modules are checked in so a build works offline.

## Controls

- **Move the cursor:** gently look left/right/up/down, limited to about 6° yaw and 3° pitch. The view eases back to center when the pointer leaves. There is no room orbit.
- **Click a stone / metal in a felt box:** select it. Hover labels and a small lift make the samples discoverable.
- **Drag the jewelry / arrows:** turn the specimen. Empty-space dragging does not rotate it.
- **Drag the lamp shade:** move the actual light within a bounded plane above the bench.
- **Scroll / pinch / + / −:** lean the bench camera closer; change optical projection magnification in loupe mode.
- **1 / 2 / 3:** turn jewelry, adjust the lamp with arrow keys, pick up the loupe. The visible shade can be dragged in any bench mode.
- **Bench controls:** choose tiger’s eye, diamond or emerald; ring/loose-stone display; gold/silver and polished/brushed finishes; penlight/softbox; lamp reach/height; felt/ivory/charcoal mat.
- **Home / reset button:** restore the specimen orientation and distance.
- **Click the physical loupe / 3:** lift it along an eased path, then lean into the eyepiece.
- **Escape / Back to the bench:** reverse the pickup and return the loupe along the same path. Escape closes an open drawer first.
- **Camera button:** save the rendered view as PNG.
- **Render journal:** actual Rust and Mitsuba reference images, authorship, source links and model limits.

## Rendering and tradeoffs

This is a **Three.js 0.180.0 WebGL 2 GPU viewer**, not a port of the Rust renderer or Mitsuba. Tiger’s eye combines derivative-filtered procedural fibers, an artist-tuned directional scattering highlight, and a polished clear coat. The moving light and eye are transformed into the stone’s local coordinates, so its band responds to actual specimen/light motion. This is not a measured mineral model or volumetric scattering simulation.

Diamond and emerald use approximate rasterized transmission, absorption tint and environment reflections. Browser diamond IOR is capped at 2.33; it is an appearance study, without multi-bounce spectral diamond optics, caustics or calibrated inclusion data. Shadows from transmitting objects are opaque.

The loupe has a real 3D brass rim, recessed barrel and faint lens surface that remains in world space throughout pickup and return. Magnification narrows the camera’s projection and exposes more procedural/material detail. The eyepiece projection is stabilized as magnification changes, as in a game view model. It is not Snell-law ray tracing through a designed optical lens, and the displayed zoom is relative to the inspection camera’s baseline projection.

Four downloaded CC0 Poly Haven models supply the worn furniture/candle/tool shapes; a fifth scanned magnifier remains bundled as an alternate asset. Only 1K base-color maps are retained. Window/walls, book spines, plant, sketch, felt boxes, articulated lamp, specimen tray, jewelry and loupe are generated locally. A small depth-aware blur softens the room while the jewelry is in focus. Candle motion and cursor parallax are disabled for reduced-motion preferences; tool transitions use a shorter duration (0.65 s versus 2.4 s). The idle animation targets at most roughly 30 draws/second, and rendering suspends for a hidden page. These are scheduling limits, not measured device FPS guarantees. Key-light shadow maps are reused between interactions. Pixel ratio is capped at 1.5, shadow maps at 512² per cube face.

## Assets and verification

[Prop credits](assets/props/CREDITS.md) · [Source/checksum manifest](assets/props/sources.json) · [Three.js MIT license](vendor/THREE-LICENSE.txt). Gallery images copied from the Rust/Mitsuba studies retain engine and creator credits; hashes are in `assets/references.json`. No repository-wide source license has been selected.

`python3 workbench/scripts/fetch-props.py` reimports the five selected background models from Poly Haven, verifies upstream checksums, and records adaptations. This optional maintenance command uses the network; the normal build never does.

Thirteen Node tests cover mesh orientation/closure, valid imported geometry, light positioning, true focal-length zoom ratios, stable/reversible quaternion manipulation, bounded gaze, reversible pickup progress, bounded lamp-plane mapping, conservative tool-path clearance for the three mounted gems, every background-resource checksum/path, and exact reference asset hashes. Browser QA additionally checks actual material compilation, physical sample selection, specimen manipulation, direct lamp dragging, pickup/return and magnification, controls, gallery and responsive framing.

The object-led interaction and restrained camera movement were inspired by [Felix Rieseberg’s interactive desk](https://felixrieseberg.com/#work). No code, models, textures, or text from that site were copied. The pickup path uses bounds and conservative tool proxies, not a general rigid-body physics simulation. The Rust engine remains independently verified by its existing 98 tests and strict format/Clippy checks.
