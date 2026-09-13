// Pure simulation behind the login background: restrained "digital rain".
// Each column owns a falling head, a trail of glyphs behind it, and a pause
// before it restarts. No DOM here so it can be unit-tested; the canvas
// component only draws what this module computes.

export interface RainColumn {
  // Head position in rows; may be negative while the column waits offscreen.
  head: number
  speedRowsPerSec: number
  trailRows: number
  // One glyph per row of the viewport, so a trail can be drawn by index.
  glyphs: string[]
}

export interface Rain {
  cols: number
  rows: number
  columns: RainColumn[]
}

export type Random = () => number

// Half-width katakana plus hex digits: the classic look without a font
// dependency, since the system fallback covers both ranges.
const GLYPHS =
  "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEF<>[]{}=+*#"
const MIN_SPEED = 5
const MAX_SPEED = 13
const MIN_TRAIL = 6
const MAX_TRAIL = 22
// Rows of idle wait above the top edge before a column starts falling again.
const MAX_IDLE_ROWS = 60
// Probability per step that one random glyph in a column flips.
const MUTATION_CHANCE = 0.35

export function createRain(cols: number, rows: number, random: Random = Math.random): Rain {
  const columns = Array.from({ length: cols }, () => {
    const column = spawnColumn(rows, random)
    // Start scattered through the fall so the first frame is not empty.
    return { ...column, head: random() * (rows + MAX_IDLE_ROWS) - MAX_IDLE_ROWS }
  })
  return { cols, rows, columns }
}

// Advances the rain by dt milliseconds and returns a new state. A column
// that has fully left the bottom respawns above the top with fresh glyphs.
export function stepRain(rain: Rain, dtMs: number, random: Random = Math.random): Rain {
  const dt = Math.min(dtMs, 100) / 1000 // clamp so a background tab does not skip ahead
  const columns = rain.columns.map((c) => {
    const head = c.head + c.speedRowsPerSec * dt
    if (head - c.trailRows > rain.rows) return spawnColumn(rain.rows, random)
    const glyphs = random() < MUTATION_CHANCE ? mutate(c.glyphs, random) : c.glyphs
    return { ...c, head, glyphs }
  })
  return { ...rain, columns }
}

// Rebuilds the grid for a new viewport size.
export function resizeRain(rain: Rain, cols: number, rows: number, random: Random = Math.random): Rain {
  if (rain.cols === cols && rain.rows === rows) return rain
  return createRain(cols, rows, random)
}

export function randomGlyph(random: Random = Math.random): string {
  return GLYPHS[Math.floor(random() * GLYPHS.length)]
}

function spawnColumn(rows: number, random: Random): RainColumn {
  return {
    head: -random() * MAX_IDLE_ROWS,
    speedRowsPerSec: MIN_SPEED + random() * (MAX_SPEED - MIN_SPEED),
    trailRows: Math.round(MIN_TRAIL + random() * (MAX_TRAIL - MIN_TRAIL)),
    glyphs: Array.from({ length: rows }, () => randomGlyph(random)),
  }
}

function mutate(glyphs: string[], random: Random): string[] {
  const i = Math.floor(random() * glyphs.length)
  return glyphs.map((g, j) => (j === i ? randomGlyph(random) : g))
}
