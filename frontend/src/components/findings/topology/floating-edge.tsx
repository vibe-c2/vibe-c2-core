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
  // path. Three resting states for a login edge ("quiet" via restStroke):
  //   - lit (its node is scoped): full strong color, full opacity.
  //   - dimmed (far from the scoped node): the faintest state.
  //   - neither (nothing scoped): quiet — neutral grey at reduced opacity, so
  //     the nodes own the resting view instead of a wall of colored wiring.
  // Edges without a restStroke (routes/subnets lenses) ignore the quiet path
  // and keep their strong color at rest, as before.
  const d = data as
    | { dimmed?: boolean; lit?: boolean; restStroke?: string }
    | undefined
  const dimmed = Boolean(d?.dimmed)
  const quiet = d?.restStroke !== undefined && !d?.lit && !dimmed
  const opacity = dimmed
    ? DIM_OPACITY
    : quiet
      ? REST_EDGE_OPACITY
      : undefined
  const restStroke = quiet ? d?.restStroke : undefined

  const sourcePoint = getNodeIntersection(sourceNode, targetNode)
  const targetPoint = getNodeIntersection(targetNode, sourceNode)

  const [path, labelX, labelY] = getBezierPath({
    sourceX: sourcePoint.x,
    sourceY: sourcePoint.y,
    sourcePosition: getEdgePosition(sourceNode, sourcePoint),
    targetX: targetPoint.x,
    targetY: targetPoint.y,
    targetPosition: getEdgePosition(targetNode, targetPoint),
  })

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      style={{
        ...style,
        ...(restStroke ? { stroke: restStroke } : {}),
        opacity,
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
  )
}
