# Gem color and the jeweler’s study

The browser workshop is a separate real-time presentation of the renderer studies. It does not replace the Rust renderer or Mitsuba. This revision follows an early-1900s-inspired study direction: dark walnut paneling, fitted bookcases, a drawer bench, heavy curtains, warm fabric shades and a fireplace. The decorative references supplied by Heather guided the design; those reference photos are not redistributed. The room is newly modeled in Blender; the live jewelry, physical cases and loupe retain their interaction systems.

## Color is not a mineral's RGB constant

A gemstone's observed color depends on its absorption spectrum, trace-element concentrations, path length, crystal orientation, illumination and the observer/display. A hex picked from a photograph includes its lighting, exposure and tone mapping. It is not an absorption coefficient. Emeralds themselves range from bluish green to green; the earlier weak green absorption preset was too pale and yellow for this representative specimen. [GIA emerald quality factors](https://www.gia.edu/emerald-quality-factor), [GIA on emerald chromophores](https://www.gia.edu/seeing-green).

The faceted shader uses `T = exp(-absorption * local_path_length)` for each RGB channel along each internal segment. Surface Fresnel reflection is not tinted by that absorption. The table below describes a *reference transmitted swatch at one optical unit*, not a pixel color promised in the scene. One optical unit is interpreted as a 5 mm calibration path, independently of the artistic workshop scale. Multiple internal paths, the environment and ACES exposure change the final image.

### Measured data for ruby and blue sapphire

[Dubinsky, Stone-Sundberg and Emmett, GIA, 2020](https://www.gia.edu/gems-gemology/spring-2020-corundum-chromophores) publish polarized absorption cross sections. The reproducible script `workbench/scripts/gem-color-study.py` downloads their supplementary workbook into ignored output, averages O/E curves, calculates Beer transmission at 5 mm, integrates against CIE D65 and the CIE 1931 2° observer over 380–780 nm, then converts XYZ to linear sRGB. It fits three RGB Beer coefficients to that reference path. Selected concentrations are 1300 ppma Cr³⁺ for ruby and 25 ppma Fe²⁺–Ti⁴⁺ for sapphire; these are illustrative concentration choices, not assays of particular natural specimens. Corundum's conversion is 1 ppma = 1.178 × 10¹⁷ ions/cm³. Negative/out-of-gamut RGB components are clipped to [0.002, 1] before fitting. Fluorescent red light in ruby is not added.

Source URLs and SHA-256 hashes, unclipped linear results, concentration choices and final fits are retained in `workbench/assets/gem-color-study.json`. Raw third-party datasets remain ignored. CIE sources: [1931 observer dataset](https://cie.co.at/datatable/cie-1931-colour-matching-functions-2-degree-observer), DOI 10.25039/CIE.DS.xvudnb9b; [official D65 CSV](https://files.cie.co.at/Publications-datasets/CIE_std_illum_D65.csv). A three-channel fit agrees at its chosen reference path; it cannot preserve a spectral integration at every thickness or under every illuminant.

### Other specimens

Other coefficients are documented appearance fits informed by the mineral's known hue, not measured spectra. They should not be used to identify, grade or value a gem. Refractive indices are representative values within published ranges; birefringence, pleochroism, fluorescence, inclusions and spectral illuminants are not simulated. The new bench caustic uses the same RGB approximation, not full spectral transport. RGB dispersion offsets are rendering approximations, not measured wavelength-resolved Sellmeier coefficients. Tiger's eye retains its artist-tuned directional fiber surface model.

| Specimen | Representative IOR | Reference transmitted sRGB | Basis |
| --- | --- | --- | --- |
| Tiger’s eye | 1.545 | Surface study | Directional surface approximation |
| Diamond | 2.417 | #ffffff | Appearance fit |
| Emerald | 1.583 | #48c089 | Appearance fit |
| Ruby | 1.767 | #b20772 | GIA spectral fit |
| Blue sapphire | 1.767 | #5375bf | GIA spectral fit |
| Aquamarine | 1.58 | #b9ecf7 | Appearance fit |
| Amethyst | 1.548 | #b160da | Appearance fit |
| Peridot | 1.67 | #bde462 | Appearance fit |
| Tsavorite | 1.74 | #59da74 | Appearance fit |
| Spessartine | 1.8 | #ee9c2e | Appearance fit |
| Pink spinel | 1.718 | #d05798 | Appearance fit |
| Tanzanite | 1.695 | #8e69e1 | Appearance fit |

Sources for identity, hue and representative refractive index:

- [Diamond](https://www.gia.edu/diamond), [emerald](https://www.gia.edu/emerald), [ruby](https://www.gia.edu/ruby), [sapphire](https://www.gia.edu/sapphire).
- [Aquamarine](https://www.gia.edu/gia-website/aquamarine), [amethyst](https://www.gia.edu/amethyst), [peridot](https://www.gia.edu/peridot), [spinel](https://www.gia.edu/spinel), [tanzanite](https://www.gia.edu/tanzanite%20).
- [GIA green gemstone guide, tsavorite](https://4cs.gia.edu/en-us/blog/gia-green-gemstones-buying-guide/), [Tsavorite USA mineral description](https://www.tsavorite.com/history/whatis.html).
- [GIA spessartine study](https://www.gia.edu/gems-gemology/winter-2001-spessartine-garnet-california-laurs).

## Meshes and setting

Live faceted specimens now use project-authored round brilliant, step, oval and cushion cut families with finite thin girdles, crown and pavilion planes. These are convex faceting studies, not exact commercial grading-standard cuts. The GPU tracer still uses exact dielectric Fresnel/Snell/TIR, RGB absorption and up to 12 internal reflections. The earlier credited diamond OBJ is preserved for the offline reference gallery and provenance, but is no longer the live browser diamond. The step cut has 42 planes; the other new solids have 89 including girdle facets. The brilliant pavilion now uses actual facet slopes approximately 40.3–41.5°, replacing its shallow lower tier. External paths sample the room cube probe and intersect finite examination apertures, rather than intersecting the nearby ring setting. The apertures are one-sided disks: one fixed focused/broad source and three fixed fill cards. Their HDR radiance follows Fresnel/refraction paths to produce white facet flashes. A fixed radial edge transition avoids undefined screen-space derivatives inside divergent paths. This is an art-directed, unoccluded source model without spectral transport or full scene intersection. A separate GPU light-side photon pass now deposits the selected gem’s refracted RGB flux on the flat bench; direct shadow maps retain geometric occlusion. Its cost, density filtering and receiver/occlusion limitations are documented in [the browser README](../workbench/README.md).

The current solitaire is authored in Blender by `workbench/scripts/build-solitaire.py`: a comfort-fit rounded band, swept cathedral shoulders, four curved claws and a gallery hoop are fused into one closed solid and polished before smooth shared-vertex export. The head adjusts gently to each cut while the shank retains its form. A separate lower-tessellation version supplies the collection samples. Brushing uses continuous depth UVs and a split angular seam, preserving smooth shared normals. [Current setting provenance and evaluated alternatives](../workbench/assets/ring-provenance.json).

The earlier Paul Wortmann CC0 `Ring.002` adaptation remains preserved as historical `solitaire-shank.obj`, with its original credits. It is no longer the displayed ring. Downloaded candidates were evaluated, but no new third-party ring mesh was imported; the replacement is project-authored. No repository-wide source license has been assigned.

## Baked room, live objects

[Felix Rieseberg's own account](https://felixrieseberg.com/made-by-mechanical-means/) describes Blender modeling and Cycles light atlases for static scenery, while movable objects remain live. This revision adopts that general workflow, with its own room design and geometry.

`workbench/scripts/build-atelier.py` runs in official Blender 4.5.14 LTS. It builds beveled walnut panels, coffers, bookcases, a jeweler bench, curtains, fabric shades and the fireplace, then adds the balance, open watch movement, lapidary drawing, wire, findings and hexagonal mineral specimens from `study-details.py`. Cycles uses 96 samples, a 4096² color atlas, 2048² linear HDR diffuse irradiance and 1024² HDR emission; only irradiance is denoised. MaterialUV and BakeUV are separate so photographed timber normals/roughness and the painting keep their original mapping. The glTF retains distinct wood, cloth, paper, metal and glass responses rather than flattening everything into one rough material. Runtime restores timber tint explicitly because the exporter does not preserve Blender's mixed color-node tint.

A separate `study-props.glb` preserves full 2K PBR maps and geometry for the CC0 Poly Haven grandfather clock, lambis shell and brass vase. Their placed geometry casts fixed shadows into the room bake. The clock's upstream glass exports its JPEG diffuse RGB into opacity, hiding the dial; the browser sets this material to 10% opacity and disables depth writes. All original downloads remain unchanged and checksum-pinned. [Object credits](../workbench/assets/study-props/CREDITS.md).

The actual room remains 3D with parallax. Cases, jewelry and loupe remain live and excluded from the bake. A 56-step participating flame volume uses advected 3D noise, separate tapered plumes and HDR emission above modeled charcoal and embers. This is an art-directed volume, not a fluid simulation or unbiased fire-light transport. Fixed bounced firelight is baked; a weak live point light supplies nearby illumination.

The framed mantel picture reuses **William Trost Richards’ *Sundown at Centre Harbor, New Hampshire* (1874)**, from [the Metropolitan Museum of Art, object 11909](https://www.metmuseum.org/art/collection/search/11909). The [official Open Access metadata](https://collectionapi.metmuseum.org/public/collection/v1/objects/11909) marks it `isPublicDomain: true`. The downloaded JPEG is retained with its source URL and SHA-256 in `workbench/assets/atelier-provenance.json`. The room architecture is authored here; the three explicitly credited antique/natural props are external meshes. No image-generation backdrop is used.

The source `.blend` and earlier diagnostic still (before the final firebox/shade details) are retained under ignored `output/study-research/`. Rebuild from the repository root with:

```sh
blender --background --factory-startup --python workbench/scripts/build-atelier.py
python3 workbench/scripts/fetch-study-props.py # optional restoration of pinned sources
blender --background --factory-startup --python workbench/scripts/build-solitaire.py
python3 workbench/scripts/gem-color-study.py # numpy and openpyxl required
npm run build --prefix workbench
```

The two physical cases have matching full-footprint lids and matching photographed velvet on trays and lining. Clicking the wood or lid eases into inspection and unfolds one tray sideways; the lower tray rises for visibility. Red velvet holds 12 gems; green velvet holds 18 alloy/finish samples. Selection remains live in this view. Escape or Back returns to the bench. Picking the loupe from a collection first returns the camera/case, then follows the normal clearance corridor. Keyboard-accessible collection buttons are also in Bench controls.

Performance is not benchmarked across devices. The fidelity revision retains native device pixel density, 4× MSAA where supported, full optical paths and full caustic sample count during interaction. It does not automatically blur the room or drop detail when dragging. Fixed architecture shadows are baked. A depth-aware foreground cache avoids recomputing precious materials when only ambient fire changes; movement invalidates it. This saves redundant work without changing the image's detail. The higher texture/geometry budget costs memory and can be slower on modest hardware. Historical timing results from the older adaptive build do not characterize this revision. Direct shadows and the flat-receiver RGB caustic still have the limits described in the browser README.

The static build losslessly packages the source room GLB into external glTF buffers below 20 MiB and the main ring OBJ into float32 positions/uint32 indices. It retains every room buffer-view byte and the same ring float32/index values used by the browser before packaging. Source assets stay unchanged; the build does not lower texture or mesh fidelity.
