import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import { BanIcon, FolderOpenIcon, SearchIcon, XIcon } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  ADAPTIVE_ICON_NAME,
  ALL_LUCIDE_NAMES,
  ICON_CATALOG,
  ICON_LOOKUP,
  type IconEntry,
} from "@/components/wiki/icon-catalog";
import { DocumentIcon } from "@/components/wiki/document-icon";
import {
  WIKI_ICON_COLORS,
  type WikiIconColor,
} from "@/components/wiki/icon-color-palette";
import { cn } from "@/lib/utils";

type IconPickerTab = "emoji" | "icons";

export interface DocumentIconValue {
  emoji: string;
  icon: string;
  /** OKLCH string from WIKI_ICON_COLORS, or "" for default/inherit. Only
   *  visible when `icon` is set; ignored on the emoji branch of DocumentIcon. */
  color: string;
}

interface DocumentIconPickerProps {
  value: DocumentIconValue;
  /** Always receives all three fields — unset sides are empty strings.
   *  Caller can pass straight to UpdateWikiDocumentInput. */
  onSelect: (value: DocumentIconValue) => void;
  disabled?: boolean;
  /** Controlled open state (used by tree node context menu). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Forwarded to the trigger's <DocumentIcon /> so the adaptive default
   *  renders the correct variant (page / closed folder / open folder) when
   *  the caller knows the doc's children + expansion state. */
  hasChildren?: boolean;
  isExpanded?: boolean;
}

export function DocumentIconPicker({
  value,
  onSelect,
  disabled,
  open: controlledOpen,
  onOpenChange,
  hasChildren,
  isExpanded,
}: DocumentIconPickerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const { resolvedTheme } = useTheme();

  const isOpen = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  // Default tab on open: emoji only when the doc already has one set, so the
  // user lands on the side that reflects their current value. Otherwise the
  // icons tab is the default — it's the richer surface (color + search +
  // adaptive default) and the one we want users to discover first.
  const defaultTab: IconPickerTab = value.emoji && !value.icon ? "emoji" : "icons";

  function handleEmojiPick(native: string) {
    // Switching to emoji clears color — color is meaningless for emojis and
    // a stale value would resurface if the user later swaps back to an icon.
    onSelect({ emoji: native, icon: "", color: "" });
    setOpen(false);
  }

  function handleIconPick(name: string) {
    // Preserve color across icon swaps so users can pick color first or change
    // their icon without losing the chosen color.
    onSelect({ emoji: "", icon: name, color: value.color });
    setOpen(false);
  }

  function handleColorPick(color: string) {
    // Stage the color without clearing the existing emoji/icon. If the doc
    // currently shows an emoji, it stays visible until the user actually
    // picks an icon (handleIconPick clears emoji). This avoids silently
    // wiping the emoji when the user clicks a swatch to preview the catalog.
    // Color is only painted on the lucide branch of DocumentIcon, so a doc
    // displaying an emoji ignores the staged color until an icon is chosen.
    onSelect({ emoji: value.emoji, icon: value.icon, color });
    // Don't close the popover — the user may want to keep browsing icons.
  }

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            className="shrink-0 text-base"
          />
        }
      >
        <DocumentIcon
          emoji={value.emoji}
          icon={value.icon}
          color={value.color}
          hasChildren={hasChildren}
          isExpanded={isExpanded}
        />
      </PopoverTrigger>
      <PopoverContent className="w-88 border-none p-2 shadow-lg" align="start">
        <Tabs defaultValue={defaultTab}>
          <TabsList className="mb-2 w-full">
            <TabsTrigger value="emoji" className="flex-1">
              Emoji
            </TabsTrigger>
            <TabsTrigger value="icons" className="flex-1">
              Icons
            </TabsTrigger>
          </TabsList>
          <TabsContent value="emoji" className="flex justify-center">
            <Picker
              data={data}
              onEmojiSelect={(e: { native: string }) =>
                handleEmojiPick(e.native)
              }
              theme={resolvedTheme === "dark" ? "dark" : "light"}
              previewPosition="none"
              skinTonePosition="none"
            />
          </TabsContent>
          <TabsContent value="icons">
            <ColorSwatchRow
              selectedColor={value.color}
              onPick={handleColorPick}
            />
            <IconGrid
              selectedName={value.icon}
              previewColor={value.color}
              onPick={handleIconPick}
            />
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

interface IconGridProps {
  selectedName: string;
  /** Preview color applied to every icon in the grid so users see the result
   *  before committing. Empty string = inherited foreground (default). */
  previewColor: string;
  onPick: (name: string) => void;
}

// Cap on the "More icons" section so a query like "a" doesn't try to lazy-load
// hundreds of icons at once. Users can refine the search to narrow further.
const EXTENDED_RESULTS_LIMIT = 64;

// Keywords matched against the search query to surface the adaptive default.
// "default"/"adaptive" are the discoverable terms; "folder"/"page"/"doc" are
// the natural names users reach for since the icon morphs through all three.
const ADAPTIVE_KEYWORDS = ["default", "adaptive", "auto", "folder", "page", "doc"];

function IconGrid({ selectedName, previewColor, onPick }: IconGridProps) {
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  // Show the adaptive entry whenever the query is empty or matches any of
  // its keywords, so users can find it either by browsing or by searching.
  const showAdaptive = !q || ADAPTIVE_KEYWORDS.some((k) => k.includes(q));

  const filteredGroups = useMemo(() => {
    if (!q) return ICON_CATALOG;
    return ICON_CATALOG.map((group) => ({
      ...group,
      icons: group.icons.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.keywords.some((k) => k.includes(q)),
      ),
    })).filter((g) => g.icons.length > 0);
  }, [q]);

  // Extended results: full lucide set, search-only, capped, excluding curated
  // catalog hits already shown above. Each result lazy-loads on first render
  // via DocumentIcon's Suspense boundary.
  const extendedResults = useMemo(() => {
    if (!q) return { names: [] as string[], truncated: false };
    const names: string[] = [];
    let total = 0;
    for (const name of ALL_LUCIDE_NAMES.keys()) {
      if (ICON_LOOKUP[name]) continue;
      if (!name.toLowerCase().includes(q)) continue;
      total++;
      if (names.length < EXTENDED_RESULTS_LIMIT) names.push(name);
    }
    return { names, truncated: total > names.length };
  }, [q]);

  const totalShown =
    (showAdaptive ? 1 : 0) +
    filteredGroups.reduce((n, g) => n + g.icons.length, 0) +
    extendedResults.names.length;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search icons…"
          className="h-8 px-7 text-sm"
        />
        {search && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setSearch("")}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>
      {/* p-1 = 4px breathing room so the selected button's ring-1 isn't
          clipped by overflow on the leftmost / rightmost / first / last
          tiles, and so the scrollbar gutter doesn't crowd the right column. */}
      <div className="max-h-72 overflow-y-auto p-1">
        {totalShown === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            No icons match "{search}".
          </p>
        ) : (
          <>
            {showAdaptive && (
              <div className="mb-3 last:mb-0">
                <h4 className="mb-1 px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Default
                </h4>
                <div className="grid grid-cols-8 gap-0.5">
                  <AdaptiveIconButton
                    selected={selectedName === ADAPTIVE_ICON_NAME}
                    previewColor={previewColor}
                    onPick={onPick}
                  />
                </div>
              </div>
            )}
            {filteredGroups.map((group) => (
              <div key={group.label} className="mb-3 last:mb-0">
                <h4 className="mb-1 px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {group.label}
                </h4>
                <div className="grid grid-cols-8 gap-0.5">
                  {group.icons.map((entry) => (
                    <IconButton
                      key={entry.name}
                      entry={entry}
                      selected={entry.name === selectedName}
                      previewColor={previewColor}
                      onPick={onPick}
                    />
                  ))}
                </div>
              </div>
            ))}
            {extendedResults.names.length > 0 && (
              <div className="mb-3 last:mb-0">
                <h4 className="mb-1 px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  More icons
                  {extendedResults.truncated && (
                    <span className="ml-1.5 normal-case text-muted-foreground/70">
                      (top {EXTENDED_RESULTS_LIMIT} — refine to see more)
                    </span>
                  )}
                </h4>
                <div className="grid grid-cols-8 gap-0.5">
                  {extendedResults.names.map((name) => (
                    <ExtendedIconButton
                      key={name}
                      name={name}
                      selected={name === selectedName}
                      previewColor={previewColor}
                      onPick={onPick}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface PickerTileProps {
  label: string;
  /** Hover tooltip; defaults to `label`. Used by the adaptive tile to explain
   *  the morphing behavior beyond what fits in an aria-label. */
  title?: string;
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

/** Shared 32×32 tile shell for every picker entry (curated, extended, adaptive).
 *  Centralizes the selected-state ring so all three stay visually identical. */
function PickerTile({
  label,
  title,
  selected,
  onClick,
  children,
}: PickerTileProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted",
        selected && "bg-primary/10 text-primary ring-1 ring-primary",
      )}
    >
      {children}
    </button>
  );
}

interface IconButtonProps {
  entry: IconEntry;
  selected: boolean;
  previewColor: string;
  onPick: (name: string) => void;
}

function IconButton({
  entry,
  selected,
  previewColor,
  onPick,
}: IconButtonProps) {
  const Icon = entry.component;
  // Inline color overrides text-foreground / text-primary classes; falls back
  // to currentColor when previewColor is empty so default-color selection
  // still highlights with text-primary.
  const style = previewColor ? { color: previewColor } : undefined;
  return (
    <PickerTile
      label={entry.name}
      selected={selected}
      onClick={() => onPick(entry.name)}
    >
      <Icon size={20} style={style} />
    </PickerTile>
  );
}

interface AdaptiveIconButtonProps {
  selected: boolean;
  previewColor: string;
  onPick: (name: string) => void;
}

/**
 * Picker tile for the adaptive default icon. Visually shows the open-folder
 * variant — it matches the legacy "📂" default and reads as the most
 * feature-rich state of the morphing icon. The actual glyph displayed on the
 * document switches at render time (FileText / Folder / FolderOpen) based on
 * the row's children + expansion state — see DocumentIcon.
 */
function AdaptiveIconButton({
  selected,
  previewColor,
  onPick,
}: AdaptiveIconButtonProps) {
  const style = previewColor ? { color: previewColor } : undefined;
  return (
    <PickerTile
      label="Default (adapts to children)"
      title="Default — page when empty, folder when it has children"
      selected={selected}
      onClick={() => onPick(ADAPTIVE_ICON_NAME)}
    >
      <FolderOpenIcon size={20} style={style} />
    </PickerTile>
  );
}

interface ExtendedIconButtonProps {
  name: string;
  selected: boolean;
  previewColor: string;
  onPick: (name: string) => void;
}

/**
 * Renders an icon from the lazy lucide registry. Each <DocumentIcon> creates
 * its own Suspense boundary, so a slow chunk for one icon doesn't block the
 * rest of the grid from rendering.
 */
function ExtendedIconButton({
  name,
  selected,
  previewColor,
  onPick,
}: ExtendedIconButtonProps) {
  return (
    <PickerTile label={name} selected={selected} onClick={() => onPick(name)}>
      <DocumentIcon icon={name} color={previewColor} size={20} />
    </PickerTile>
  );
}

interface ColorSwatchRowProps {
  selectedColor: string;
  onPick: (color: string) => void;
}

function ColorSwatchRow({ selectedColor, onPick }: ColorSwatchRowProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Icon color"
      className="mb-3 flex items-center justify-between px-1 pb-1"
    >
      {WIKI_ICON_COLORS.map((c) => (
        <ColorSwatch
          key={c.label}
          color={c}
          selected={selectedColor === c.value}
          onPick={onPick}
        />
      ))}
    </div>
  );
}

interface ColorSwatchProps {
  color: WikiIconColor;
  selected: boolean;
  onPick: (color: string) => void;
}

function ColorSwatch({ color, selected, onPick }: ColorSwatchProps) {
  const isDefault = color.value === "";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={color.label}
      title={color.label}
      onClick={() => onPick(color.value)}
      className={cn(
        "flex size-5 items-center justify-center rounded-full ring-1 ring-border transition-transform hover:scale-110",
        selected && "ring-2 ring-foreground",
      )}
      style={isDefault ? undefined : { backgroundColor: color.value }}
    >
      {isDefault && (
        <BanIcon
          className="size-3 text-muted-foreground"
          strokeWidth={2}
          aria-hidden
        />
      )}
    </button>
  );
}
