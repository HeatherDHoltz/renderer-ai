# Gemstone color

Gem color depends on material absorption, light, thickness and viewing direction. A photograph’s RGB value is not an absorption coefficient.

The browser uses RGB Beer–Lambert absorption along internal ray segments. Its reference optical unit represents a 5 mm path. Ruby and sapphire coefficients are fitted using `workbench/scripts/gem-color-study.py`:

1. Read published polarized absorption data and average the two orientations.
2. Calculate transmission through 5 mm under CIE D65 light.
3. Integrate with the CIE 1931 observer and convert to linear sRGB.
4. Clip out-of-gamut components to [0.002, 1], then fit three absorption coefficients.

Illustrative concentrations: 1300 ppma chromium for ruby; 25 ppma iron–titanium for sapphire. These are chosen examples, not assays of actual stones. The fit agrees at the chosen path; it cannot match spectral calculations at every thickness or under every light. Fluorescence, crystal polarization and inclusions are omitted. Other gem colors and alloy presets are appearance choices rather than measured spectra.

Sources and fit results, including hashes: `workbench/assets/gem-color-study.json`.

- [GIA corundum chromophores, Dubinsky, Stone-Sundberg and Emmett (2020)](https://www.gia.edu/gems-gemology/spring-2020-corundum-chromophores)
- [CIE 1931 observer](https://cie.co.at/datatable/cie-1931-colour-matching-functions-2-degree-observer)
- [CIE D65 data](https://files.cie.co.at/Publications-datasets/CIE_std_illum_D65.csv)

Reproduce with Python containing NumPy and openpyxl:

```sh
python3 workbench/scripts/gem-color-study.py
```

The current live cuts and ring are authored in this project. Historical downloaded cuts remain in the offline gallery, with [Zsky attribution](../assets/gems/ATTRIBUTION.md). The old Paul Wortmann band is preserved but no longer displayed; see `workbench/assets/ring-provenance.json`. [Rendering methods and limits](RENDERING.md).
