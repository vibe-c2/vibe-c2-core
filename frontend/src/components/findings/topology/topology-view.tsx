import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
  Loader2Icon,
  NetworkIcon,
  RouteIcon,
  TriangleAlertIcon,
  UsersIcon,
} from "lucide-react"
import { MAX_TOPOLOGY_HOSTS, useAllHosts } from "@/graphql/hooks/hosts"
import { useMe, useSetHiddenIdentities } from "@/graphql/hooks/users"
import { useHostStore, type TopologyRelation } from "@/stores/hosts"
import {
  deriveTopology,
  withoutHiddenIdentities,
  WELL_KNOWN_ACCOUNTS,
  type Topology,
  type TopologyStats,
} from "@/lib/topology/derive"
import {
  collapseLeafSubnets,
  collapseLocalIdentities,
  collapsePhantomHosts,
} from "@/lib/topology/aggregate"
import {
  NodeContextMenu,
  type NodeMenuState,
} from "@/components/findings/topology/node-context-menu"
import { HiddenIdentitiesPanel } from "@/components/findings/topology/hidden-identities-panel"
import { TopologyLegend } from "@/components/findings/topology/topology-legend"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  FloatingEdge,
  TopologyEdgeDefs,
} from "@/components/findings/topology/floating-edge"
import type { SimNode } from "@/components/findings/topology/layout"
import { useTopologySimulation } from "@/components/findings/topology/use-simulation"
import { useTopologyEmphasis } from "@/components/findings/topology/use-emphasis"
import { TopologySearch } from "@/components/findings/topology/topology-search"
import {
  HostNode,
  IdentityNode,
  LeafSubnetsNode,
  LocalIdentitiesNode,
  LoneSourcesNode,
  PhantomGatewayNode,
  PhantomHostNode,
  PhantomSubnetNode,
  SubnetNode,
  type HostNodeData,
} from "@/components/findings/topology/topology-nodes"

// Defined here (not in topology-nodes.tsx) so that file can stay a pure
// component module — exporting this const alongside components trips the
// fast-refresh lint rule. Stable identity outside the component so React Flow
// doesn't see a new object each render.
const nodeTypes = {
  host: HostNode,
  subnet: SubnetNode,
  phantomGateway: PhantomGatewayNode,
  phantomSubnet: PhantomSubnetNode,
  leafSubnets: LeafSubnetsNode,
  loneSources: LoneSourcesNode,
  localIdentities: LocalIdentitiesNode,
  identity: IdentityNode,
  phantomHost: PhantomHostNode,
}

const edgeTypes = {
  floating: FloatingEdge,
}

interface TopologyViewProps {
  operationId: string
}

// The Hosts tab's second view: a network map derived entirely from the
// operation's host data (no manual editing). Fetches ALL hosts (not the
// paginated list), derives the graph, lays it out, and renders it read-only.
//
// The graph is built from exactly ONE relation type at a time. Routes and
// subnet membership are different semantics (L3 "routes through" vs L2 "sits
// on segment"); overlaying both turned real operations into a hairball. Both
// lenses are pure view filters — the underlying derivation is untouched.

const lenses: Record<TopologyRelation, (t: Topology) => Topology> = {
  // Host cards + route-derived elements (pivots, unknown gateways, unexplored
  // subnets). An allowlist, not a denylist: every other relation's nodes/edges
  // (subnet hubs, identities, login edges) are excluded, so a new node kind
  // can't silently leak into this lens the way identities once did.
  routes: (t) => ({
    ...t,
    nodes: t.nodes.filter(
      (n) =>
        n.kind === "host" ||
        n.kind === "phantom-gateway" ||
        n.kind === "phantom-subnet",
    ),
    edges: t.edges.filter(
      (e) =>
        e.kind === "pivot" ||
        e.kind === "pivot-unknown" ||
        e.kind === "reaches",
    ),
  }),
  // Host cards + subnet hubs + interface edges. Route-derived elements are
  // stripped — phantom gateways/subnets only exist because of routes, so
  // keeping them would smuggle the second relation back in. Single-host
  // subnets then fold into one list node per host (the VPN-concentrator
  // case: ten tun networks orbiting one card said nothing).
  subnets: (t) =>
    collapseLeafSubnets({
      ...t,
      nodes: t.nodes.filter((n) => n.kind === "host" || n.kind === "subnet"),
      edges: t.edges.filter((e) => e.kind === "membership"),
    }),
  // Host cards + identity pills + unknown-source hosts, joined by the two login
  // edges (logged into / logged in from). Hosts never connect directly here —
  // only through an identity — so this lens reads as "who touched what, and
  // from where". Network-derived elements are all stripped.
  identities: (t) => ({
    ...t,
    nodes: t.nodes.filter(
      (n) =>
        n.kind === "host" || n.kind === "identity" || n.kind === "phantom-host",
    ),
    edges: t.edges.filter(
      (e) => e.kind === "logged-into" || e.kind === "logged-from",
    ),
  }),
}

export function TopologyView({ operationId }: TopologyViewProps) {
  const { data, isLoading, isError } = useAllHosts(operationId)
  // Persisted in the host store so the choice survives reloads.
  const relation = useHostStore((s) => s.topologyRelation)
  const setRelation = useHostStore((s) => s.setTopologyRelation)
  // Layer 1 (built-in well-known group): a localStorage toggle in the store.
  const hideWellKnown = useHostStore((s) => s.hideWellKnownIdentities)
  const setHideWellKnown = useHostStore((s) => s.setHideWellKnownIdentities)
  const legendOpen = useHostStore((s) => s.topologyLegendOpen)
  const setLegendOpen = useHostStore((s) => s.setTopologyLegendOpen)
  const openEditDialog = useHostStore((s) => s.openEditDialog)

  // Layer 2 (per-operator custom list): server state, normalized server-side.
  const { data: meData } = useMe()
  const setHiddenIdentities = useSetHiddenIdentities()
  const customHidden = useMemo(
    () => meData?.me.hiddenIdentities ?? [],
    [meData?.me.hiddenIdentities],
  )

  // Both layers feed one set of usernames to hide (already lowercased: the
  // built-in set is lowercase and the custom list is normalized on the server).
  const hiddenUsers = useMemo(() => {
    const set = new Set<string>(customHidden)
    if (hideWellKnown) for (const a of WELL_KNOWN_ACCOUNTS) set.add(a)
    return set
  }, [customHidden, hideWellKnown])

  // Right-click "Hide" / panel "unhide" both rewrite the whole list (the
  // mutation replaces it). Compute the next array from the current one.
  const hideIdentity = useCallback(
    (user: string) => {
      const name = user.trim().toLowerCase()
      if (!name || customHidden.includes(name)) return
      setHiddenIdentities.mutate([...customHidden, name])
    },
    [customHidden, setHiddenIdentities],
  )
  const unhideIdentity = useCallback(
    (user: string) => {
      const name = user.trim().toLowerCase()
      setHiddenIdentities.mutate(customHidden.filter((n) => n !== name))
    },
    [customHidden, setHiddenIdentities],
  )

  // One shared right-click menu for all host cards and identity pills (see
  // node-context-menu). Host "Edit" opens the same dialog as a table row, so
  // topology and table share one editing path.
  const [nodeMenu, setNodeMenu] = useState<NodeMenuState | null>(null)
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (node.type !== "identity" && node.type !== "host") return
      event.preventDefault()
      const at = { x: event.clientX, y: event.clientY }
      setNodeMenu(
        node.type === "host"
          ? { ...at, kind: "host", host: (node.data as HostNodeData).host }
          : { ...at, kind: "identity", user: (node.data as { user: string }).user },
      )
    },
    [],
  )

  const topology = useMemo(
    () => deriveTopology(data?.hosts ?? []),
    [data?.hosts],
  )
  const targetTopology = useMemo(() => {
    const lensed = lenses[relation](topology)
    if (relation !== "identities") return lensed
    // Hide accounts first (it can strip a ghost source's only other edge), THEN
    // collapse: lone unknown sources into one pill per identity, and each host's
    // single-host accounts into one "local accounts" pill — the leaf-merge that
    // unwinds the hairball, leaving only the shared accounts wiring hosts.
    const filtered = withoutHiddenIdentities(lensed, hiddenUsers)
    return collapseLocalIdentities(collapsePhantomHosts(filtered))
  }, [topology, relation, hiddenUsers])

  // Rebuilding the layout (pre-settle ticks + crossing reduction in
  // layoutTopology) is a synchronous main-thread chunk — noticeable on the
  // dense users lens. Deferring the topology splits any rebuild into two
  // renders: an urgent one that keeps the old graph up (lens button + the
  // overlay below paint immediately), then the heavy one at deferred
  // priority. One mechanism for every rebuild source: lens switch, hiding
  // identities, data refresh.
  const visibleTopology = useDeferredValue(targetTopology)
  const isRebuilding = visibleTopology !== targetTopology

  // Live force-directed layout: pre-settled for first paint, re-heated while
  // a node is dragged so neighbors follow. Positions are session-only: any
  // data change rebuilds the simulation and resets them.
  const {
    nodes,
    edges,
    simNodeById,
    onNodesChange,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
  } = useTopologySimulation(visibleTopology)

  // Click-to-focus + search emphasis: dims/rings layered over the simulation
  // output. See use-emphasis.ts for the interaction rules.
  const {
    displayNodes,
    displayEdges,
    toggleFocus,
    toggleEdgeFocus,
    focusFromSearch,
    handleEscape,
    clearEmphasis,
    search,
    focusedId,
  } = useTopologyEmphasis(visibleTopology, nodes, edges)

  // Click = focus (toggle on re-click). Editing lives in the right-click menu.
  const onNodeClick = useCallback(
    (_e: React.MouseEvent, node: Node) => toggleFocus(node.id),
    [toggleFocus],
  )
  // Edges focus too: on the users lens a login edge lights the whole travel
  // path it belongs to (source host → user → destination hosts).
  const onEdgeClick = useCallback(
    (_e: React.MouseEvent, edge: Edge) => toggleEdgeFocus(edge.id),
    [toggleEdgeFocus],
  )

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-lg border bg-card p-4">
        <Skeleton className="h-full w-full" />
      </div>
    )
  }

  if (isError) {
    return (
      <Centered>
        <TriangleAlertIcon className="size-8 text-destructive opacity-70" />
        <p className="text-sm">Couldn’t load the topology. Try again.</p>
      </Centered>
    )
  }

  if (topology.stats.hosts === 0) {
    return (
      <Centered>
        <NetworkIcon className="size-8 opacity-50" />
        <p className="text-sm">
          No hosts yet — add hosts in the table to build the network map.
        </p>
      </Centered>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
      {data?.truncated && (
        <div className="flex items-center gap-2 border-b bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlertIcon className="size-3.5 shrink-0" />
          Showing the first {MAX_TOPOLOGY_HOSTS} hosts — the map may be
          incomplete.
        </div>
      )}
      {isRebuilding && (
        <div className="absolute inset-x-0 top-12 z-20 flex justify-center">
          <div className="flex items-center gap-2 rounded-md border bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
            {/* CSS spin runs on the compositor, so it keeps turning while the
                layout rebuild blocks the JS thread. */}
            <Loader2Icon className="size-3.5 animate-spin" />
            Building map…
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <ReactFlowProvider>
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            onNodesChange={onNodesChange}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onNodeContextMenu={onNodeContextMenu}
            onPaneClick={clearEmphasis}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            minZoom={0.1}
            proOptions={{ hideAttribution: true }}
            nodesConnectable={false}
            edgesFocusable={false}
            // Virtualize: only mount nodes/edges intersecting the viewport.
            // The users lens can carry hundreds of identity edges; rendering the
            // off-screen ones (and, before, animating them) was dead weight.
            onlyRenderVisibleElements
            // An accidental double-click while focusing/dragging shouldn't
            // lurch the viewport.
            zoomOnDoubleClick={false}
            // Clicking now selects nodes routinely (click = focus), and React
            // Flow's default Backspace would visually delete the selection
            // from this read-only derived view.
            deleteKeyCode={null}
          >
            <TopologyEdgeDefs />
            <Background gap={16} className="!bg-muted/20" />
            <Controls showInteractive={false} />
            <Legend stats={topology.stats} relation={relation} />
            <TopologyLegend
              relation={relation}
              open={legendOpen}
              onOpenChange={setLegendOpen}
            />
            <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-2">
              <RelationPicker relation={relation} onChange={setRelation} />
              {relation === "identities" && (
                <HiddenIdentitiesPanel
                  hideWellKnown={hideWellKnown}
                  onToggleWellKnown={setHideWellKnown}
                  customHidden={customHidden}
                  onUnhide={unhideIdentity}
                />
              )}
            </div>
            {/* focusFromSearch (not toggleFocus): remembers the search so Esc
                can step back into it. onEscape shares the window-level Esc
                authority so the outcome doesn't depend on where focus is. */}
            <TopologySearch
              {...search}
              onSelect={focusFromSearch}
              onEscape={handleEscape}
            />
            <FollowFocusedNode
              focusedId={focusedId}
              simNodeById={simNodeById}
            />
          </ReactFlow>
        </ReactFlowProvider>
        {nodeMenu && (
          <NodeContextMenu
            menu={nodeMenu}
            onHide={hideIdentity}
            onEdit={openEditDialog}
            onClose={() => setNodeMenu(null)}
          />
        )}
      </div>
    </div>
  )
}

// Focus survives a lens switch and a data refresh (it's just a node id), but
// the layout rebuilds and the node lands somewhere new — possibly off-screen.
// Whenever the graph is rebuilt (simNodeById gets a new identity) while a node
// is focused, glide the viewport to its freshly settled position. The focused
// id is read through a ref on purpose: clicking a node that's already on
// screen must NOT recenter, only rebuilds do.
function FollowFocusedNode({
  focusedId,
  simNodeById,
}: {
  focusedId: string | null
  simNodeById: Map<string, SimNode>
}) {
  const { setCenter, getZoom } = useReactFlow()
  const focusedRef = useRef(focusedId)
  // Declared before the recenter effect so it runs first when both fire in
  // one commit (effects run in declaration order).
  useEffect(() => {
    focusedRef.current = focusedId
  }, [focusedId])

  useEffect(() => {
    const id = focusedRef.current
    if (!id) return
    // Focused node absent from this lens (e.g. an identity on the routes
    // lens): emphasis already treats it as no focus — don't recenter either.
    const sim = simNodeById.get(id)
    if (!sim || sim.x === undefined || sim.y === undefined) return
    // sim x/y are node centers, which is exactly what setCenter wants. Keep
    // the operator's zoom — without it setCenter snaps to maxZoom.
    setCenter(sim.x, sim.y, { zoom: getZoom(), duration: 500 })
  }, [simNodeById, setCenter, getZoom])

  return null
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-lg border bg-card text-muted-foreground">
      {children}
    </div>
  )
}

// One entry per relation the picker offers; the lens table above must have a
// matching key (TypeScript enforces both via TopologyRelation).
const relationOptions: {
  value: TopologyRelation
  label: string
  Icon: typeof RouteIcon
  title: string
}[] = [
  {
    value: "routes",
    label: "Routes",
    Icon: RouteIcon,
    title: "Build the map from routes — who pivots through whom",
  },
  {
    value: "subnets",
    label: "Subnets",
    Icon: NetworkIcon,
    title: "Build the map from subnet membership — who shares a segment",
  },
  {
    value: "identities",
    label: "Users",
    Icon: UsersIcon,
    title: "Build the map from user footprints — who logged in where, from where",
  },
]

// Top-right selector for the relation the graph is built from. Mutually
// exclusive by design — see the lens comments above.
function RelationPicker({
  relation,
  onChange,
}: {
  relation: TopologyRelation
  onChange: (relation: TopologyRelation) => void
}) {
  return (
    <div className="flex overflow-hidden rounded-md border bg-card/90 shadow-sm backdrop-blur">
      {relationOptions.map(({ value, label, Icon, title }) => (
        <Button
          key={value}
          variant={relation === value ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1.5 rounded-none text-xs"
          onClick={() => onChange(value)}
          aria-pressed={relation === value}
          title={title}
        >
          <Icon className="size-3.5" />
          {label}
        </Button>
      ))}
    </div>
  )
}

// Compact key + counts, top-left over the canvas. Counts double as a summary
// of what the operator has (and hasn't) mapped. Only rows that exist in the
// current lens are shown — pivot/phantom counts are meaningless on the
// subnets lens and vice versa.
function Legend({
  stats,
  relation,
}: {
  stats: TopologyStats
  relation: TopologyRelation
}) {
  return (
    <div className="absolute left-3 top-3 z-10 flex flex-col gap-1 rounded-md border bg-card/90 px-3 py-2 text-[11px] shadow-sm backdrop-blur">
      {relation === "subnets" ? (
        <span className="font-medium">
          {stats.hosts} hosts · {stats.subnets} subnets
        </span>
      ) : relation === "identities" ? (
        <>
          <span className="font-medium">
            {stats.hosts} hosts · {stats.identities} identit
            {stats.identities === 1 ? "y" : "ies"}
          </span>
          <LegendRow color="bg-primary" label="logged into" />
          <LegendRow color="bg-muted-foreground/50" label="logged in from" />
          {stats.phantomHosts > 0 && (
            <LegendRow
              color="bg-muted-foreground/50"
              label={`${stats.phantomHosts} unknown source${stats.phantomHosts === 1 ? "" : "s"}`}
            />
          )}
        </>
      ) : (
        <>
          <span className="font-medium">{stats.hosts} hosts</span>
          <LegendRow color="bg-primary" label={`${stats.pivots} pivots`} />
          {stats.phantomGateways > 0 && (
            <LegendRow
              color="bg-amber-500"
              label={`${stats.phantomGateways} unknown gateway${stats.phantomGateways === 1 ? "" : "s"}`}
            />
          )}
          {stats.phantomSubnets > 0 && (
            <LegendRow
              color="bg-sky-500"
              label={`${stats.phantomSubnets} unexplored subnet${stats.phantomSubnets === 1 ? "" : "s"}`}
            />
          )}
        </>
      )}
    </div>
  )
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span className={`size-2 rounded-full ${color}`} />
      {label}
    </span>
  )
}
