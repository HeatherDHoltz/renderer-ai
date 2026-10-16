# Gem color and the contemporary atelier

The browser workshop is a separate real-time presentation of the renderer studies. It does not replace the Rust renderer or Mitsuba. This revision follows a warm contemporary atelier direction: walnut, ivory mineral paint, linen, burgundy and green velvet, satin brass, books, small tools and amber-glass votives. The plant, oversized rustic props and detached window frame have been removed.

## Color is not a mineral's RGB constant

A gemstone's observed color depends on its absorption spectrum, trace-element concentrations, path length, crystal orientation, illumination and the observer/display. A hex picked from a photograph includes its lighting, exposure and tone mapping. It is not an absorption coefficient. Emeralds themselves range from bluish green to green; the earlier weak green absorption preset was too pale and yellow for this representative specimen. [GIA emerald quality factors](https://www.gia.edu/emerald-quality-factor), [GIA on emerald chromophores](https://www.gia.edu/seeing-green).

The faceted shader uses `T = exp(-absorption * local_path_length)` for each RGB channel along each internal segment. Surface Fresnel reflection is not tinted by that absorption. The table below describes a *reference transmitted swatch at one optical unit*, not a pixel color promised in the scene. One optical unit is interpreted as a 5 mm calibration path, independently of the artistic workshop scale. Multiple internal paths, the environment and ACES exposure change the final image.

### Measured data for ruby and blue sapphire

[Dubinsky, Stone-Sundberg and Emmett, GIA, 2020](https://www.gia.edu/gems-gemology/spring-2020-corundum-chromophores) publish polarized absorption cross sections. The reproducible script `workbench/scripts/gem-color-study.py` downloads their supplementary workbook into ignored output, averages O/E curves, calculates Beer transmission at 5 mm, integrates against CIE D65 and the CIE 1931 2° observer over 380–780 nm, then converts XYZ to linear sRGB. It fits three RGB Beer coefficients to that reference path. Selected concentrations are 1300 ppma Cr³⁺ for ruby and 25 ppma Fe²⁺–Ti⁴⁺ for sapphire; these are illustrative concentration choices, not assays of particular natural specimens. Corundum's conversion is 1 ppma = 1.178 × 10¹⁷ ions/cm³. Negative/out-of-gamut RGB components are clipped to [0.002, 1] before fitting. Fluorescent red light in ruby is not added.

Source URLs and SHA-256 hashes, unclipped linear results, concentration choices and final fits are retained in `workbench/assets/gem-color-study.json`. Raw third-party datasets remain ignored. CIE sources: [1931 observer dataset](https://cie.co.at/datatable/cie-1931-colour-matching-functions-2-degree-observer), DOI 10.25039/CIE.DS.xvudnb9b; [official D65 CSV](https://files.cie.co.at/Publications-datasets/CIE_std_illum_D65.csv). A three-channel fit agrees at its chosen reference path; it cannot preserve a spectral integration at every thickness or under every illuminant.

### Other specimens

Other coefficients are documented appearance fits informed by the mineral's known hue, not measured spectra. They should not be used to identify, grade or value a gem. Refractive indices are representative values within published ranges; birefringence, pleochroism, fluorescence, inclusions, spectral illuminants and caustics are not simulated. RGB dispersion offsets are rendering approximations, not measured wavelength-resolved Sellmeier coefficients. Tiger's eye retains its artist-tuned directional fiber surface model.

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

Live faceted specimens now use project-authored round brilliant, step, oval and cushion cut families with finite thin girdles, crown and pavilion planes. These are convex faceting studies, not exact commercial grading-standard cuts. The GPU tracer still uses exact dielectric Fresnel/Snell/TIR, RGB absorption and up to 12 internal reflections. The earlier credited diamond OBJ is preserved for the offline reference gallery and provenance, but is no longer the live browser diamond. The step cut has 42 planes; the other new solids have 89 including girdle facets. External paths sample the room cube probe rather than intersecting the nearby ring setting.

The shank derives from **Paul Wortmann's Ring.002**, [OpenGameArt Ring pack](https://opengameart.org/content/ring-0), released January 29, 2023 under **CC0**. Download: https://opengameart.org/sites/default/files/ring_1.zip. This pack provides bands, not a ready-made solitaire setting. `workbench/scripts/adapt-ring.py` transforms and tapers that band, opens and caps the head, and exports `solitaire-shank.obj`. Original weathered textures are not used. The cathedral shoulders, compact claws and thin pavilion support are project-created. Metal finishing requires cylindrical UVs; those are generated when importing the shank.

## Baked room, live objects

[Felix Rieseberg's own account](https://felixrieseberg.com/made-by-mechanical-means/) describes Blender modeling and Cycles light atlases for static scenery, while movable objects remain live. This revision adopts that general workflow, with its own room design and geometry.

`workbench/scripts/build-atelier.py` runs in official Blender 4.5.14 LTS. It builds beveled room/desk/shelf geometry, folded linen, book covers/pages, tools and props, then packs a shared 2048² UV atlas. Cycles bakes base color and fixed diffuse irradiance in separate passes at 48 samples; the diffuse irradiance atlas is then denoised in Blender’s compositor, without smoothing the base-color or live gem shaders. The scene export is `atelier.glb`; `atelier-light.hdr` preserves linear HDR irradiance. The separate PNG is retained as build evidence; the GLB embeds it. Runtime loads the atlas as a light map. The actual room remains 3D, with parallax and live task-light shading/shadows. The static bake excludes the movable lamp, cases, jewelry and loupe. No moving task-light illumination is frozen into the room bake. A small live fill is used for moving objects, so this is an art-directed hybrid, not a physically unbiased room solution.

The source `.blend` and Cycles diagnostic still are retained under ignored `output/atelier-research/`. Rebuild from the repository root with:

```sh
blender --background --factory-startup --python workbench/scripts/build-atelier.py
python3 workbench/scripts/adapt-ring.py
python3 workbench/scripts/gem-color-study.py # numpy and openpyxl required
npm run build --prefix workbench
```

The two physical cases have matching full-footprint lids and matching photographed velvet on trays and lining. Clicking the wood or lid eases into inspection and unfolds one tray sideways; the lower tray rises for visibility. Red velvet holds 12 gems; green velvet holds 18 alloy/finish samples. Selection remains live in this view. Escape or Back returns to the bench. Picking the loupe from a collection first returns the camera/case, then follows the normal clearance corridor. Keyboard-accessible collection buttons are also in Bench controls.

Performance is not benchmarked across devices. The baked room trades a few texture megabytes for fixed-light complexity. Twelve optically traced samples and the higher facet count can increase GPU cost; static scenery uses one shared atlas/material. The jewelry probe remains capped at 10 Hz while dirty, and the room keeps its stable environment so that cap does not step table lighting. Shadows of transparent gems remain opaque approximations.
