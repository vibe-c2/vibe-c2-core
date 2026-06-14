import { MapIcon, XIcon } from "lucide-react"
import type { TopologyRelation } from "@/stores/hosts"
import { Button } from "@/components/ui/button"

// Bottom-right "what am I looking at" key for the topology canvas. The graph is
// built from exactly one relation at a time (routes / subnets / users), and each
// lens draws a different cast of node shapes and edge styles. This panel decodes
// them for the operator — node SHAPE (solid card vs dashed ghost vs pill) and
// edge STYLE (color + dash + arrow) both carry meaning, so the swatches render
// the real thing rather than a flat dot.
//
// Lens-aware: only the kinds that can appear in the active lens are listed, the
// same allowlist discipline the lenses themselves use (see topology-view).
//
// SOURCE OF TRUTH: the swatch styling below mirrors topology-nodes.tsx (node
// borders/fills) and layout.ts `edgeOf` (edge stroke/dash/arrow). If either of
// those changes its visual vocabulary, update the matching entry here.

// Edge stroke colors, copied verbatim from layout.ts so the key can't drift from
// the canvas. Kept as plain CSS-var strings (not Tailwind classes) because the
// swatch paints them onto an inline <svg>.
const STROKE = {
  primary: "var(--color-primary)",
  amber: "var(--color-amber-500, #f59e0b)",
  sky: "var(--color-sky-500, #0ea5e9)",
  border: "var(--color-border)",
  muted: "var(--color-muted-foreground)",
} as const

type NodeShape = "card" | "pill" | "list"

type Swatch =
  | { kind: "node"; shape: NodeShape; className: string }
  | {
      kind: "edge"
      stroke: string
      width: number
      dash?: string
      arrow?: boolean
    }

interface LegendEntry {
  label: string
  blurb: string
  swatch: Swatch
}

interface LegendGroup {
  title: string
  entries: LegendEntry[]
}

// One node swatch: a miniature of the real card/pill so shape reads at a glance.
function NodeSwatch({ shape, className }: { shape: NodeShape; className: string }) {
  if (shape === "list") {
    // A stacked-rows hint for the folded "N local subnets / accounts" nodes.
    return (
      <span
        className={`flex h-4 w-6 shrink-0 flex-col justify-center gap-[2px] px-[3px] ${className}`}
      >
        <span className="h-[2px] w-full rounded-full bg-current opacity-40" />
        <span className="h-[2px] w-2/3 rounded-full bg-current opacity-40" />
      </span>
    )
  }
  return (
    <span
      className={`h-4 w-6 shrink-0 ${shape === "pill" ? "rounded-full" : "rounded-[3px]"} ${className}`}
    />
  )
}

// One edge swatch: a short stroke matching the canvas, with an optional
// arrowhead for directed edges.
function EdgeSwatch({
  stroke,
  width,
  dash,
  arrow,
}: {
  stroke: string
  width: number
  dash?: string
  arrow?: boolean
}) {
  return (
    <svg width="24" height="12" viewBox="0 0 24 12" className="shrink-0">
      <line
        x1="1"
        y1="6"
        x2={arrow ? 17 : 23}
        y2="6"
        stroke={stroke}
        strokeWidth={width}
        strokeDasharray={dash}
        strokeLinecap="round"
      />
      {arrow && (
        <path d="M17 2 L23 6 L17 10 Z" fill={stroke} />
      )}
    </svg>
  )
}

// Shared node entries reused across lenses.
const HOST_ENTRY: LegendEntry = {
  label: "Host",
  blurb: "An enumerated machine.",
  swatch: { kind: "node", shape: "card", className: "border border-border bg-card" },
}

const LEGEND: Record<TopologyRelation, LegendGroup[]> = {
  routes: [
    {
      title: "Nodes",
      entries: [
        HOST_ENTRY,
        {
          label: "Unknown gateway",
          blurb: "A router a route points through that no known host owns — enumerate it.",
          swatch: {
            kind: "node",
            shape: "card",
            className: "border border-dashed border-amber-500/60 bg-amber-500/10",
          },
        },
        {
          label: "Unexplored subnet",
          blurb: "Reachable through a known pivot, but no hosts mapped there yet.",
          swatch: {
            kind: "node",
            shape: "card",
            className: "border border-dashed border-sky-500/60 bg-sky-500/10",
          },
        },
      ],
    },
    {
      title: "Edges",
      entries: [
        {
          label: "Pivot",
          blurb: "This host reaches a destination through another known host.",
          swatch: { kind: "edge", stroke: STROKE.primary, width: 2, arrow: true },
        },
        {
          label: "Default route",
          blurb: "Egress / gateway of last resort (dashed, no destination).",
          swatch: {
            kind: "edge",
            stroke: STROKE.primary,
            width: 2,
            dash: "5 3",
            arrow: true,
          },
        },
        {
          label: "Unknown gateway",
          blurb: "Routes through a gateway no known host owns.",
          swatch: {
            kind: "edge",
            stroke: STROKE.amber,
            width: 2,
            dash: "5 3",
            arrow: true,
          },
        },
        {
          label: "Reaches",
          blurb: "A known pivot can reach an unmapped subnet.",
          swatch: {
            kind: "edge",
            stroke: STROKE.sky,
            width: 1.5,
            dash: "3 3",
            arrow: true,
          },
        },
      ],
    },
  ],
  subnets: [
    {
      title: "Nodes",
      entries: [
        HOST_ENTRY,
        {
          label: "Subnet",
          blurb: "A network segment; every host on it links here.",
          swatch: {
            kind: "node",
            shape: "pill",
            className: "border-2 border-border bg-muted/40",
          },
        },
        {
          label: "Local subnets",
          blurb: "A host's single-member segments folded into one node.",
          swatch: {
            kind: "node",
            shape: "list",
            className:
              "rounded-[3px] border-2 border-border bg-muted/40 text-muted-foreground",
          },
        },
      ],
    },
    {
      title: "Edges",
      entries: [
        {
          label: "Interface",
          blurb: "Host sits on this segment (label = interface · IP).",
          swatch: { kind: "edge", stroke: STROKE.border, width: 1.5 },
        },
      ],
    },
  ],
  identities: [
    {
      title: "Nodes",
      entries: [
        HOST_ENTRY,
        {
          label: "Shared account",
          blurb: "A user seen across hosts — the credential-reuse signal.",
          swatch: {
            kind: "node",
            shape: "pill",
            className: "border-2 border-primary/60 bg-card",
          },
        },
        {
          label: "Well-known account",
          blurb: "Ubiquitous account (root, ubuntu…); links by default, weak signal.",
          swatch: {
            kind: "node",
            shape: "pill",
            className: "border-2 border-dashed border-border bg-muted",
          },
        },
        {
          label: "Unknown source",
          blurb: "A login origin owned by no known host.",
          swatch: {
            kind: "node",
            shape: "card",
            className:
              "border border-dashed border-muted-foreground/40 bg-muted text-muted-foreground",
          },
        },
        {
          label: "Local accounts",
          blurb: "A host's single-host accounts folded into one node.",
          swatch: {
            kind: "node",
            shape: "list",
            className:
              "rounded-[3px] border-2 border-border bg-muted/40 text-muted-foreground",
          },
        },
      ],
    },
    {
      title: "Edges",
      entries: [
        {
          label: "Logged in",
          blurb: "This account landed on the host.",
          swatch: { kind: "edge", stroke: STROKE.primary, width: 2, arrow: true },
        },
        {
          label: "From",
          blurb: "The login originated at this source.",
          swatch: { kind: "edge", stroke: STROKE.muted, width: 1.5, arrow: true },
        },
      ],
    },
  ],
}

function LegendRow({ label, blurb, swatch }: LegendEntry) {
  return (
    <li className="flex items-start gap-2">
      <span className="flex h-4 w-6 shrink-0 items-center justify-center">
        {swatch.kind === "node" ? (
          <NodeSwatch shape={swatch.shape} className={swatch.className} />
        ) : (
          <EdgeSwatch
            stroke={swatch.stroke}
            width={swatch.width}
            dash={swatch.dash}
            arrow={swatch.arrow}
          />
        )}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-[10px] text-muted-foreground">{blurb}</span>
      </span>
    </li>
  )
}

// Bottom-right legend. Collapsed by default to a small pill (operators learn the
// vocabulary once); open/closed is persisted in the host store so it survives
// reloads and lens switches.
export function TopologyLegend({
  relation,
  open,
  onOpenChange,
}: {
  relation: TopologyRelation
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!open) {
    return (
      <div className="absolute bottom-3 right-3 z-10">
        <Button
          variant="secondary"
          size="sm"
          className="h-7 gap-1.5 bg-card/90 text-xs shadow-sm backdrop-blur"
          onClick={() => onOpenChange(true)}
          title="Show the map key"
        >
          <MapIcon className="size-3.5" />
          Legend
        </Button>
      </div>
    )
  }

  const groups = LEGEND[relation]

  return (
    <div className="absolute bottom-3 right-3 z-10 max-h-[calc(100%-1.5rem)] w-64 overflow-y-auto rounded-md border bg-card/90 text-[11px] shadow-sm backdrop-blur">
      <div className="sticky top-0 flex items-center justify-between border-b bg-card/90 px-3 py-1.5 backdrop-blur">
        <span className="flex items-center gap-1.5 font-medium">
          <MapIcon className="size-3.5" />
          Legend
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-5"
          onClick={() => onOpenChange(false)}
          title="Hide the map key"
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
      <div className="flex flex-col gap-3 px-3 py-2.5">
        {groups.map((group) => (
          <div key={group.title} className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {group.title}
            </span>
            <ul className="flex flex-col gap-2">
              {group.entries.map((entry) => (
                <LegendRow key={entry.label} {...entry} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
