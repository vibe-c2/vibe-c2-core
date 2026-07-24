import { DownloadIcon, ImageIcon, Loader2Icon, ShapesIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { TopologyRelation } from "@/stores/hosts"
import { useTopologyExport } from "@/components/findings/topology/use-topology-export"

interface TopologyExportButtonProps {
  relation: TopologyRelation
  setVirtualize: (on: boolean) => void
}

// Top-right action next to the lens picker: export the current map (whatever
// lens is active) to a full-extent PNG or SVG. Rendered inside <ReactFlow> so
// the export hook can reach the flow instance via useReactFlow().
export function TopologyExportButton({
  relation,
  setVirtualize,
}: TopologyExportButtonProps) {
  const { exportImage, isExporting } = useTopologyExport({
    relation,
    setVirtualize,
  })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="secondary"
            size="sm"
            className="h-7 gap-1.5 border bg-card/90 text-xs shadow-sm backdrop-blur"
            disabled={isExporting}
            title="Export the current map to an image"
          >
            {isExporting ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <DownloadIcon className="size-3.5" />
            )}
            Export
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Export map as</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => exportImage("png")}>
          <ImageIcon className="size-4" />
          PNG image
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportImage("svg")}>
          <ShapesIcon className="size-4" />
          SVG vector
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
