export const SCRATCH_VISUAL_CONFIG = {
  revealThreshold: 0.48,
  coverage: { areaWeight: 0.7, gestureWeight: 0.3, minimumArea: 0.16 },
  interaction: { touchBrushSize: 32, mouseBrushSize: 30, maxPixelRatio: 2 },
  pattern: { type: "logo" as const, asset: "/logo.svg", opacity: 0.18, spacing: 60, width: 44, rotation: -8 },
  coating: {
    base: ["#b8b0a5", "#f2ede4", "#c9c0b4", "#817970"],
    pattern: "rgba(146,106,48,.58)",
    border: "rgba(174,132,63,.58)",
    text: "rgba(54,43,33,.76)",
  },
  copy: { title: "RASPA AQUÍ", instruction: "Desliza tu dedo", brand: "KTDRAL LOUNGE" },
} as const;
