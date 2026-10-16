# Physical lighting and HDR

`physical` is a direct-light integrator with recursive ideal dielectric transport. It uses linear radiance throughout. Educational coefficients belong to the separate `whitted` integrator. Select the mode in `render.integrator`; every defined material must match that mode.

```sh
cargo run --release --locked --example generate_environment
cargo run --release --locked -- render scenes/physical_studio.json --output output/physical-studio.png --hdr-output output/physical-studio.hdr
```

![Environment-only material studio](../gallery/physical-studio.png)

This inspected 960×540, 256-spp studio has no point or rectangle lights. From left: matte diffuse, rough dielectric, rough gold, near-smooth silver, clear glass, and surface-tinted glass. The included synthetic HDR environment supplies all illumination and the visible softboxes. Floor occlusion produces contact shadows. Noise and distant checker aliasing remain visible. The dark lower part of silver also exposes a transport limitation: glossy rays blocked by the floor contribute zero; this integrator does not bounce floor radiance back into the metal.

## Reflection model

`diffuse` evaluates `base_color / π` with cosine-hemisphere sampling. `metal_rough` uses these explicit choices:

- GGX/Trowbridge–Reitz NDF, `alpha = max(roughness², 0.001)`.
- Separable Smith masking-shadowing, `G = G1(wo) G1(wi)`.
- Schlick RGB Fresnel with `F0 = mix(0.04, base_color, metallic)`; this is an approximation to conductor optics.
- `f_spec = D G F / (4 NoV NoL)` and `f_diff = (1-F)(1-metallic) base_color / π`.

This single-scatter model loses microfacet multiple-scattering energy at high roughness. Numeric energy tests cover representative materials; they are not proof of exact energy conservation for every parameter/direction. Roughness zero still uses a small finite lobe, not a delta mirror.

BRDF sampling mixes cosine diffuse and GGX NDF half-vector reflection with specular probability `0.5 + 0.5 metallic`. The PDF includes both mixture components and the half-vector Jacobian `1/(4|wo·h|)`. Below-surface reflection samples are null events, not resampled or renormalized. The implementation uses NDF sampling, not visible-normal sampling.

Each reflective vertex gets one sample per rectangle and two environment estimators: one environment-importance sample and one BRDF sample. Their contributions use the power heuristic `p_a²/(p_a²+p_b²)`, with each technique's complete directional PDF. This avoids adding the full environment integral twice. Point lights use intensity divided by squared distance; rectangles use emitted radiance and actual surface geometry/PDF. No physical ambient term is added.

## Glass

`dielectric` uses exact unpolarized dielectric Fresnel, Snell refraction, explicit TIR, and air/material IOR selection from the outward geometric normal. Each interface contributes `F L_reflected + tint (1-F) (eta_i/eta_t)² L_transmitted` under the radiance transport convention. Entering/exiting eta factors cancel through an air/glass/air slab; tests check this and Fresnel reflection without a duplicate empirical reflection term. Geometric offsets and finite recursion/throughput cutoffs are shared with educational transport.

Tint applies at every transmitted interface, so it is not thickness-dependent absorption. No Beer–Lambert absorption, nested/overlapping medium stack, dispersion, caustics, or refractive shadows is implemented. Glass is opaque to all shadow queries. Ideal glass can recursively see other surfaces, but diffuse/glossy surfaces receive direct lights and visible environment only: there is no diffuse or glossy interobject indirect transport. Explicit rectangle lights are sampling sources, not visible/emissive mesh geometry; their images appear in glass only if separately represented in the environment.

## Environment and output conventions

Radiance `.hdr` files are decoded as linear floating-point RGB, without an sRGB conversion. Lat-long maps use +Y at the top pole, +X at u=0, +Z at u=0.25, and row zero at the top. Positive rotation moves +X features toward +Z. Lookup is nearest texel and piecewise constant. Environment UV orientation is independent of geometry UV conventions.

Importance mass is luminance times the exact spherical texel area `Δphi (cos(theta_top)-cos(theta_bottom))`. Sampling chooses a texel by CDF, then uniform azimuth and uniform cosine of polar angle within that texel; `pdf = mass / area` is per steradian. This avoids division by a zero pole sine. Black maps fall back to uniform-sphere sampling. Constant environments have PDF `1/(4π)` and illuminate an unobstructed Lambert surface with `base_color * radiance`, verified numerically with both MIS estimators active.

`--hdr-output output/render.hdr` additionally saves averaged, untone-mapped linear radiance, independent of PNG exposure. RGBE is a lossy shared-exponent format, not full float EXR. PNG averages linear samples, applies `2^exposure`, Reinhard or linear mapping, then piecewise sRGB. No sample or light contribution is display-clamped before accumulation. Progressive HDR is written at the final prefix; PNG previews update throughout. HDR maps are capped at 64 MiB, 4 megapixels, and 8192 per axis before allocation. Export reports unsupported/overflowing RGBE values and write errors.

## References and verification

Independent Rust implementation informed by PBRT's primary descriptions of [microfacet theory](https://www.pbr-book.org/4ed/Reflection_Models/Roughness_Using_Microfacet_Theory), [infinite area lights](https://www.pbr-book.org/4ed/Light_Sources/Infinite_Area_Lights), [multiple importance sampling](https://www.pbr-book.org/4ed/Monte_Carlo_Integration/Improving_Efficiency), and [dielectric transport](https://www.pbr-book.org/4ed/Reflection_Models/Dielectric_BSDF). Our alpha mapping, separable Smith choice, and NDF sampling are explicitly defined above rather than claiming to reproduce PBRT's exact implementation.

`tests/physical_hdr.rs` checks environment PDF normalization/importance/rotation/poles, constant-environment illumination, BRDF finiteness/reciprocity/numeric energy, rejected GGX sample mass, glass eta/Fresnel/TIR, and HDR round trips. `tests/physical_io.rs` exercises strict mode/albedo/environment validation and final progressive HDR export independent of PNG exposure. Existing educational, acceleration, sampling, and tiled-render tests remain in the suite.
