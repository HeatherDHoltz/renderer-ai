# The Little Jeweler

A first-person, candlelit jeweler’s workshop directed by Heather Holtz and built with Codex assistance. The room camera stays fixed. Dragging turns the jewelry itself; a separate inspection camera looks through a lit 3D brass eyepiece. No hands or avatar are shown.

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

- **Drag / arrows:** turn the specimen. The bench camera and room stay fixed.
- **Scroll / pinch / + / −:** bring the specimen closer at the bench; change optical projection magnification in loupe mode.
- **1 / 2 / 3:** turn jewelry, move the light, inspect through the loupe. In light mode, drag or use arrows to reposition the light.
- **Gem drawer:** choose tiger’s eye, diamond or emerald; ring/loose-stone display; gold/silver and polished/brushed finishes; penlight/softbox; light azimuth/elevation; felt/ivory/charcoal mat.
- **Home / reset button:** restore the specimen orientation and distance.
- **Escape / Back to the bench:** exit loupe mode. Escape closes an open drawer first.
- **Camera button:** save the rendered view as PNG.
- **Render journal:** actual Rust and Mitsuba reference images, authorship, source links and model limits.

## Rendering and tradeoffs

This is a **Three.js 0.180.0 WebGL 2 GPU viewer**, not a port of the Rust renderer or Mitsuba. Tiger’s eye combines derivative-filtered procedural fibers, an artist-tuned directional scattering highlight, and a polished clear coat. The fixed light and eye are transformed into the stone’s local coordinates, so its band responds to actual specimen/light motion. This is not a measured mineral model or volumetric scattering simulation.

Diamond and emerald use approximate rasterized transmission, absorption tint and environment reflections. Browser diamond IOR is capped at 2.33; it is an appearance study, without multi-bounce spectral diamond optics, caustics or calibrated inclusion data. Shadows from transmitting objects are opaque.

The loupe has a real 3D brass rim, recessed barrel and faint lens surface, with a fixed inspection-camera position. Magnification narrows the camera’s projection and exposes more procedural/material detail. The eyepiece projection is stabilized as magnification changes, as in a game view model. It is not Snell-law ray tracing through a designed optical lens, and the displayed zoom is relative to the inspection camera’s baseline projection.

Five downloaded CC0 Poly Haven models supply the worn furniture/candle/tool shapes. Only 1K base-color maps are retained. Window/walls, book spines, plant, sketch, specimen tray, jewelry and eyepiece are generated locally. A small depth-aware blur softens the room while the jewelry is in focus. Candle motion is gentle and disabled for reduced-motion preferences; the idle animation targets at most roughly 30 draws/second, and rendering suspends for a hidden page. These are scheduling limits, not measured device FPS guarantees. Key-light shadow maps are reused between interactions. Pixel ratio is capped at 1.5, shadow maps at 512² per cube face.

## Assets and verification

[Prop credits](assets/props/CREDITS.md) · [Source/checksum manifest](assets/props/sources.json) · [Three.js MIT license](vendor/THREE-LICENSE.txt). Gallery images copied from the Rust/Mitsuba studies retain engine and creator credits; hashes are in `assets/references.json`. No repository-wide source license has been selected.

`python3 workbench/scripts/fetch-props.py` reimports the five selected background models from Poly Haven, verifies upstream checksums, and records adaptations. This optional maintenance command uses the network; the normal build never does.

Eight Node tests cover mesh orientation/closure, valid imported geometry, light positioning, true focal-length zoom ratios, stable/reversible quaternion manipulation, every background-resource checksum/path, and exact reference asset hashes. Browser QA additionally checks actual material compilation, specimen manipulation, loupe geometry/magnification, controls, gallery and responsive layout. The Rust engine remains independently verified by its existing 98 tests and strict format/Clippy checks.
