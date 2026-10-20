export const DEFAULT_TILL_COLOR = "#2563eb"
export const TILL_COLOR_PRESETS = [
  { name: "Ocean", color: "#2563eb" }, { name: "Emerald", color: "#047857" },
  { name: "Violet", color: "#7c3aed" }, { name: "Rose", color: "#be185d" },
  { name: "Amber", color: "#b45309" }, { name: "Teal", color: "#0f766e" },
  { name: "Indigo", color: "#4338ca" }, { name: "Charcoal", color: "#334155" },
]
export const isTillColor = (color: string) => /^#[0-9a-f]{6}$/i.test(color)
const rgb = (color: string) => [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16))
const mix = (color: string, target: number, amount: number) => "#" + rgb(color).map(channel => Math.round(channel * (1 - amount) + target * amount).toString(16).padStart(2, "0")).join("")
function luminance(color: string) {
  const values = rgb(color).map(channel => { const value = channel / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4 })
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
}
export function tillContrast(first: string, second: string): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}
export function tillThemeVariables(input: string): Record<string, string> {
  const color = isTillColor(input) ? input.toLowerCase() : DEFAULT_TILL_COLOR
  const foreground = tillContrast(color, "#ffffff") >= tillContrast(color, "#000000") ? "#ffffff" : "#000000"
  let ink = color
  for (let step = 0; tillContrast(ink, "#ffffff") < 4.5 && step < 20; step++) ink = mix(ink, 0, 0.12)
  return {
    "--primary": color, "--primary-foreground": foreground, "--ring": color, "--chart-1": color,
    "--till-ink": ink, "--till-accent": mix(color, 255, 0.75),
    "--color-blue-50": mix(color, 255, 0.96), "--color-blue-100": mix(color, 255, 0.9),
    "--color-blue-200": mix(color, 255, 0.8), "--color-blue-300": mix(color, 255, 0.6),
    "--color-blue-400": mix(color, 255, 0.25), "--color-blue-500": color, "--color-blue-600": color,
    "--color-blue-700": mix(color, 0, 0.15), "--color-blue-800": mix(color, 0, 0.3),
    "--color-blue-900": mix(color, 0, 0.6), "--color-blue-950": mix(color, 0, 0.8),
  }
}
