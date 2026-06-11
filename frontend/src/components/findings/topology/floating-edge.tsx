import {
  BaseEdge,
  getBezierPath,
  Position,
  useInternalNode,
  type EdgeProps,
  type InternalNode,
} from "@xyflow/react"
import {
  DIM_OPACITY,
  REST_EDGE_OPACITY,
} from "@/components/findings/topology/emphasis"

// A "floating" edge: instead of attaching to fixed handles, it connects the
// two nodes wherever they currently sit — the path runs center-to-center and
// is clipped to each node's border, so dragging a node to the other side of
// its neighbor reroutes the edge instead of curling it around. Adapted from
// the React Flow floating-edges example.

type XY = { x: number; y: number }

// Login edges (users lens) carry direction marks instead of relying on a single
// arrowhead crammed against the pill border. At rest a quiet edge is tiled with
// small chevrons that flow source→target (a row of › › › along the curve); the
// chevrons are static SVG markers — zero idle repaint, the rule that killed
// global edge animation (see layout.ts). When an edge is *scoped* (its node is
// focused/searched) it switches to the strong color and a bounded dash-flow
// animation, and the chevrons drop out (the motion now carries direction). So
// chevrons live only in the resting view; the marching ants only on the handful
// of lit edges. Both encode the same source→target direction.
const CHEVRON_SPACING_PX = 44 // chord distance between chevrons
const CHEVRON_MAX = 6 // cap so a long edge never tiles into a centipede
const BEZIER_CURVATURE = 0.25 // React Flow's getBezierPath default

// The shared chevron marker, mounted once (see TopologyEdgeDefs). Referenced by
// every quiet login edge via marker-mid; orient="auto" rotates each instance to
// the local path direction so the chevron always points downstream.
export const CHEVRON_MARKER_ID = "topo-edge-chevron"

// Reconstructs React Flow's bezier control offset for one end, so the chevron
// polyline samples the SAME curve BaseEdge draws (getBezierPath gives us the
// path string and label point, but not the control points we need to sample).
function controlOffset(distance: number): number {
  return distance >= 0
    ? 0.5 * distance
    : BEZIER_CURVATURE * 25 * Math.sqrt(-distance)
}

function controlPoint(pos: Position, end: XY, other: XY): XY {
  switch (pos) {
    case Position.Left:
      return { x: end.x - controlOffset(end.x - other.x), y: end.y }
    case Position.Right:
      return { x: end.x + controlOffset(other.x - end.x), y: end.y }
    case Position.Top:
      return { x: end.x, y: end.y - controlOffset(end.y - other.y) }
    default: // Bottom
      return { x: end.x, y: end.y + controlOffset(other.y - end.y) }
  }
}

function cubicAt(t: number, p0: XY, c0: XY, c1: XY, p1: XY): XY {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return {
    x: a * p0.x + b * c0.x + c * c1.x + d * p1.x,
    y: a * p0.y + b * c0.y + c * c1.y + d * p1.y,
  }
}

// A polyline tracing the bezier with one interior vertex per chevron — marker-mid
// fires at each interior vertex, so vertex count == chevron count. Coarse on
// purpose: the visible smooth line is BaseEdge's; this path is stroke-less and
// exists only to carry (and orient) the markers.
function chevronPath(
  source: XY,
  sourceCtrl: XY,
  targetCtrl: XY,
  target: XY,
  count: number,
): string {
  let d = `M${source.x},${source.y}`
  for (let i = 1; i <= count; i++) {
    const p = cubicAt(i / (count + 1), source, sourceCtrl, targetCtrl, target)
    d += `L${p.x},${p.y}`
  }
  return `${d}L${target.x},${target.y}`
}

// Point where the center-to-center line exits `node`'s rectangle.
function getNodeIntersection(node: InternalNode, other: InternalNode): XY {
  const w = (node.measured.width ?? 0) / 2
  const h = (node.measured.height ?? 0) / 2

  const x2 = node.internals.positionAbsolute.x + w
  const y2 = node.internals.positionAbsolute.y + h
  const x1 = other.internals.positionAbsolute.x + (other.measured.width ?? 0) / 2
  const y1 = other.internals.positionAbsolute.y + (other.measured.height ?? 0) / 2

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h)
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h)
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1))
  const xx3 = a * xx1
  const yy3 = a * yy1
  const x = w * (xx3 + yy3) + x2
  const y = h * (-xx3 + yy3) + y2

  return { x, y }
}

// Which side of the node the intersection point lies on — drives the bezier
// control-point direction so the curve leaves the node perpendicular-ish.
function getEdgePosition(node: InternalNode, point: XY): Position {
  const nx = Math.round(node.internals.positionAbsolute.x)
  const ny = Math.round(node.internals.positionAbsolute.y)
  const px = Math.round(point.x)
  const py = Math.round(point.y)

  if (px <= nx + 1) return Position.Left
  if (px >= nx + (node.measured.width ?? 0) - 1) return Position.Right
  if (py <= ny + 1) return Position.Top
  return Position.Bottom
}

export function FloatingEdge({
  id,
  source,
  target,
  markerEnd,
  style,
  label,
  labelStyle,
  data,
}: EdgeProps) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)

  if (!sourceNode || !targetNode) return null

  // Set by the emphasis pass (focus/search) and the layout. Applied here — not
  // via the edge's style prop — so the label and its background pill track the
  // path. A login edge ("quiet" via restStroke) has three resting states:
  //   - lit (its node is scoped): full strong color + dash-flow animation.
  //   - dimmed (far from the scoped node): the faintest state, no marks.
  //   - neither (nothing scoped): quiet — neutral grey, tiled with chevrons.
  // Edges without a restStroke (routes/subnets lenses) ignore all of this and
  // keep their strong color at rest, as before.
  const d = data as
    | { dimmed?: boolean; lit?: boolean; restStroke?: string }
    | undefined
  const isLogin = d?.restStroke !== undefined
  const dimmed = Boolean(d?.dimmed)
  const lit = Boolean(d?.lit)
  const quiet = isLogin && !lit && !dimmed
  const opacity = dimmed
    ? DIM_OPACITY
    : quiet
      ? REST_EDGE_OPACITY
      : undefined
  const restStroke = quiet ? d?.restStroke : undefined

  const sourcePoint = getNodeIntersection(sourceNode, targetNode)
  const targetPoint = getNodeIntersection(targetNode, sourceNode)
  const sourcePosition = getEdgePosition(sourceNode, sourcePoint)
  const targetPosition = getEdgePosition(targetNode, targetPoint)

  const [path, labelX, labelY] = getBezierPath({
    sourceX: sourcePoint.x,
    sourceY: sourcePoint.y,
    sourcePosition,
    targetX: targetPoint.x,
    targetY: targetPoint.y,
    targetPosition,
  })

  // Direction chevrons: resting login edges only. Skipped while lit (the flow
  // animation carries direction) and while dimmed (keep the de-focused view
  // calm). Samples the same curve BaseEdge renders.
  let chevrons: string | null = null
  if (quiet) {
    const chord = Math.hypot(
      targetPoint.x - sourcePoint.x,
      targetPoint.y - sourcePoint.y,
    )
    const count = Math.min(
      CHEVRON_MAX,
      Math.max(1, Math.round(chord / CHEVRON_SPACING_PX)),
    )
    chevrons = chevronPath(
      sourcePoint,
      controlPoint(sourcePosition, sourcePoint, targetPoint),
      controlPoint(targetPosition, targetPoint, sourcePoint),
      targetPoint,
      count,
    )
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          ...style,
          ...(restStroke ? { stroke: restStroke } : {}),
          opacity,
          // Lit login edges march source→target; bounded to the scoped set, so
          // no idle repaint. dasharray sum (14) matches the keyframe offset for
          // a seamless loop. See @keyframes topo-edge-flow in index.css.
          ...(isLogin && lit
            ? {
                strokeDasharray: "8 6",
                animation: "topo-edge-flow 0.8s linear infinite",
              }
            : {}),
          transition: "opacity 150ms, stroke 150ms",
        }}
        label={label}
        labelX={labelX}
        labelY={labelY}
        labelStyle={{ ...labelStyle, opacity, transition: "opacity 150ms" }}
        // Opaque pill behind the label so it stays readable where edges cross.
        labelShowBg
        labelBgStyle={{
          fill: "var(--color-card)",
          fillOpacity: dimmed ? DIM_OPACITY : 0.92,
          transition: "fill-opacity 150ms",
        }}
        labelBgPadding={[6, 3]}
        labelBgBorderRadius={4}
      />
      {chevrons && (
        <path
          d={chevrons}
          fill="none"
          stroke="none"
          style={{ opacity, pointerEvents: "none" }}
          markerStart={undefined}
          markerEnd={undefined}
          // Each interior vertex emits an oriented chevron.
          markerMid={`url(#${CHEVRON_MARKER_ID})`}
        />
      )}
    </>
  )
}

// The shared chevron marker. Mounted once inside the flow (see topology-view);
// every quiet login edge references it by id. markerUnits="userSpaceOnUse"
// keeps a constant on-screen size regardless of the (stroke-less) carrier path.
export function TopologyEdgeDefs() {
  return (
    <svg
      aria-hidden
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      <defs>
        <marker
          id={CHEVRON_MARKER_ID}
          viewBox="0 0 8 8"
          refX="4"
          refY="4"
          markerWidth="8"
          markerHeight="8"
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <path
            d="M2.5,1.5 L6,4 L2.5,6.5"
            fill="none"
            stroke="var(--color-muted-foreground)"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </marker>
      </defs>
    </svg>
  )
}
