# AI-assisted scene authoring

This is a constrained authoring workflow, not an AI rendering algorithm. A chat/coding agent writes JSON; the Rust renderer validates and renders it. No model API key, network request, payment, or embedded chat feature is required. The scene loader never executes generated commands or code.

Use [scene.schema.json](scene.schema.json) (JSON Schema Draft 2020-12) for structural editor/tool validation. The schema covers known fields, tagged variants, and local value ranges. The **authoritative check** is the Rust `validate` CLI, which also checks named references, cycles, composed transforms, unit quaternions, key ordering, material/integrator compatibility, asset existence, and aggregate resource budgets. Structural schema success alone is insufficient. The schema has been checked with Python jsonschema 4.23.0 against the included scenes and generated examples; that optional tool is not a runtime dependency.

Copy the prompt below into an agent that can see this repository (or attach the schema, format guide, and example scene):

> Produce one renderer v1 JSON scene. Read `docs/scene.schema.json`, `docs/SCENE_FORMAT.md`, `docs/PHYSICAL.md`, and `scenes/physical_studio.json` first. Return JSON only, with no Markdown fences, comments, shell commands, or extra fields. Use relative paths to included assets only. Keep at most 60 objects, dimensions at most 1200×800, samples at most 512, and depth at most 12. Use explicit physical materials on every material and `render.integrator = physical`; linear base colors/tints and metallic/roughness are in [0,1]. Quaternions, if present, are unit x,y,z,w. Use right-handed +Y-up coordinates and static Euler degrees in `transform`. Ground is y=0. Object transforms are T*R*S; a child inherits the parent's transform. No singular scales. Use the included `../assets/studio.hdr`, `../assets/torus.obj`, or `../assets/uv-sphere.obj`; invent no asset filenames. All geometry/material/texture/parent names must resolve. Explicit area lights are sampling sources, not visible geometry. The physical integrator has no diffuse/glossy interobject indirect transport, nested media or caustics, and glass casts opaque shadows.
>
> Brief: compose a small gallery still life on a dark slate plinth. Use a warm rough-gold torus as the main arch, a clear pale-blue glass sphere in front, one restrained terracotta cylinder, and a small teal faceted form. Include HDR lighting and a soft rectangular key. Keep silhouettes distinct, leave margin around the objects, and favor a coherent composition over showing every feature. Place the camera to see the front and top of the plinth. Set the seed to 116.

Save a candidate under `scenes/`, inspect the JSON, then validate and render a small preview:

```sh
cargo run --release --locked -- validate scenes/ai_gallery.json
cargo run --release --locked -- render scenes/ai_gallery.json --width 600 --height 400 --spp 64 --no-progressive --output output/hero-preview.png
```

If validation fails, send the actual diagnostic back to the authoring agent, repair the scene, and rerun validation. Inspect the real preview for framing, shadows, intersections, noise, clipping, material appearance, and asset orientation. Adjust scene data and render again. Never use an AI-generated illustration as evidence that the renderer worked.

`scenes/ai_gallery.json` is the checked-in example authored by Codex in this chat from the brief above, then validated and rendered locally. Heather directs the portfolio project; this example is explicitly AI-assisted. The torus is a project-generated indexed mesh recreated by `python3 scripts/generate_torus.py`. It has 2,304 shared positions and 4,608 triangles, outward normals, and independent seam UVs. No downloaded art or hidden model integration is involved. The preview command above reproduces the authoring inspection; final settings are stored in the scene JSON.

Do not paste credentials, private course files, or unrelated personal files into a scene prompt. Resource ceilings still apply to agent-authored JSON, and the default validator rejects unknown keys rather than guessing the author's intent.
