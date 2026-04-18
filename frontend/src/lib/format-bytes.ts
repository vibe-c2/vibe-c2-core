const UNITS = ["B", "KB", "MB", "GB"] as const

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1)
  const value = bytes / Math.pow(1024, exponent)
  const precision = value >= 10 || exponent === 0 ? 0 : 1
  return `${value.toFixed(precision)} ${UNITS[exponent]}`
}

export function byteSizeOf(text: string): number {
  return new Blob([text]).size
}
