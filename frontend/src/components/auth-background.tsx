import { useEffect, useRef } from "react"
import { createScene, resizeScene, stepScene, type Scene } from "@/lib/topology-scene"

// Full-viewport canvas behind the auth pages: a drifting beacon topology of
// hub and implant nodes with packets pulsing along the edges. Colours are
// read from the theme tokens so both light and dark mode look intentional,
// and a radial mask keeps the centre quiet where the card sits.
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
    let scene: Scene = createScene(window.innerWidth, window.innerHeight)
    let ink = readInk(canvas)
    let frame = 0
    let last = performance.now()

    function fit() {
      const dpr = window.devicePixelRatio || 1
      const w = window.innerWidth
      const h = window.innerHeight
      canvas!.width = Math.round(w * dpr)
      canvas!.height = Math.round(h * dpr)
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      scene = resizeScene(scene, w, h)
    }

    function draw(now: number) {
      if (!reduceMotion.matches) {
        scene = stepScene(scene, now - last)
      }
      last = now
      paint(ctx!, scene, ink)
      if (!reduceMotion.matches) frame = requestAnimationFrame(draw)
    }

    function restart() {
      cancelAnimationFrame(frame)
      last = performance.now()
      frame = requestAnimationFrame(draw)
    }

    // next-themes toggles the `dark` class on <html>; re-read the ink then.
    const themeObserver = new MutationObserver(() => {
      ink = readInk(canvas)
      if (reduceMotion.matches) paint(ctx, scene, ink)
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })

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
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full text-foreground [mask-image:radial-gradient(ellipse_at_center,transparent_18%,black_65%)]"
    />
  )
}

const EDGE_ALPHA = 0.14
const NODE_ALPHA = 0.45
const HUB_RING_ALPHA = 0.22
const PULSE_ALPHA = 0.9

// The canvas carries `text-foreground`, so its computed colour is the theme
// ink. Reading it once per theme change keeps the draw loop allocation-free.
function readInk(canvas: HTMLCanvasElement): string {
  return getComputedStyle(canvas).color || "currentColor"
}

function paint(ctx: CanvasRenderingContext2D, scene: Scene, ink: string) {
  ctx.clearRect(0, 0, scene.width, scene.height)
  ctx.strokeStyle = ink
  ctx.fillStyle = ink

  ctx.globalAlpha = EDGE_ALPHA
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const e of scene.edges) {
    const a = scene.nodes[e.from]
    const b = scene.nodes[e.to]
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
  }
  ctx.stroke()

  for (const n of scene.nodes) {
    ctx.globalAlpha = NODE_ALPHA
    ctx.beginPath()
    ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
    ctx.fill()
    if (n.isHub) {
      ctx.globalAlpha = HUB_RING_ALPHA
      ctx.beginPath()
      ctx.arc(n.x, n.y, n.radius * 2.6, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  ctx.globalAlpha = PULSE_ALPHA
  for (const p of scene.pulses) {
    const e = scene.edges[p.edge]
    if (!e) continue
    const from = scene.nodes[p.towardHub ? e.from : e.to]
    const to = scene.nodes[p.towardHub ? e.to : e.from]
    const x = from.x + (to.x - from.x) * p.progress
    const y = from.y + (to.y - from.y) * p.progress
    ctx.beginPath()
    ctx.arc(x, y, 1.6, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}
