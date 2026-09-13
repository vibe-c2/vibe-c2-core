// Pure simulation behind the login background: a sparse beacon graph of
// hub ("C2") nodes and implant nodes that drift slowly, with packets pulsing
// along edges. No DOM here so it can be unit-tested; the canvas component
// only draws what this module computes.

export interface SceneNode {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  isHub: boolean
}

export interface SceneEdge {
  from: number // implant index
  to: number // hub index, or another implant for a peer link
}

export interface Pulse {
  edge: number
  // 0..1 along the edge; direction true = implant → hub (check-in).
  progress: number
  towardHub: boolean
}

export interface Scene {
  width: number
  height: number
  nodes: SceneNode[]
  edges: SceneEdge[]
  pulses: Pulse[]
  // Milliseconds until the next pulse spawns.
  nextPulseIn: number
}

const NODE_AREA_PX = 42_000 // one implant per this many px²
const MIN_IMPLANTS = 14
const MAX_IMPLANTS = 48
const HUBS_PER_IMPLANTS = 7
const DRIFT_PX_PER_SEC = 6
const PULSE_INTERVAL_MS = 550
const PULSE_SPEED_PER_SEC = 0.8 // fraction of an edge per second
const EDGES_PER_IMPLANT = 1
// Implants within this distance of each other also link up, so the picture
// reads as clustered meshes rather than isolated starbursts.
const PEER_LINK_RADIUS_PX = 170

export type Random = () => number

export function createScene(width: number, height: number, random: Random = Math.random): Scene {
  const implantCount = clamp(Math.round((width * height) / NODE_AREA_PX), MIN_IMPLANTS, MAX_IMPLANTS)
  const hubCount = Math.max(2, Math.round(implantCount / HUBS_PER_IMPLANTS))

  const nodes: SceneNode[] = []
  for (let i = 0; i < hubCount; i++) nodes.push(spawnNode(width, height, true, random))
  for (let i = 0; i < implantCount; i++) nodes.push(spawnNode(width, height, false, random))

  return {
    width,
    height,
    nodes,
    edges: linkImplantsToNearestHubs(nodes),
    pulses: [],
    nextPulseIn: PULSE_INTERVAL_MS * random(),
  }
}

// Advances the scene by dt milliseconds and returns a new scene. Nodes are
// replaced, never mutated, so a frame can be compared against the previous.
export function stepScene(scene: Scene, dtMs: number, random: Random = Math.random): Scene {
  const dt = Math.min(dtMs, 100) / 1000 // clamp so a background tab does not teleport nodes
  const nodes = scene.nodes.map((n) => driftNode(n, dt, scene.width, scene.height))

  let pulses = scene.pulses
    .map((p) => ({ ...p, progress: p.progress + dt * PULSE_SPEED_PER_SEC }))
    .filter((p) => p.progress <= 1)

  let nextPulseIn = scene.nextPulseIn - dtMs
  if (nextPulseIn <= 0 && scene.edges.length > 0) {
    pulses = [
      ...pulses,
      {
        edge: Math.floor(random() * scene.edges.length),
        progress: 0,
        towardHub: random() < 0.7,
      },
    ]
    nextPulseIn = PULSE_INTERVAL_MS * (0.6 + random() * 0.8)
  }

  return { ...scene, nodes, pulses, nextPulseIn }
}

// Rebuilds the graph for a new viewport while keeping relative positions.
export function resizeScene(scene: Scene, width: number, height: number): Scene {
  if (scene.width === width && scene.height === height) return scene
  const sx = width / scene.width
  const sy = height / scene.height
  const nodes = scene.nodes.map((n) => ({ ...n, x: n.x * sx, y: n.y * sy }))
  return { ...scene, width, height, nodes, edges: linkImplantsToNearestHubs(nodes) }
}

function spawnNode(width: number, height: number, isHub: boolean, random: Random): SceneNode {
  const angle = random() * Math.PI * 2
  return {
    x: random() * width,
    y: random() * height,
    vx: Math.cos(angle) * DRIFT_PX_PER_SEC,
    vy: Math.sin(angle) * DRIFT_PX_PER_SEC,
    radius: isHub ? 3.5 : 1.2 + random() * 1.3,
    isHub,
  }
}

function driftNode(n: SceneNode, dt: number, width: number, height: number): SceneNode {
  let x = n.x + n.vx * dt
  let y = n.y + n.vy * dt
  let vx = n.vx
  let vy = n.vy
  if (x < 0 || x > width) {
    vx = -vx
    x = clamp(x, 0, width)
  }
  if (y < 0 || y > height) {
    vy = -vy
    y = clamp(y, 0, height)
  }
  return { ...n, x, y, vx, vy }
}

// Every implant links to its nearest hub(s), plus its nearest implant when
// that one is close by. Edges are recomputed only on resize; drift is slow
// enough that a stale nearest-neighbour choice is invisible.
function linkImplantsToNearestHubs(nodes: SceneNode[]): SceneEdge[] {
  const hubs = nodes.map((n, i) => (n.isHub ? i : -1)).filter((i) => i >= 0)
  const implants = nodes.map((n, i) => (n.isHub ? -1 : i)).filter((i) => i >= 0)
  const edges: SceneEdge[] = []
  const seen = new Set<string>()

  for (const i of implants) {
    const n = nodes[i]
    const nearestHubs = [...hubs].sort((a, b) => distanceSq(n, nodes[a]) - distanceSq(n, nodes[b]))
    for (const to of nearestHubs.slice(0, EDGES_PER_IMPLANT)) edges.push({ from: i, to })

    const peer = implants
      .filter((j) => j !== i)
      .sort((a, b) => distanceSq(n, nodes[a]) - distanceSq(n, nodes[b]))[0]
    if (peer === undefined || distanceSq(n, nodes[peer]) > PEER_LINK_RADIUS_PX ** 2) continue
    const key = i < peer ? `${i}:${peer}` : `${peer}:${i}`
    if (seen.has(key)) continue
    seen.add(key)
    edges.push({ from: i, to: peer })
  }
  return edges
}

function distanceSq(a: SceneNode, b: SceneNode): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
