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

### Export (`export.py`) — superseded on Oct 17 by manifest v2, see "Full-resolution materials" below
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
- Committed locally as 788114a ("Replace the atelier with an 1890 private railcar room") and `dist/` rebuilt.
  **Not pushed**: the agent VM's network proxy blocks github.com — run `git push` from the Mac.
  Poly Haven source files are git-ignored (re-downloaded by `ph.py`); only `polyhaven/credits.json` is tracked.
- **FPS not measured on real hardware yet.** Open `http://127.0.0.1:4173/?fps` on the Mac.

Next steps, in order:
1. `git push` (commit 788114a is local only).
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

## Session progress (Claude Code, Oct 16–17 2026)

**Done**
- Dev server runs clean (`npm run dev --prefix workbench`); 788114a was already on origin, so no push was needed.
- **Brightness / grade (committed + pushed as f1c0d0c).** Calibrated against `r12-hero.png` using pixel
  measurements, not by eye. Viewing the PNGs makes them look brighter than their pixel values; the earlier
  by-eye calibration was off because of this.
  - New `/?hero` view uses the exact Blender camera (r12 hero framing at 1280×720) for side-by-side checks.
  - Post pass now applies Blender 5.2's exact AgX "Medium High Contrast" view at +1.1 EV from a baked 64³ LUT
    (`workbench/scripts/railcar/lut.py` → `workbench/assets/railcar/agx-mhc-lut.bin`), replacing three's older AgX.
  - Fixed a grey wash: three ignores `envMapIntensity` when a material relies on `scene.environment`, so
    the studio probe lit the whole car at 0.55. The probe is now bound per material (dielectrics 0.08, metals 0.55).
  - Live-light specular on the room scaled to 0.3 away from the desk (desk keeps 1.0); `LIGHTMAP_INTENSITY` 0.7.
    The pure bake matches the render's walls at 0.7 (textbook π is ~3 stops too bright; cause not investigated).
  - New URL knobs: `?lm= ?env= ?spec= ?exp=`. Caustic receivers now chain their program cache key.
  - Measured (sRGB mean, r12 → browser): walls 73,19,0 → 83,23,2; curtains 65,23,15 → 68,29,25;
    leather 82,88,82 → 86,92,91. Before: walls 97,40,26, with a grey veil everywhere.
- **FPS** (M1 Max, Chrome headless on Metal, 3456×2234 native canvas, DPR 2; vsync 60 Hz):
  idle 30 (was 20, a timer + vsync bug, now fixed and gated to 30), orbit 37–40, case open 30,
  loupe idle 30, loupe drag 60. Rechecked after the case rebuild: unchanged.
- **Cantilever cases (reviewed by Heather Oct 17, committed).** `bench-objects.js` `makeCase` rebuilt to match
  `cases.py`: rosewood + brass body and corners, velvet well, two tiers of half-trays per side on brass
  parallel-arm linkages (top tier swings out/down, lower tier rises to the inner step), lid with an aged
  mirror (live room capture, direct specular suppressed so the jewellery lights don't flash in it).
  12 gems = 2 per tray + 4 in the well; 18 rings = one metal × 3 finishes per tray + 2 metals in the well.
  `caseInspectionView` drops its `sign` argument and frames the box centre. Picking verified in the browser
  (amethyst and a rose-gold ring selected from opened trays). `npm test` 37/37.
  - Behaviour change: a closed case shows only its top tier (4 gems / 6 rings); the rest appear on opening.

- **Glass and wall highlight (Oct 17, committed).** Clear glass and loose stones in `workshop.js` no
  longer have a diffuse body: the surface adds only its reflections, and the scene behind is multiplied by a
  per-surface transmittance (`CustomBlending`, `blendDst = ConstantColorFactor`, `material.blendColor`).
  Inkwells now show their black ink like r13, the student-lamp chimney is clear, and the papered diamonds read
  as glints instead of white chips. Spirits keep the old tinted-opacity path. The soft white blob on the
  panel between the windows was the key light's specular on the varnish (`?spec=0` removed it). The
  architecture group now takes no live specular (`?wallspec=`, default 0); furnishings stay at 0.3, desk 1.0.
- `tests/fidelity.test.mjs` now checks the railcar export (groups, atlases, HDR lightmaps, glass/paintings
  GLBs) and the Poly Haven / paintings credits instead of the retired atelier assets. `npm test` 37/37.
- `.claude/launch.json` starts the dev server for the desktop app's preview pane. **The dev server serves
  `dist/`, which it builds only at startup: run `npm run build --prefix workbench` after editing `src/`.**
- FPS not re-measured after the glass change (same draw calls).

- **Full-resolution materials + baked light only (Oct 17, manifest v2).** Heather found the browser car
  blurry and glitchy next to the Cycles renders. Measured causes: the old export's 4096 colour atlases used
  only 4% (furnishings) / 10% (architecture) of their area — ~14 mm per texel, 2 px per book spine — and
  ~2.3 m² of visible same-plane, same-facing faces z-fought (window casings vs pier stiles, bookcase backs vs
  sides, desk plinth vs gilt band...).
  - `export.py` rewrite: `resolve_coplanar()` deletes a face wholly covered by a coplanar same-facing face of
    another object and pushes partial overlaps back 1 mm (1,560 deleted, 1,074 pushed). Groups are split into
    one mesh per Blender material (`<group>|<material>` node names). Lighting is baked to a separately packed
    "LightUV" (coverage desk 0.71, furnishings 0.33, architecture 0.35; 4096 maps for the room, 2048 desk),
    stored RGBM in lossless WebP. Surfaces are not baked: materials tagged with a recipe in `mats.runtime()`
    (box-projected Poly Haven textures, gilt, metals, damask, art glass, book bindings) ship their recipe and
    source textures; UV-mapped materials (Poly Haven furniture, carpet, desk leather, dial, globe, labels) are
    baked onto their own UVs at up to 2 px/mm (colour, ORM, tangent normal); leftovers go to a small atlas.
    Full export ~31 min (run from a `bpy.app.timers` job). Window panes now export as `railcar-windows.glb`.
  - `src/railcar-materials.js` rebuilds each recipe in the shader (Cycles BOX projection, noise, damask mask,
    leaded glass, bindings palette/bands) with RGBM light/emission. Bug found + fixed: the shared lightmap
    texture's UV `channel` was being overwritten per material — clones per channel now.
  - Room reflections: one 512 cube capture of the car at load (PMREM) replaces the studio probe on car
    materials and glass, box-projected against the car's walls (parallax-corrected). Mirrors, brass and the new
    window glazing now reflect the room; the panes show the sconce pairs and frieze like r13. Varnish/cloth get
    0.35 of the probe (`?varnish=`), metals 1.0 (`?probe=`). Clearcoat and sheen live glints are scaled with the
    rest (that clearcoat lobe was the returning pier "blob").
  - Forest: the Cycles world HDRI (Poly Haven `sunset_forest`, rotation 200°, strength 0.55) as the backdrop
    by view direction (`railcar-sky.webp`), sun clamped, plus two rows of out-of-focus trunks/boughs streaming
    past for motion.
  - Ambience: dual-filter bloom on lamps/bulbs/fire (`src/bloom.js`, `?bloom=`, default 0.05), fine film grain
    in the post pass, optional synthesized soundscape (`src/ambience.js`: rumble, rail-joint clicks, fire
    crackle; header "Sound off/on", off by default).
  - Website: loading screen shows the blurred Cycles still (`assets/railcar/poster.jpg`) with a % from the
    loaders, then fades to the live car; phones / no-WebGL2 get the still with "Open the interactive car anyway"
    (`?static`, `?interactive`). Copy updated to the 1890 railcar with correct credits; the Lawrence portrait's
    provenance added to `paintings/SOURCES.json` (Met 55.89; exact download URL was not logged).
  - Tools: `workbench/scripts/measure-fps.mjs` (Chrome on Metal, 3456×2060 canvas; idle/orbit/case/loupe),
    `workbench/scripts/capture.mjs` (full-res screenshots; `WHEEL`, `DRAG`, `EVAL` env). `?debug` exposes
    `globalThis.__railcar`. Close the desktop preview pane while measuring — it competes for the GPU.
  - FPS (same script, pane closed): previous commit idle 30 / orbit 33.7 / case 30 / loupe 30 / loupe drag ~18;
    now idle 30 / orbit 32.5 (min 30.5) / case 30 (27.5 during the opening animation) / loupe 30 / loupe drag
    ~20. With the car hidden entirely orbit is ~34, so the room is no longer the bottleneck. The earlier
    "orbit 37–40, loupe drag 60" figures came from a different drag method and are not comparable.
  - Shipped size: `dist/` ~183 MB, of which the car export is ~138 MB (textures 57 MB, GLBs 33 MB, lightmaps
    31 MB). Loads in ~4.5 s locally.

**Next**
1. Download size for the public site: GLBs could use meshopt/Draco (needs a decoder in `vendor/`), and
   textures KTX2/Basis; ask Heather before lowering any texture or lightmap resolution.
2. Loupe drag runs ~20 fps in the headless measurement (same as before this work) — profile the loupe path.
3. Real-display check on the 120 Hz panel; a pass in Safari.
4. Cases polish (optional, Heather approved them as is): lid mirror reads flat; light haze at the bottom of the
   inspection view; outer tray clips at narrow aspects.
5. Verify hearth position; provenance manifest for the generated textures (carpet, dial, globe tint, ledger,
   labels, damask). Hosting (GitHub Pages or other) is Heather's call — nothing is published yet.
