// RGB transport presets, not intrinsic mineral colors. Ruby/sapphire are fitted
// to GIA cross sections; other absorptions are representative appearance fits.
// See docs/GEM-COLOR.md for path length, observer, sources and limitations.
export const GEMS = {
  tiger: {
    name: "Tiger’s eye",
    cut: "cabochon",
    ior: 1.545,
    swatch: "#9d6728",
    note: "A silky quartz cabochon. Turn the stone to find the golden ribbon.",
  },
  diamond: {
    name: "Diamond",
    cut: "brilliant",
    ior: 2.417,
    dispersion: 0.018,
    absorption: [0.004, 0.004, 0.004],
    swatch: "#e1e7e6",
    note: "A brilliant cut, with a thin girdle and steep pavilion for internal reflection.",
  },
  emerald: {
    name: "Emerald",
    cut: "step",
    ior: 1.583,
    dispersion: 0.006,
    absorption: [2.75, 0.64, 1.38],
    swatch: "#479e77",
    note: "A cool, deep green beryl. Its step facets reveal longer, darker paths through the stone.",
  },
  ruby: {
    name: "Ruby",
    cut: "oval",
    ior: 1.767,
    dispersion: 0.008,
    absorption: [0.805861, 6.214608, 1.781837],
    swatch: "#b20772",
    note: "Chromium gives corundum its red to purplish red color. Turn it to reveal bright and dark facets.",
  },
  sapphire: {
    name: "Blue sapphire",
    cut: "cushion",
    ior: 1.767,
    dispersion: 0.008,
    absorption: [2.437074, 1.732909, 0.657657],
    swatch: "#5375bf",
    note: "Iron and titanium create this corundum’s blue. Its color deepens along longer light paths.",
  },
  aquamarine: {
    name: "Aquamarine",
    cut: "step",
    ior: 1.58,
    dispersion: 0.005,
    absorption: [0.72, 0.18, 0.07],
    swatch: "#a7dce8",
    note: "An iron-colored blue beryl. Compare its pale body color with emerald’s richer green.",
  },
  amethyst: {
    name: "Amethyst",
    cut: "cushion",
    ior: 1.548,
    dispersion: 0.007,
    absorption: [0.82, 2.15, 0.35],
    swatch: "#b361d5",
    note: "Violet quartz. The broad cushion facets alternate between lilac and deep purple.",
  },
  peridot: {
    name: "Peridot",
    cut: "oval",
    ior: 1.67,
    dispersion: 0.01,
    absorption: [0.68, 0.25, 2.1],
    swatch: "#bce363",
    note: "Iron-colored olivine, with a warmer yellow-green than emerald or tsavorite.",
  },
  tsavorite: {
    name: "Tsavorite",
    cut: "brilliant",
    ior: 1.74,
    dispersion: 0.012,
    absorption: [2.3, 0.35, 1.75],
    swatch: "#57d173",
    note: "A vivid green grossular garnet, colored by vanadium and sometimes chromium.",
  },
  spessartine: {
    name: "Spessartine",
    cut: "cushion",
    ior: 1.8,
    dispersion: 0.013,
    absorption: [0.16, 1.1, 3.6],
    swatch: "#ed9d2e",
    note: "A manganese-rich garnet. Its warm mandarin-orange body makes a striking contrast with sapphire.",
  },
  spinel: {
    name: "Pink spinel",
    cut: "brilliant",
    ior: 1.718,
    dispersion: 0.009,
    absorption: [0.46, 2.35, 1.16],
    swatch: "#d0619d",
    note: "A singly refractive gemstone in its own right, with a bright raspberry-pink appearance.",
  },
  tanzanite: {
    name: "Tanzanite",
    cut: "oval",
    ior: 1.695,
    dispersion: 0.01,
    absorption: [1.3, 1.95, 0.28],
    swatch: "#9064df",
    note: "Blue-violet zoisite. Natural pleochroism is not simulated in this RGB study.",
  },
};

export function referenceColor(gem, path = 1) {
  if (!gem.absorption) return gem.swatch;
  const encoded = gem.absorption.map((mu) => {
    const c = Math.exp(-mu * path);
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  });
  return (
    "#" +
    encoded
      .map((c) =>
        Math.round(Math.max(0, Math.min(1, c)) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
for (const gem of Object.values(GEMS))
  if (gem.absorption) gem.swatch = referenceColor(gem);
