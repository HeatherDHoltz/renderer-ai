# Room lighting

Current room diffuse lighting uses a white receiver bake (`appearance_response.py`, `mode=irradiance`). Original materials remain on secondary rays, so bounced light sees the authored surfaces. Do not use diffuse radiance divided by base color as irradiance; that failed on velvet.

Keep linear lighting separate from full-resolution surface color, roughness and normals. Apply the display transform once in the browser. Adding a web light does not change baked diffuse illumination; move/fix the source in Blender and rebake its response.

Nearby metals and mirrors use reflection captures, not exact scene tracing. Distant metal retains an approximate baked response. Moving cases are excluded from static baking; `area-case-shadows.js` supplies their desk shadows. Keep that receiver path.

Preserve exported evaluated geometry. Automatic coplanar deletion previously damaged book pages and labels. Stage exports, apply manifest-required overrides, and compare matching home, ±90° and station views before installation. Read [the audit guide](AUDIT.md) for details.

Use `fixture_lighting.apply()` on a saved authored copy when repairing source transmission/placement. Do not regenerate Heather’s layout or boost all reflections to hide a local lighting defect.
