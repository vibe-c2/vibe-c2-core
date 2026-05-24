import { BookOpenIcon, KeyRoundIcon, type LucideIcon } from "lucide-react"

// subjectKindIcon picks an icon for an event dot based on the entity it
// concerns. Falls back to KeyRoundIcon so a new subject kind from the
// backend still renders something rather than an empty slot.
export function subjectKindIcon(subjectKind: string): LucideIcon {
  switch (subjectKind) {
    case "credential":
      return KeyRoundIcon
    case "wiki_document":
      return BookOpenIcon
    default:
      return KeyRoundIcon
  }
}

// subjectKindAccent maps a subject kind to a Tailwind colour class. The
// timeline reads more clearly when each entity type carries a consistent
// hue across dots and the details dialog.
export function subjectKindAccent(subjectKind: string): string {
  switch (subjectKind) {
    case "credential":
      return "text-amber-500"
    case "wiki_document":
      return "text-sky-500"
    default:
      return "text-muted-foreground"
  }
}
