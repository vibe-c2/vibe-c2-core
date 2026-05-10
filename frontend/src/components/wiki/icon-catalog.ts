import {
  ActivityIcon,
  AlertCircleIcon,
  AnchorIcon,
  AppleIcon,
  ArchiveIcon,
  AwardIcon,
  BarChart3Icon,
  BellIcon,
  BookmarkIcon,
  BookOpenIcon,
  BookTextIcon,
  BotIcon,
  BoxIcon,
  BriefcaseIcon,
  BugIcon,
  BuildingIcon,
  CalendarIcon,
  CameraIcon,
  CarIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  ClipboardListIcon,
  ClockIcon,
  CloudIcon,
  CodeIcon,
  CoffeeIcon,
  CogIcon,
  CompassIcon,
  CpuIcon,
  CreditCardIcon,
  DatabaseIcon,
  DiamondIcon,
  DollarSignIcon,
  DownloadIcon,
  DropletIcon,
  EyeIcon,
  FeatherIcon,
  FileCode2Icon,
  FileIcon,
  FileLockIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FilmIcon,
  FilterIcon,
  FlagIcon,
  FlameIcon,
  FlaskConicalIcon,
  FolderIcon,
  FolderOpenIcon,
  FootprintsIcon,
  GamepadIcon,
  GhostIcon,
  GiftIcon,
  GlobeIcon,
  GraduationCapIcon,
  HammerIcon,
  HandshakeIcon,
  HardDriveIcon,
  HeadphonesIcon,
  HeartIcon,
  HomeIcon,
  ImageIcon,
  InboxIcon,
  InfoIcon,
  KeyIcon,
  LampIcon,
  LayersIcon,
  LayoutDashboardIcon,
  LeafIcon,
  LibraryIcon,
  LightbulbIcon,
  LinkIcon,
  ListIcon,
  ListTodoIcon,
  LockIcon,
  MailIcon,
  MapIcon,
  MapPinIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  MicIcon,
  MoonIcon,
  MountainIcon,
  MusicIcon,
  NetworkIcon,
  NewspaperIcon,
  NotebookIcon,
  PaintbrushIcon,
  PaletteIcon,
  PaperclipIcon,
  PenLineIcon,
  PhoneIcon,
  PlaneIcon,
  PlayIcon,
  PrinterIcon,
  PuzzleIcon,
  QuoteIcon,
  RadioIcon,
  RocketIcon,
  RouteIcon,
  ScaleIcon,
  ScissorsIcon,
  SearchIcon,
  ServerIcon,
  ShieldIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ShipIcon,
  ShoppingCartIcon,
  SmileIcon,
  SnowflakeIcon,
  SparklesIcon,
  SproutIcon,
  StarIcon,
  StickyNoteIcon,
  SunIcon,
  SwordsIcon,
  TableIcon,
  TagIcon,
  TargetIcon,
  TerminalIcon,
  TrashIcon,
  TreePineIcon,
  TrophyIcon,
  TruckIcon,
  UmbrellaIcon,
  UserIcon,
  UsersIcon,
  VideoIcon,
  WalletIcon,
  WaypointsIcon,
  WrenchIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react"

export interface IconEntry {
  /** Stable key persisted in WikiDocument.icon. Never rename without a migration. */
  name: string
  keywords: readonly string[]
  component: LucideIcon
}

export interface IconGroup {
  label: string
  icons: readonly IconEntry[]
}

const entry = (
  name: string,
  component: LucideIcon,
  keywords: readonly string[] = [],
): IconEntry => ({ name, component, keywords })

export const ICON_CATALOG: readonly IconGroup[] = [
  {
    label: "Documents",
    icons: [
      entry("FileText", FileTextIcon, ["doc", "page", "text"]),
      entry("File", FileIcon, ["doc"]),
      entry("FileCode", FileCode2Icon, ["code", "snippet"]),
      entry("FileSpreadsheet", FileSpreadsheetIcon, ["sheet", "table", "excel"]),
      entry("FileLock", FileLockIcon, ["secret", "private"]),
      entry("Notebook", NotebookIcon, ["journal", "diary"]),
      entry("BookOpen", BookOpenIcon, ["read"]),
      entry("BookText", BookTextIcon, ["manual", "guide"]),
      entry("Library", LibraryIcon, ["books"]),
      entry("Newspaper", NewspaperIcon, ["news", "article"]),
      entry("Quote", QuoteIcon, ["citation"]),
      entry("StickyNote", StickyNoteIcon, ["memo"]),
      entry("PenLine", PenLineIcon, ["write", "draft"]),
      entry("ClipboardList", ClipboardListIcon, ["checklist", "tasks"]),
      entry("Feather", FeatherIcon, ["light", "write"]),
    ],
  },
  {
    label: "Folders & storage",
    icons: [
      entry("Folder", FolderIcon, ["dir"]),
      entry("FolderOpen", FolderOpenIcon, ["dir"]),
      entry("Archive", ArchiveIcon, ["box", "store"]),
      entry("Box", BoxIcon, ["package"]),
      entry("Inbox", InboxIcon, ["mail", "queue"]),
      entry("Database", DatabaseIcon, ["db", "store"]),
      entry("Server", ServerIcon, ["host"]),
      entry("HardDrive", HardDriveIcon, ["disk", "storage"]),
      entry("Layers", LayersIcon, ["stack"]),
    ],
  },
  {
    label: "People & teams",
    icons: [
      entry("User", UserIcon, ["person"]),
      entry("Users", UsersIcon, ["team", "group"]),
      entry("Briefcase", BriefcaseIcon, ["work", "job"]),
      entry("Building", BuildingIcon, ["office", "company"]),
      entry("Handshake", HandshakeIcon, ["deal", "agreement"]),
      entry("Bot", BotIcon, ["agent", "ai"]),
      entry("GraduationCap", GraduationCapIcon, ["learn", "school"]),
    ],
  },
  {
    label: "Status & priority",
    icons: [
      entry("CheckCircle", CheckCircle2Icon, ["done", "ok", "complete"]),
      entry("CircleCheck", CircleCheckIcon, ["done"]),
      entry("CircleAlert", CircleAlertIcon, ["warning"]),
      entry("AlertCircle", AlertCircleIcon, ["warning"]),
      entry("Info", InfoIcon, ["note"]),
      entry("CircleHelp", CircleHelpIcon, ["help", "question"]),
      entry("Star", StarIcon, ["favorite", "important"]),
      entry("Flag", FlagIcon, ["mark", "milestone"]),
      entry("Bookmark", BookmarkIcon, ["save"]),
      entry("Bell", BellIcon, ["notify", "alert"]),
      entry("Trophy", TrophyIcon, ["win", "achievement"]),
      entry("Award", AwardIcon, ["badge"]),
      entry("Target", TargetIcon, ["goal", "objective"]),
      entry("Clock", ClockIcon, ["time", "deadline"]),
      entry("Calendar", CalendarIcon, ["date", "schedule"]),
    ],
  },
  {
    label: "Communication",
    icons: [
      entry("Mail", MailIcon, ["email"]),
      entry("MessageSquare", MessageSquareIcon, ["chat", "message"]),
      entry("Megaphone", MegaphoneIcon, ["announce", "broadcast"]),
      entry("Phone", PhoneIcon, ["call"]),
      entry("Mic", MicIcon, ["audio", "voice"]),
      entry("Radio", RadioIcon, ["broadcast"]),
      entry("Video", VideoIcon, ["meeting", "call"]),
      entry("Headphones", HeadphonesIcon, ["audio", "music"]),
    ],
  },
  {
    label: "Tools & code",
    icons: [
      entry("Code", CodeIcon, ["dev", "snippet"]),
      entry("Terminal", TerminalIcon, ["shell", "cli"]),
      entry("Wrench", WrenchIcon, ["fix", "config"]),
      entry("Hammer", HammerIcon, ["build"]),
      entry("Cog", CogIcon, ["settings", "config"]),
      entry("Network", NetworkIcon, ["graph"]),
      entry("Cpu", CpuIcon, ["chip"]),
      entry("Bug", BugIcon, ["issue", "defect"]),
      entry("FlaskConical", FlaskConicalIcon, ["experiment", "lab"]),
      entry("Puzzle", PuzzleIcon, ["plugin", "extension"]),
      entry("Waypoints", WaypointsIcon, ["graph", "path"]),
      entry("Route", RouteIcon, ["path", "journey"]),
    ],
  },
  {
    label: "Objects & symbols",
    icons: [
      entry("Lightbulb", LightbulbIcon, ["idea"]),
      entry("Rocket", RocketIcon, ["launch", "ship"]),
      entry("Zap", ZapIcon, ["fast", "lightning"]),
      entry("Flame", FlameIcon, ["hot", "trend"]),
      entry("Sparkles", SparklesIcon, ["new", "magic"]),
      entry("Key", KeyIcon, ["secret", "auth"]),
      entry("Lock", LockIcon, ["secure", "private"]),
      entry("Shield", ShieldIcon, ["security"]),
      entry("ShieldAlert", ShieldAlertIcon, ["risk"]),
      entry("ShieldCheck", ShieldCheckIcon, ["safe", "verified"]),
      entry("Tag", TagIcon, ["label"]),
      entry("Diamond", DiamondIcon, ["premium", "value"]),
      entry("Gift", GiftIcon, ["bonus", "reward"]),
      entry("Anchor", AnchorIcon, ["fixed", "stable"]),
      entry("Footprints", FootprintsIcon, ["track", "trail"]),
      entry("Ghost", GhostIcon, ["hidden"]),
      entry("Smile", SmileIcon, ["happy"]),
      entry("Heart", HeartIcon, ["love", "favorite"]),
      entry("Eye", EyeIcon, ["watch", "view"]),
      entry("Compass", CompassIcon, ["direction", "navigate"]),
      entry("Map", MapIcon, ["geography"]),
      entry("MapPin", MapPinIcon, ["location"]),
      entry("Globe", GlobeIcon, ["world", "internet"]),
    ],
  },
  {
    label: "Business & data",
    icons: [
      entry("BarChart", BarChart3Icon, ["stats", "metrics"]),
      entry("Activity", ActivityIcon, ["pulse", "monitor"]),
      entry("DollarSign", DollarSignIcon, ["money", "price"]),
      entry("CreditCard", CreditCardIcon, ["payment"]),
      entry("Wallet", WalletIcon, ["money", "balance"]),
      entry("ShoppingCart", ShoppingCartIcon, ["order"]),
      entry("Truck", TruckIcon, ["delivery", "ship"]),
      entry("Scale", ScaleIcon, ["balance", "legal"]),
      entry("LayoutDashboard", LayoutDashboardIcon, ["panel"]),
      entry("Filter", FilterIcon, ["sort"]),
      entry("Search", SearchIcon, ["find"]),
      entry("List", ListIcon, ["items"]),
      entry("ListTodo", ListTodoIcon, ["tasks", "todo"]),
      entry("Table", TableIcon, ["grid"]),
      entry("Link", LinkIcon, ["url", "ref"]),
      entry("Paperclip", PaperclipIcon, ["attach"]),
      entry("Image", ImageIcon, ["photo", "picture"]),
      entry("Film", FilmIcon, ["movie", "video"]),
    ],
  },
  {
    label: "Nature & weather",
    icons: [
      entry("Sun", SunIcon, ["light", "day"]),
      entry("Moon", MoonIcon, ["dark", "night"]),
      entry("Cloud", CloudIcon, ["weather"]),
      entry("Snowflake", SnowflakeIcon, ["cold", "winter"]),
      entry("Umbrella", UmbrellaIcon, ["rain", "protection"]),
      entry("Droplet", DropletIcon, ["water"]),
      entry("Leaf", LeafIcon, ["plant", "green"]),
      entry("Sprout", SproutIcon, ["grow", "new"]),
      entry("TreePine", TreePineIcon, ["forest"]),
      entry("Mountain", MountainIcon, ["peak"]),
    ],
  },
  {
    label: "Lifestyle",
    icons: [
      entry("Coffee", CoffeeIcon, ["drink", "break"]),
      entry("Apple", AppleIcon, ["food", "fruit"]),
      entry("Music", MusicIcon, ["song", "audio"]),
      entry("Gamepad", GamepadIcon, ["game", "play"]),
      entry("Play", PlayIcon, ["media", "start"]),
      entry("Camera", CameraIcon, ["photo"]),
      entry("Lamp", LampIcon, ["light"]),
      entry("Home", HomeIcon, ["house"]),
      entry("Car", CarIcon, ["vehicle", "drive"]),
      entry("Plane", PlaneIcon, ["travel", "fly"]),
      entry("Ship", ShipIcon, ["boat", "travel"]),
      entry("Trash", TrashIcon, ["delete"]),
      entry("Scissors", ScissorsIcon, ["cut"]),
      entry("Printer", PrinterIcon, ["print"]),
      entry("Palette", PaletteIcon, ["design", "color"]),
      entry("Paintbrush", PaintbrushIcon, ["design"]),
      entry("Download", DownloadIcon, ["save"]),
      entry("Swords", SwordsIcon, ["fight", "operation"]),
    ],
  },
]

/** Flat lookup of canonical icon name → component. Stable keys; never rename without a migration. */
export const ICON_LOOKUP: Readonly<Record<string, LucideIcon>> = (() => {
  const map: Record<string, LucideIcon> = {}
  for (const group of ICON_CATALOG) {
    for (const e of group.icons) {
      map[e.name] = e.component
    }
  }
  return map
})()

// --- Lazy registry for the full lucide set ---------------------------------
//
// `lucide-react/dynamicIconImports` is a 1940-entry record of
// `{ "kebab-name": () => import(...) }` thunks. Importing it ships only the
// thunks themselves (~20 KB gzipped) — actual icon code is a separate chunk
// per icon, fetched on first render via React.lazy.
//
// Storage convention: WikiDocument.icon stores the PascalCase name (e.g.
// "AArrowDown"). The map below exposes the kebab key for each PascalCase
// name so we can look up the right thunk.

import { lazy, type ComponentType, type CSSProperties } from "react"

/** Renderable icon — either a sync lucide component (curated) or a React.lazy wrapper (uncurated). Both accept the standard lucide props. */
export type IconComponent = ComponentType<{
  size?: number | string
  className?: string
  style?: CSSProperties
}>

// lucide-react@1.6.0 ships a broken `dynamicIconImports.js` that references
// `.ts` source files. The compiled icon modules are still at
// `./icons/<kebab>.js`, so we enumerate them via Vite's import.meta.glob and
// build our own working dynamic-import map. Each glob match becomes its own
// chunk, fetched only when the icon first renders.
const ICON_GLOB = import.meta.glob<{ default: IconComponent }>(
  "/node_modules/lucide-react/dist/esm/icons/*.js",
)

function kebabToPascal(s: string): string {
  return s
    .split("-")
    .map((p) => (p.length === 0 ? "" : p[0].toUpperCase() + p.slice(1)))
    .join("")
}

function pathToKebab(path: string): string {
  // /node_modules/lucide-react/dist/esm/icons/a-arrow-down.js → a-arrow-down
  const base = path.slice(path.lastIndexOf("/") + 1)
  return base.replace(/\.js$/, "")
}

/** Maps every available lucide icon's PascalCase name to its glob-resolved import path. */
export const ALL_LUCIDE_NAMES: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>()
  for (const path of Object.keys(ICON_GLOB)) {
    map.set(kebabToPascal(pathToKebab(path)), path)
  }
  return map
})()

const lazyCache = new Map<string, IconComponent>()

function loadLazyIcon(name: string): IconComponent | null {
  const cached = lazyCache.get(name)
  if (cached) return cached
  const path = ALL_LUCIDE_NAMES.get(name)
  if (!path) return null
  const importFn = ICON_GLOB[path]
  if (!importFn) return null
  // React.lazy returns LazyExoticComponent which is renderable as JSX
  // identically to a regular component once a Suspense boundary is in place.
  const Lazy = lazy(importFn) as unknown as IconComponent
  lazyCache.set(name, Lazy)
  return Lazy
}

/**
 * Resolves a stored icon name to a renderable component:
 * - Curated catalog hit: returns the directly-imported lucide icon (sync render).
 * - Uncurated lucide hit: returns a memoized React.lazy component (requires
 *   a Suspense boundary in the caller — DocumentIcon provides one).
 * - Unknown name (typo, removed icon, etc.): returns null so the caller falls
 *   back to emoji or the default page glyph.
 */
export function resolveIcon(
  name: string | null | undefined,
): IconComponent | null {
  if (!name) return null
  return ICON_LOOKUP[name] ?? loadLazyIcon(name)
}
