# Blender tooling research and pilot requirements

Companion to [CLAUDE_PROJECT_BRIEF.md](CLAUDE_PROJECT_BRIEF.md) and [SCENE_REALISM_AUDIT.md](SCENE_REALISM_AUDIT.md). Prepared October 16, 2026.

This is a request for research and a proposed evaluation framework. It is not a verified plugin recommendation list, an installation record, or authorization to represent a tool as available when it has not been tested.

## Decision to make

Choose a practical setup that helps a local AI agent author, inspect, correct, bake, and export convincing environments for this existing Three.js experience. Prioritize visible scene quality, physical construction, spatial correctness, and dependable iteration.

The current documented baseline is Blender 4.5.14 LTS, Apple Silicon/M1 Max hardware, Blender Python in background mode, Three.js 0.180.0/WebGL 2, and Node.js 20+. Verify the actual machine/OS and the currently maintained versions before selecting integrations.

## Evaluate these capability areas

| Area                           | Capability needed                                                                                     | Project-specific question                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| AI-to-Blender connection       | Inspect/edit objects, collections, transforms, materials, lights, and modifiers; obtain useful images | Can the agent actually see and measure the scene it is changing?                            |
| Viewport and render inspection | Reliable screenshots, camera control, diagnostic views, saved captures                                | Can it expose floor contact and hidden structural gaps?                                     |
| Asset acquisition              | Good furniture, antiques, tools, minerals, fabrics, and architectural details                         | Are models plausible, compatible, and redistributable in a public repository/browser build? |
| Assembly and placement         | Units, origins, snapping, surface alignment, grouping, support-aware placement                        | Does it prevent furniture floating above the floor or props hovering over tables?           |
| Procedural construction        | Reusable measured cabinets, furniture, trim, and room assemblies                                      | Will it improve structural coherence rather than add more unrelated primitives?             |
| Materials                      | PBR consistency, texture mapping/scale, normal orientation, roughness, fabric and wood response       | Does the result stay convincing near the camera and after glTF export?                      |
| Lighting and baking            | Apple Silicon configuration, preview iteration, lightmap authoring/validation, color management       | Can it produce strong ambiance while preserving jewelry color and brilliance?               |
| Export and integration         | Applied/evaluated transforms, correct axes/UVs, retained PBR response, portable texture references    | Does the real browser match the approved authoring result?                                  |
| Scene validation               | Geometry/support reports, diagnostic captures, clear exceptions                                       | What catches the concrete defects in the audit before a bake or publication?                |
| Reference and composition      | Reference-board organization, view matching, useful feedback loops                                    | Does the workflow help execute one coherent room vision?                                    |

## Information required for each candidate

Record the exact product/project name, official URL, maintainer, release/version and verification date. Distinguish an official extension from a third-party bridge, an asset marketplace from an installed library, and an advertised feature from a tested capability.

Provide compatibility evidence for the relevant Blender version, macOS/Apple Silicon, and intended Claude/local-agent environment. State any Node/Python/runtime requirements, unsupported features, account/API/subscription needs, remote-service dependencies, and local-versus-cloud execution.

Explain price and licensing in practical terms. A marketplace or add-on license can differ from the redistribution rights of the downloaded models/textures. The project is publicly versioned and browser assets are distributed to visitors. Preserve asset provenance; do not assign a repository-wide source license.

State which concrete problem the tool solves, how it fits the existing authoring scripts, whether results are reproducible/exportable, and what maintenance or failure modes it introduces.

Suggested comparison table:

| Candidate / official source | Verified version and date | Blender / Apple Silicon compatibility | Actual agent capabilities | Price / accounts | Asset redistribution | Solves which issue? | Drawbacks / pilot result |
| --------------------------- | ------------------------- | ------------------------------------- | ------------------------- | ---------------- | -------------------- | ------------------- | ------------------------ |
| To research                 | Unverified                | Unverified                            | Unverified                | Unverified       | Unverified           | Specify             | Not tested               |

Do not fill unknown fields with assumptions. Link primary documentation or maintainer evidence for current claims.

## Questions for an MCP server or other live bridge

- Which Claude environment can invoke it: chat, desktop integration, Claude Code, or another local client?
- Does it connect to an existing Blender project or launch a separate process? Which file/session does it modify?
- Does it expose structured object and evaluated geometry data, or primarily execute Python?
- Can it return viewport screenshots and actual rendered images to the agent reliably?
- Can the agent switch views and inspect hidden lower furniture geometry?
- Can it identify objects and collections persistently through edits and exports?
- How are main-thread execution, long renders, cancellation, error reporting, save/recovery, and undo handled?
- Can it inspect dependencies, missing textures, lightmap UVs, and exported scene bounds?
- What permissions, network access, and external services are involved? What leaves the local machine?
- What can be reproduced with the current background Python workflow, and what useful new capability does the bridge add?

Evaluate snapping, ray casting, rigid-body settling, or procedural placement tools as aids within a support-validation process. Intentional wall mounts, multiple feet, delicate instruments, and manufactured joints require different treatment. A general settling command does not establish the final construction or composition quality.

## Configuration deliverable

Recommend a small default setup, with optional additions only where they solve a demonstrated need. Include separate settings or workflows for interactive authoring previews, Cycles baking, offline comparison renders, and final browser delivery.

Verify Apple Silicon rendering support and actual available devices before recommending a backend. Document color transforms, exposure/tone mapping, normal-map conventions, material/bake UV channels, and how results are matched in Three.js. Account for export features that need runtime corrections or do not survive glTF unchanged.

Preserve native browser pixel density and material/geometry fidelity as Heather's standing preference. Prefer reuse of verified bakes, caching, and elimination of redundant work. Any proposed visual downgrade needs an explicit explanation and agreement rather than being hidden in interaction code.

## Pilot before rebuilding the room

Build a small representative scene using the selected workflow:

1. A documented real-scale floor/wall corner and a desk or cabinet with actual feet/base.
2. A floor-standing bookcase with a credible lower structure, shelf supports, and a few books.
3. A tabletop drawing and pencil or tool with demonstrable contact.
4. One strong photographed or carefully modeled antique with its original PBR maps and accurate provenance.
5. Warm room lighting plus a neutral examination source and a small jewelry/metal reference.

Demonstrate how the agent inspects and corrects the scene. Include a deliberate unsupported prop or furniture gap, have the proposed checks identify it, repair the support relationship, and retain before/after evidence. Also demonstrate an intentional supported or wall-mounted exception so the process is not merely moving every object's lowest point to the floor.

Bake/export the pilot and inspect the actual browser. Retain matched authoring/browser captures, contact diagnostics, dimensions, material/export notes, and honest measured iteration costs if collected. A desktop success does not establish mobile performance.

Pilot acceptance requires grounded furniture and props, plausible structure, useful agent visibility into the scene, convincing light/material response, preserved browser appearance, reproducible assets, and accurate licensing. A successful tool connection or attractive single screenshot alone does not establish these results.

## Expected recommendation

Finish with the setup you would actually choose for Heather, why it fits this project, its total practical cost/prerequisites, the first configuration steps, the pilot procedure, and a prioritized route from the current unresolved scene issues to a coherent finished room.

Keep installation status, tool research, scene changes, and verification results distinct. This documentation handoff installs nothing and repairs no geometry.
