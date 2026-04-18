import { BookmarkIcon, ClockIcon, ShieldAlertIcon } from "lucide-react"
import type { ComponentType, SVGProps } from "react"

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

interface BackupLike {
  trigger: "AUTO" | "MANUAL"
  description: string
}

interface BackupVisual {
  Icon: IconComponent
  iconClass: string
  label: string
}

// Classify a backup for display. Safety snapshots are AUTO backups whose
// description marks them as pre-operation (created by the resolver's
// createSafetyBackup helper) — we surface them with a distinct amber
// shield so users can tell them apart from periodic auto-backups.
export function getBackupVisual(backup: BackupLike): BackupVisual {
  if (backup.trigger === "MANUAL") {
    return {
      Icon: BookmarkIcon,
      iconClass: "text-foreground",
      label: "Manual",
    }
  }

  if (isSafetySnapshot(backup.description)) {
    return {
      Icon: ShieldAlertIcon,
      iconClass: "text-amber-600 dark:text-amber-500",
      label: "Safety snapshot",
    }
  }

  return {
    Icon: ClockIcon,
    iconClass: "text-muted-foreground",
    label: "Auto",
  }
}

function isSafetySnapshot(description: string): boolean {
  return description.startsWith("Pre-")
}
