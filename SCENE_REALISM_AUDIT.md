# Scene realism audit and acceptance checks

Prepared October 16, 2026 by reading the current authoring/runtime source. This file records **unresolved findings and proposed validation**, not scene fixes. No Blender dependency-graph inspection, new render, or interactive placement audit was performed for this documentation pass.

Read [CLAUDE_PROJECT_BRIEF.md](CLAUDE_PROJECT_BRIEF.md) for the project and [BLENDER_TOOLING_REQUIREMENTS.md](BLENDER_TOOLING_REQUIREMENTS.md) for the tooling request.

## Evidence levels

- **Source-derived:** arithmetic or behavior directly present in code. Nominal dimensions can identify a likely error, but do not replace inspecting the evaluated scene.
- **Reported/previously observed:** Heather's feedback or retained earlier screenshots. This is not a new observation from this handoff.
- **Proposed:** a check, workflow, or design improvement that has not been implemented.

Current scripts use application +Y-up coordinates, mapped into Blender by `xyz(x, y, z) = (x, -z, y)`. Values below are application scene units. No consistent meter calibration is established by this audit.

## Source-derived spatial findings

Sources: [build-atelier.py](workbench/scripts/build-atelier.py), [study-details.py](workbench/scripts/study-details.py), and [hearth.js](workbench/src/hearth.js). Search the quoted object names; line numbers can change.

| Assembly or object         | Nominal source calculation                                                     | What needs checking                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Floor                      | Center Y = −5, thickness = 0.2, so top Y ≈ −4.9                                | Establish this actual upper surface as the shared ground reference                                                                            |
| Bookcase uprights          | Center Y = 1.6, height = 6.25, so bottom Y ≈ −1.525                            | Approximately 3.375 units above floor top; no floor-reaching base/support is defined in this bookcase section                                 |
| Bookcase back              | Center Y = 1.55, height = 6, so bottom Y ≈ −1.45                               | Approximately 3.45 units above floor top; review complete intended cabinet construction                                                       |
| Fireplace hearth slab      | Center Y = −1.75, thickness = 0.13, so bottom Y ≈ −1.815                       | Approximately 3.085 units above floor top; a supporting raised structure is not defined in this section                                       |
| Mantel feet                | Center Y = −1.60, height = 0.18, so bottom Y ≈ −1.69                           | These also terminate well above the floor; fireplace should be assessed as one assembly                                                       |
| Desk drawer carcasses      | Center Y = −3.25, height = 3.2, so bottom Y ≈ −4.85                            | Nominal 0.05-unit gap above floor; separate feet may provide support, so this alone does not prove a floating desk                            |
| Desk feet                  | Center Y = −4.9, height = 0.45, so bottom Y ≈ −5.125                           | Nominal 0.225-unit floor penetration; verify intended foot-floor intersection and complete support structure                                  |
| Imported grandfather clock | Import helper places object world-bound minimum at supplied application Y = −5 | Nominal base is 0.1 below floor top; inspect actual contact, origin, hierarchy, and bounds                                                    |
| Pencil body                | Rod endpoints Y = −1.25 and radius ≈ 0.027, giving lower surface ≈ −1.277      | Bench top is Y ≈ −1.4, leaving about 0.123 units; drawing top is ≈ −1.3585 where underneath it. Likely hovering unless another support exists |

These findings require checking against evaluated geometry, bevels, transforms, and intended supports. They are strong reasons to audit the room before further surface polishing.

The fireplace also has live geometry/light coordinates in `hearth.js` and baked fire illumination in `build-atelier.py`. Any repositioning must keep the architecture, hearth, logs, flame volume, lighting, and nearby dressing aligned. Changing one part alone can create another mismatch.

## Construction and material findings to inspect

The balance's object named `concave weighing pan` is currently created from a flattened complete UV sphere. Its name does not establish a genuinely open concave bowl. Inspect its silhouette, interior, thickness, and suspension connections.

Background mineral specimens use a material called `museum beryl` with a nonzero metallic setting. This is an appearance choice in the source, not a measured mineral model. Review its suitability if these objects are meant to read as actual dielectric crystals.

The room is primarily assembled from script-generated primitives. Imported photographed objects receive bounding-box-based scale and base placement, while many authored objects use unrelated numeric coordinates. A consistent support/assembly system is not documented. This can produce attractive individual details alongside incorrect physical relationships.

Many static authored objects are joined for the shared bake/export. Preserve inspectable assembly organization before this delivery step. The local saved `.blend` is useful, but its existence alone is not evidence that assembly/contact validation happened.

Runtime architecture and photographed props do not cast new dynamic shadows; fixed architectural shadowing is baked. Their usual direct-light reception remains enabled. Verify the fixed bake and export before changing shadow settings to address a grounding problem.

The runtime explicitly corrects downloaded clock-glass opacity and restores wood tints that the material export did not preserve. These corrections demonstrate why the actual browser needs comparison with the authoring view.

## Proposed order of work

1. **Calibrate the room.** Document units and reference dimensions for floor, desk height, doorway/window, cabinets, books, and small jewelry tools. Establish shared floor and bench surfaces.
2. **Repair structural assemblies.** Audit desk support, bookcase base, fireplace/hearth, wall openings, and trim before adding decorative objects.
3. **Organize support relationships.** Place objects relative to identified surfaces/parents instead of independent guessed world coordinates.
4. **Review camera coverage.** Inspect every area exposed by allowed orbit, focus, and zoom, including furniture bases and the space beneath the bench.
5. **Improve geometry and staging.** Choose strong hero/background assets, credible construction details, intentional object clusters, and a clear visual hierarchy.
6. **Unify materials and light.** Check texel scale, grain direction, roughness, metal/dielectric choices, fixture visibility, bounce light, and contact shadows.
7. **Bake and compare.** Export and inspect the browser from matched views; verify lightmap UVs, color management, texture paths, and transforms.

No step above is completed by this document.

## Proposed support and contact representation

Define semantic assemblies such as `room`, `desk`, `bookcase`, `fireplace`, and `jewelry_cases`. Record an intended support relation for each placeable object, for example `pencil -> drawing/desk`, `book -> shelf`, `clock -> floor`, and `shelf -> bookcase frame`.

For each relationship, record the contact type and permitted motion. Flat floor contact, multiple feet, a hanging object, a wall-fastened cabinet, and an object leaning against another object require different validation.

Use evaluated world-space geometry after modifiers and complete parent transforms. Whole-object minimum bounds can help with simple initial placement, but they can be misleading when an object contains handles, hanging parts, decorative geometry, or multiple support points. Validate the actual intended feet/base/contact regions.

For a simple horizontal support, a useful diagnostic is:

```text
signed contact gap = lowest intended contact height − support surface height

positive gap: possible hovering
negative gap: possible penetration
near zero: candidate contact; still inspect support coverage and geometry
```

Choose tolerances after real units are established. Do not assign one arbitrary tolerance to a room-scale cabinet and a millimeter-scale jewelry component. Store intentional exceptions with a reason rather than silently snapping every object.

## Proposed automated checks

| Check                  | Evidence to retain                                                                       | Important limitation                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Units and dimensions   | World dimensions of reference objects and applied transform information                  | Correct bounds do not prove believable proportions                    |
| Floor contact          | Signed gap/penetration at intended feet/base regions                                     | Bounding boxes alone can miss contact shape                           |
| Desk/shelf contact     | Support-surface identity, contact positions, coverage, and gap                           | Objects can contact an edge while still being implausibly unsupported |
| Structural connections | Expected joins between cabinet members, mantel pieces, trim, and frame/wall opening      | Intentional clearances need documented exceptions                     |
| Intersections          | Candidate intersecting assembly pairs with close-up locations                            | Many manufactured joints intentionally overlap in a display mesh      |
| Imported transforms    | World matrices, parent hierarchy, scale, orientation, and evaluated bounds               | Clearing transforms carelessly can break imported assets              |
| Materials and UVs      | Missing maps, normal orientation, texel scale, material type, bake UV coverage           | A valid material can still look wrong                                 |
| Light bake             | Atlas integrity, UV channel assignment, overlap/seam diagnostics, light contributions    | Successful baking does not establish attractive illumination          |
| Delivery               | Source/export asset integrity, loading errors, preserved material assignments and bounds | Lossless packaging preserves existing defects too                     |
| Camera reach           | Captures at allowed movement/zoom extremes and focus targets                             | A few default screenshots cannot cover every exposed defect           |

These checks are a specification. They are not currently a functioning scene-validation suite.

## Required visual inspection for a future room revision

- An orthographic front and side view showing floor, feet, furniture, fireplace, and shelf assembly extents.
- A perspective overview with the desk hidden temporarily so it cannot conceal the rear room's lower geometry.
- Floor-level/contact close-ups of desk feet, clock base, bookcase base, and hearth.
- Table-level close-ups of pencil, paper, tools, containers, and case bases.
- Clay or neutral-material lighting views to assess construction, contact, and shadowing independently of texture detail.
- Material close-ups for wood grain direction/scale, velvet, metal roughness, glass, and imported scans.
- Matched Blender and browser views under documented color-management and lighting conditions.
- Actual browser inspection throughout supported camera movement, case unfolding, and loupe pickup/return.

Save relevant actual captures and describe what each verifies. Do not substitute an attractive offline render for proof of the browser result.

## Acceptance criteria

The room revision should have a coherent unit scale, credible furniture support, clean architectural joins, supported props, consistent materials, deliberate composition, and lighting that reveals both the room and jewelry. Any intentional raised hearth or wall-mounted furniture needs visible, plausible construction.

Existing source-derived issues must be either repaired and checked or explicitly retained as unresolved. A passing renderer test suite, successful bake/export, or successful deployment is insufficient evidence for physical grounding.

The last recorded milestone passed 37 web and 98 Rust tests. Those suites cover renderer/interaction/material/asset behavior; they do not validate the support relationships listed here. No scene fix or new render was performed for this handoff.
