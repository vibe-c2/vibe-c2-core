// Predefined color palette for wiki document custom (Lucide) icons.
//
// Values are stored as literal OKLCH strings on WikiDocument.color so the
// rendered color is self-describing in API responses and survives theme
// switches without a CSS-var indirection. Empty string ("") means "no color
// override" — the icon falls back to the surrounding currentColor.
//
// Lightness ~0.65 keeps the swatches readable on both light (L=1) and dark
// (L=0.145) backgrounds; chroma ~0.15 keeps them recognizably distinct
// without clashing with the existing destructive/primary semantics.

export interface WikiIconColor {
  /** Empty string means "default" — render in inherited currentColor. */
  value: string
  label: string
}

export const WIKI_ICON_COLORS: readonly WikiIconColor[] = [
  { value: "", label: "Default" },
  { value: "oklch(0.62 0.04 250)", label: "Slate" },
  { value: "oklch(0.65 0.18 25)", label: "Red" },
  { value: "oklch(0.72 0.16 55)", label: "Orange" },
  { value: "oklch(0.78 0.14 85)", label: "Amber" },
  { value: "oklch(0.7 0.16 145)", label: "Green" },
  { value: "oklch(0.7 0.12 195)", label: "Teal" },
  { value: "oklch(0.65 0.16 245)", label: "Blue" },
  { value: "oklch(0.62 0.18 295)", label: "Purple" },
  { value: "oklch(0.7 0.17 0)", label: "Pink" },
]
