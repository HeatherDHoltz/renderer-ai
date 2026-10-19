# Cycles appearance ownership

## Current pipeline — October 18

The installed review candidate uses `appearance_response.py` with `mode=irradiance`,
not the earlier whole-room unlit proof described below. A white diffuse receiver
bakes E/pi while secondary rays retain the authored materials. Linear RGBA16F
illumination stays separate from full-resolution colour, roughness and normal maps.
`mode=diffuse` (radiance divided by base colour) is rejected for new bakes: it failed
on layered velvet. Never treat that ratio as pure irradiance.

Static room diffuse receives baked light once. Room probes supply live specular and
sheen, without studio foreground feedback. Studio direct glints are reserved for
live foreground materials; source area/spot emitters were hidden from glossy rays.
Distant metal retains a sparse camera-dependent combined field; nearby metal and
mirrors use probes. These are approximations, not full Cycles transport or planar mirrors.
Moving cases cast sampled geometry shadows onto the desk through `area-case-shadows.js`.
They are excluded from static light baking, so removing this receiver path removes
most of their visible desk shadows. Keep this dependency explicit.

Authored exports preserve the exact evaluated geometry: no automatic coplanar
face deletion or pushing. That repair previously damaged ledger pages and labels.
Native capture records manifest/source hashes and rejects fallback posters and
shader failures. Compare home and ±90° views; do not infer visual fidelity from tests.
Current candidate evidence: `output/railcar/moody-room/irradiance-install-evidence.json`.
The following sections describe the earlier experimental unlit route.

The room is being migrated from browser material reconstruction to explicit appearance ownership.
This is separate from Claude's Alps work (`landscape.js`, `window-view.js`, exterior/photo assets).
Do not overwrite those files or rebuild the shared source while another Blender job is running.

- `baked_room`: linear Cycles colour, lighting, shadows and static glossy appearance; unlit browser material.
- `live_metal`: live metal shading/reflections. These still need matching-room reflection validation.
- `live_glass`: live glass. The existing fallback is transparency/probe reflection, not general refraction.
- `live_mirror`: reflective room surface; the existing probe is not an exact planar mirror.
- `custom_gem`: our specialized gemstone shader (runtime collection/selected gems).
- `live_mixed`: a material containing both metallic and nonmetallic regions; split or retain its existing shader.

`render_routes.py` annotates Blender materials with `railcar_render_route` during a generated build.
An explicit valid property overrides inference. A desired authoring route is not proof an appearance
texture has actually been baked. The browser labels untouched materials `legacy_baked`; only rows in a
successfully loaded appearance manifest are replaced with the new unlit material.

## Stage before installing

Run `baked_appearance.run()` through a Blender MCP timer on the intact authored scene. It duplicates
receivers with independent materials; originals retain their geometry, surfaces and bounce lighting.
Receivers are invisible to secondary rays. A 0.1mm baking-only normal bias avoids coincident self-shadow.
Source camera, bake settings, selection and hidden look-dev case flags are restored; do not save temporary
receiver state over the source blend. All generated maps and GLBs stay under ignored output/.

The first proof targets the desk's mahogany, dark mahogany, rosewood panels and leather, plus the rug.
Full Cycles samples are retained. Non-native appearance atlases target2px/mm, raising an error above
16384 instead of silently reducing density. Native UVs need overlap validation before accepting a map;
solidified surfaces can share front/back UVs and require receiver face isolation or a fresh atlas.
Colour textures are not passed through the irradiance denoiser, which would blur their surface detail.

`COMBINED` baking uses `ACTIVE_CAMERA` and the current home camera with0.15 vertical lens shift.
It freezes glossy appearance from that camera; check both±45° turns for frozen highlights before accepting.
Maps are linear RGBM, with the website's exposure/AgX applied once after rendering, never baked twice.
Range16 clipping, atlas seams, texture detail, camera match and light/shadow contrast require actual captures.

Preview the staged manifest via `?room=cycles` when `appearance/appearance.json` is served beneath the car
export URL. The ordinary site is unchanged until its manifest has an `appearance` path. The stage manifest
identifies exact replaced group/material chunks. Live metals stay in the original meshes. The replacement
material never reads lights, lightmaps, environment probes or caustics; do not attach the gem caustic pass
to an unlit appearance texture and silently double its radiance.

After matching the proof, expand targets with tiling where a material exceeds the density budget. Do not
claim whole-room conversion while only proof materials are present. Install only reviewed appearance files
plus their manifest pointer; preserve Claude's concurrently generated exterior assets. A full old exporter
run can change mesh chunk membership, so invalidate/review replacements after source geometry changes.

## Fixture readability revision

`fixture_lighting.apply()` repairs emitters/transmission on a fresh authored copy;
never run the room generator over Heather's layout. Installed source/evidence is
`output/railcar/readable-lighting/`. Static room diffuse intentionally ignores web
lights: changing a browser lamp intensity cannot repair its baked light footprint.
Fix source placement/transmission and compare Cycles before rebaking. Ceiling
center sources inside opaque chandelier geometry were replaced by six actual bulb
sources per fixture; source geometry was preserved byte-for-byte in delivery.

Do not use a global reflection boost as a darkness fix. URL varnish1.0 exposed hard
probe-visibility edges in the knee space/chair; .35 barely helped side-drawer wood.
The installed default remains .12. These probes approximate transport, and current
source-to-browser reflection differences remain a visual-review item.

Performance recommendations need separate measurements after baking stops. In a
single exploratory loupe A/B, simplifying11 decorative stones gave no clear gain;
omitting extra surround rendering was more promising. Per-render Metal GPU timer
results overlapped badly and are rejected as isolated costs. No production quality
cuts were made. Investigate exact-appearance caching/culling first; geometry or
pixel-density reductions require Heather's explicit new authorization.
