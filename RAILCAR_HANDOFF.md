# Railcar environment — handoff (for Codex or any agent picking this up)

Written by Claude (Cowork) on October 16, 2026. Read this before touching the room. It supersedes the
Edwardian "atelier" room described in `CLAUDE_PROJECT_BRIEF.md` / `SCENE_REALISM_AUDIT.md`; the jewellery
renderer, cases, loupe and interaction code are unchanged unless listed below.

## What Heather asked for (art direction, in her words, condensed)

- 1850–1900. "The richest billionaire's private train car in 1890." Ornate, elegant, cluttered but organized.
- The viewer can orbit/zoom, so the **whole car** must be furnished, not only the desk. Not strictly realistic
  as a train (a wide car is fine).
- Must have: open **fireplace** with guard and fire irons, **whisky corner** (decanters, cut crystal),
  **paintings**, **open bookcases** (books visible, not behind glass), a **globe**, tufted armchairs, a carved
  settee she likes, an ornate gilt **grandfather clock**, wall **sconces** (she likes them), a **desk chair**.
- Desk holds only what a working jeweller would have. Rings/gems live in **cantilever jewellery boxes**
  (reference: https://daniellucian.com/library/spring-loaded-mechanisms/).
- **Bright, neutral light on the gems/rings** so colour and brilliance read. Room must not be so dark that
  objects are unidentifiable.
- Moving **forest** outside the windows.
- **Hold 30 fps.** (AGENTS.md: never silently lower pixel density / material quality.)
- References: `claude/art-direction-references.md` in the Claude project; Victorian library photo
  (oxblood, gilt frames, warm lamps), RDR2-style train interior (https://robinsbth.artstation.com/projects/L2aVww).

## Scale and coordinates (important)

- **1 unit = 10 cm.** The runtime desk layout (cases ~17 cm, camera 40 cm above the desk) was already at this
  scale; the old room was ~half scale (why the clock looked short).
- Blender: x along the car (-26..26), **+y = window wall behind the desk (y = 11)**, opposite wall y = -28,
  z up, floor z = -9, desk top z = -1.4, clerestory ceiling ~z 20.
- App/three.js: `app(x, y, z) = (blender.x, blender.z, -blender.y)` (glTF export with +Y up does this).
- Runtime-owned objects on the desk (do not bake): cases at Blender (-2.85,-1.45) gems and (3.05,-1.4) rings,
  pad (0,-0.25), ring (0,-0.15), loupe (1.6,-1.0). Props dress the back half of the desk and the ends.

## Authoring pipeline (Blender 5.2.2 LTS, Cycles on Metal)

Scripts: `workbench/scripts/railcar/` — everything is generated; no hand edits in .blend files.

| Module | Builds |
| --- | --- |
| `build.py` | `main()` → resets scene, builds everything, saves `output/railcar/railcar.blend` |
| `ph.py` | Poly Haven (CC0) download cache + `credits.json` in `workbench/assets/railcar/polyhaven/` |
| `mats.py` | Material library (mahogany/rosewood veneers, gilt, brass, velvet, Lincrusta, ceiling, carpet, glass…) |
| `geo.py` | box/cyl/lathe/sweep/panel/curtain helpers, `anchor()`/`adopt()` for wall-local frames |
| `shell.py` | Car shell: panelled walls, windows + drapes, Lincrusta frieze, clerestory with leaded deck lights, floor, carpet, end walls |
| `fireplace.py` | Open fireplace on the left end wall (marble, cast-iron insert, log fire, fender, guard, irons, scuttle, overmantel); `FIRE_WORLD` |
| `clock.py` | Ornate longcase clock (bay x = 11.7) with generated moon-phase dial texture |
| `desk.py` | Partners' desk, tooled green leather top (texture-based grain) |
| `cases.py` | Cantilever box **stand-ins** with 12 gems / 18 rings (Blender look-dev only; excluded from export) |
| `trinkets.py` | Desk items: student lamp, diamond balance, inkstand, rocker blotter, open diamond paper + tweezers, labelled parcels, gem ledger, triblet; also tantalus/tumblers/decanters/cloche helpers |
| `library.py` | Open bookcases + procedural books, gilt-framed paintings with picture lights, library globe |
| `bar.py` | Whisky corner on the right end wall (sideboard, mirrored back-bar, bottles, tantalus, siphon, humidor, bookcases, painting) |
| `furnish.py` | Poly Haven furniture: armchairs (recoloured oxblood), settee, gasoliers, desk chair, pocket watch + chain |
| `decor.py` | Library bay, paintings placement, globe, side tables, **exam lights** |
| `lights.py` | Sconces, dusk HDRI world |
| `export.py` | Bake + export for the browser (see below) |
| `stove.py` | Obsolete (enclosed stove version); not imported |

Run inside Blender (MCP add-on "Blender Lab MCP", or `blender -b -P`):
```python
import sys; sys.path.insert(0, ".../workbench/scripts/railcar")
for m in ["build","ph","mats","geo","shell","clock","desk","lights","trinkets","furnish","cases","library","fireplace","bar","decor","export"]: sys.modules.pop(m, None)
import build; build.main()            # ~30 s, writes output/railcar/railcar.blend
import export; export.run()           # bakes + writes workbench/assets/railcar/export/*
```
Long operations must be run from `bpy.app.timers` when driven through MCP (calls time out at 60 s).
Progress log: `output/railcar/export-log.txt`. Renders for review: `output/railcar/renders/`.

### Export (`export.py`)
- Classifies objects into **desk / furnishings / architecture** groups; glassware (transmissive materials)
  → `railcar-glass.glb`; painting canvases → `railcar-paintings.glb` (full-res images); flames, window panes
  and the case stand-ins are skipped.
- Freezes per-object texture coordinates (Generated/Object/ObjectInfo.Random) into mesh attributes, then
  **merges each group into one object before baking** (baking ~1,800 separate objects took 14 min per pass;
  merged it takes seconds).
- Per group: smart-UV atlas → bakes albedo (EMIT of base colour, 4096), diffuse irradiance
  (DIRECT+INDIRECT on a white-diffuse override, 1024–2048, denoised with OIDN from
  `output/oidn-2.3.3.arm64.macos/bin/oidnDenoise`), emission (1024).
- Export materials are quantised to a few roughness/metal buckets → few draw calls. Colour atlas as JPEG in the GLB;
  lightmap/emission as `.hdr` next to it; `railcar-manifest.json` has groups, fire position, room bounds.

## Browser changes (workbench/src)

- `workshop.js` — rewritten: loads the three baked groups + HDR lightmaps (`lightMapIntensity = π`, tune
  if it is too bright/dark vs. Cycles renders), cheap transparent glass (no transmission pass), paintings as
  basic textured quads, velvet pad, dim cool sun for live shadows, hearth at `manifest.fire`.
- `forest.js` — new: procedural dusk forest on two planes outside both window walls, 4 parallax layers.
- `hearth.js` — `createHearth(scene, {position, rotationY, scale, props})`; logs/embers are baked now.
- `scene.js` — AgX tone mapping (matches Cycles), exposure 1.35 (tune), hemisphere fill reduced, side fill
  removed, brighter neutral `collectionFill` (9) over the cases, fog/camera far planes for the bigger room,
  ambient animation at **30 fps** (was 24), `?fps` overlay + `data-fps` on the host.
- `orbit.js` — look-around range ±2.3 rad, zoom to 40, room-sized bounds, camera kept above the desk.
- `scripts/build.mjs` — dist excludes authoring caches (`assets/railcar/{polyhaven,paintings,textures}`,
  `assets/atelier`, `assets/study-props`).
- `tests/orbit.test.mjs` — updated for new bounds (passes).

## Status at handoff (updated 22:45, Oct 16 2026)

- Room authored and reviewed in Blender (renders `output/railcar/renders/`, latest `r13-*`).
- Export finished (521 s): `workbench/assets/railcar/export/` (3 group GLBs 48k/238k/129k faces, light+emit
  HDRs, glass, paintings, manifest; ~57 MB). `manifest.fire` is null → workshop.js fallback (-25,-7,8.5) is right.
- **Verified in a browser** (headless Chromium + SwiftShader, so visuals only — no meaningful fps): the car
  loads with no errors; orbiting shows desk, whisky corner, bookcases, armchairs, fireplace end, globe;
  forest wall visible and moving in the windows. Screenshots: `output/railcar/browser-check.jpg`.
- Lighting calibrated by eye against `r12-hero.png`: baked materials ignore live diffuse + env diffuse
  (onBeforeCompile in workshop.js), `LIGHTMAP_INTENSITY` 1.2, `toneMappingExposure` 0.95. Both tunable via
  URL: `?lm=…&exp=…`. Browser still reads a little flatter than Cycles (no AgX "Medium High Contrast" look).
- `npm test` (node --test tests/*.test.mjs): **37/37 pass**.
- Not committed (agent VM can't remove git lock files) and `npm run build` must run on the Mac (VM can't
  delete old `dist/`).
- **FPS not measured on real hardware yet.** Open `http://127.0.0.1:4173/?fps` on the Mac.

Next steps, in order:
1. Commit (see above) and `npm run build --prefix workbench`.
2. `npm run dev --prefix workbench`, open http://127.0.0.1:4173/?fps. Fix load errors. Compare the seated view
   with `output/railcar/renders/r12-hero.png`; tune `LIGHTMAP_INTENSITY` and `toneMappingExposure`.
3. Verify the hearth sits in the firebox (manifest.fire) and the forest shows through every window.
4. Measure fps (idle ambient, orbiting, case inspection, loupe). Target ≥30 at native pixel ratio.
   If short: profile first; candidates are lightmap/atlas resolution, the fire's 56-step raymarch, shadow
   map sizes — propose any visible tradeoff to Heather before applying (AGENTS.md).
5. Rebuild the runtime cases in `bench-objects.js` (`makeCase`) as cantilever boxes (rosewood + brass,
   two tiers of trays stepping out on brass arms, mirrored lid) to match `cases.py`.
6. `npm test --prefix workbench`; update `tests/fidelity.test.mjs` (still references the old atelier assets,
   which remain in the repo); `npm run build`; commit + push per AGENTS.md.
7. Provenance: add railcar assets to the manifests (Poly Haven CC0 credits in `polyhaven/credits.json`;
   Met Open Access/NASA sources in `paintings/SOURCES.json`; carpet, dial, globe tint, ledger, labels and
   damask are original generated textures).

## Gotchas

- Blender was being launched from Downloads (macOS App Translocation); preferences and the MCP add-on can
  vanish after a force-quit — reinstall from https://www.blender.org/lab/mcp-server/ if needed.
- Poly Haven assets load through Blender's own Python (the agent VM's proxy blocks polyhaven.com / the Met API;
  Wikimedia Commons works from Blender).
- After the glTF import, Poly Haven chairs share one material for frame + upholstery; `furnish.recolor_fabric`
  recolours by luminance.
- One device commit once wrote stale files; grep the device copy after committing.
