import { useEffect, useRef } from "react"
import { createRain, resizeRain, stepRain, type Rain } from "@/lib/matrix-rain"

// Full-viewport canvas behind the auth pages: restrained digital rain in the
// theme's monospace face. The ink is read from the foreground token so both
// themes look intentional, and a horizontal mask keeps the centre band quiet
// where the card sits, leaving the rain to the outer thirds.
//
// Reduced motion: a single static frame is drawn and the loop never starts.
export function AuthBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    let rain: Rain = createRain(gridCols(window.innerWidth), gridRows(window.innerHeight))
    let ink = readInk(canvas)
    let font = readFont(canvas)
    let frame = 0
    let last = performance.now()
    let sinceDraw = 0

    function fit() {
      const dpr = window.devicePixelRatio || 1
      const w = window.innerWidth
      const h = window.innerHeight
      canvas!.width = Math.round(w * dpr)
      canvas!.height = Math.round(h * dpr)
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      rain = resizeRain(rain, gridCols(w), gridRows(h))
    }

    function draw(now: number) {
      const dt = now - last
      last = now
      if (!reduceMotion.matches) {
        rain = stepRain(rain, dt)
        // Redraw at a capped rate: the discrete flicker is part of the look
        // and it keeps text rendering cheap.
        sinceDraw += dt
        if (sinceDraw >= FRAME_MS) {
          sinceDraw = 0
          paint(ctx!, rain, ink, font)
        }
        frame = requestAnimationFrame(draw)
        return
      }
      paint(ctx!, rain, ink, font)
    }

    function restart() {
      cancelAnimationFrame(frame)
      last = performance.now()
      frame = requestAnimationFrame(draw)
    }

    // next-themes toggles the `dark` class on <html>; re-read the ink then.
    const themeObserver = new MutationObserver(() => {
      ink = readInk(canvas)
      if (reduceMotion.matches) paint(ctx, rain, ink, font)
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })

    // Fonts can finish loading after mount; refresh the face once they do.
    document.fonts?.ready.then(() => {
      font = readFont(canvas)
    })

    fit()
    restart()
    window.addEventListener("resize", fit)
    reduceMotion.addEventListener("change", restart)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", fit)
      reduceMotion.removeEventListener("change", restart)
      themeObserver.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full font-mono text-foreground [mask-image:linear-gradient(to_right,black_0%,transparent_32%,transparent_68%,black_100%)]"
    />
  )
}

const CELL_PX = 16 // column pitch and row pitch
const FONT_PX = 13
const FRAME_MS = 70 // ~14fps, the classic stepped cadence
const HEAD_ALPHA = 0.85
const TRAIL_ALPHA = 0.32 // alpha of the glyph right behind the head
const TRAIL_FLOOR = 0.02 // alpha at the tail end

function gridCols(width: number): number {
  return Math.ceil(width / CELL_PX)
}

function gridRows(height: number): number {
  return Math.ceil(height / CELL_PX)
}

// The canvas carries `text-foreground` and `font-mono`, so its computed
// style yields the theme ink and the monospace family without duplicating
// token values here.
function readInk(canvas: HTMLCanvasElement): string {
  return getComputedStyle(canvas).color || "currentColor"
}

function readFont(canvas: HTMLCanvasElement): string {
  const family = getComputedStyle(canvas).fontFamily || "monospace"
  return `${FONT_PX}px ${family}`
}

function paint(ctx: CanvasRenderingContext2D, rain: Rain, ink: string, font: string) {
  ctx.clearRect(0, 0, rain.cols * CELL_PX, rain.rows * CELL_PX)
  ctx.fillStyle = ink
  ctx.font = font
  ctx.textBaseline = "top"
  ctx.textAlign = "center"

  rain.columns.forEach((c, col) => {
    const headRow = Math.floor(c.head)
    const x = col * CELL_PX + CELL_PX / 2
    for (let k = 0; k < c.trailRows; k++) {
      const row = headRow - k
      if (row < 0 || row >= rain.rows) continue
      const t = k / c.trailRows
      ctx.globalAlpha = k === 0 ? HEAD_ALPHA : TRAIL_ALPHA * (1 - t) + TRAIL_FLOOR * t
      ctx.fillText(c.glyphs[row], x, row * CELL_PX)
    }
  })
  ctx.globalAlpha = 1
}
