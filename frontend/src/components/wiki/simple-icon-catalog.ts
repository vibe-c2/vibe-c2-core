// Simple Icons (brand/logo) registry, the sibling of icon-catalog.ts (lucide).
//
// Storage convention: an icon value is a bare lucide PascalCase name
// ("Server") or the reserved "Adaptive" — OR a Simple Icon encoded with the
// `si:` prefix + the icon's slug ("si:ubuntu"). Bare = lucide is what every
// pre-existing stored value already is, so the prefix keeps the two libraries
// unambiguous in one string field with zero migration.
//
// Rendering mirrors the lucide lazy path: the full Simple Icons set (~3.4k) is
// far too large to import eagerly (5 MB), so we enumerate the package's raw
// per-icon SVGs via import.meta.glob and lazy-load each as a `?raw` string on
// first render. Only icons actually shown ever get fetched.
//
// Note: Simple Icons removed several big-tech marks (Windows, Microsoft, AWS,
// Azure) for trademark reasons — so there is intentionally no Windows logo
// here. The host OS-derived default keeps its own inlined Windows path; see
// host-icon.tsx.

import { createElement, lazy } from "react"
import type { IconComponent } from "@/components/wiki/icon-catalog"

/** Prefix marking an icon value as a Simple Icon slug rather than a lucide name. */
export const SIMPLE_ICON_PREFIX = "si:"

export function isSimpleIconName(
  value: string | null | undefined,
): value is string {
  return !!value && value.startsWith(SIMPLE_ICON_PREFIX)
}

/** Strips the `si:` prefix to the bare slug. Returns "" for non-prefixed input. */
export function simpleIconSlug(value: string | null | undefined): string {
  return isSimpleIconName(value)
    ? value.slice(SIMPLE_ICON_PREFIX.length)
    : ""
}

/** Encodes a slug as a stored icon value. */
export function toSimpleIconName(slug: string): string {
  return SIMPLE_ICON_PREFIX + slug
}

// Raw per-icon SVGs from the installed package. Lazy (no { eager }), so each
// match is just a thunk until the icon first renders. simple-icons ships
// `icons/<slug>.svg`; the slug is the filename.
const SVG_GLOB = import.meta.glob<string>(
  "/node_modules/simple-icons/icons/*.svg",
  { query: "?raw", import: "default" },
)

const SLUG_TO_IMPORTER = new Map<string, () => Promise<string>>()
for (const [path, importFn] of Object.entries(SVG_GLOB)) {
  const slug = path.slice(path.lastIndexOf("/") + 1).replace(/\.svg$/, "")
  SLUG_TO_IMPORTER.set(slug, importFn as () => Promise<string>)
}

/** Every available Simple Icon slug, sorted — the search corpus. */
export const ALL_SIMPLE_ICON_SLUGS: readonly string[] = [
  ...SLUG_TO_IMPORTER.keys(),
].sort()

// simple-icons SVGs are single-path, 24×24, `fill` via currentColor. Pull the
// path data out of the raw markup and rebuild a minimal <svg> we control, so
// we can size/color it and avoid injecting their <title>/role markup (and any
// dangerouslySetInnerHTML).
const PATH_RE = /<path\s+d="([^"]+)"/

const simpleLazyCache = new Map<string, IconComponent>()

function makeLazySimpleIcon(
  importFn: () => Promise<string>,
): IconComponent {
  const Lazy = lazy(async () => {
    const raw = await importFn()
    const d = raw.match(PATH_RE)?.[1] ?? ""
    const Comp: IconComponent = ({ size = 18, className, style }) =>
      createElement(
        "svg",
        {
          viewBox: "0 0 24 24",
          width: size,
          height: size,
          fill: "currentColor",
          className,
          style,
          "aria-hidden": true,
        },
        createElement("path", { d }),
      )
    Comp.displayName = "SimpleIcon"
    return { default: Comp }
  })
  return Lazy as unknown as IconComponent
}

/**
 * Resolves a Simple Icon slug to a renderable, memoized React.lazy component.
 * Requires a Suspense boundary in the caller (DocumentIcon provides one).
 * Returns null for an unknown slug so the caller can fall back to emoji / the
 * default glyph.
 */
export function resolveSimpleIcon(
  slug: string | null | undefined,
): IconComponent | null {
  if (!slug) return null
  const cached = simpleLazyCache.get(slug)
  if (cached) return cached
  const importFn = SLUG_TO_IMPORTER.get(slug)
  if (!importFn) return null
  const Lazy = makeLazySimpleIcon(importFn)
  simpleLazyCache.set(slug, Lazy)
  return Lazy
}

export interface SimpleIconEntry {
  slug: string
  /** Extra search terms beyond the slug itself (e.g. "rhel" → redhat). */
  keywords: readonly string[]
}

export interface SimpleIconGroup {
  label: string
  icons: readonly SimpleIconEntry[]
}

const si = (
  slug: string,
  keywords: readonly string[] = [],
): SimpleIconEntry => ({ slug, keywords })

// Curated brand icons surfaced in the picker's browse (empty-query) state,
// weighted toward what a network-recon UI labels hosts with. The full set is
// still reachable by search. Every slug here is verified present in the
// installed package (simple-icons drops marks over time, so a typo'd or
// removed slug would render blank).
export const SIMPLE_ICON_CATALOG: readonly SimpleIconGroup[] = [
  {
    label: "Operating systems",
    icons: [
      si("linux", ["tux"]),
      si("ubuntu"),
      si("debian"),
      si("archlinux", ["arch"]),
      si("fedora"),
      si("redhat", ["rhel"]),
      si("centos"),
      si("rockylinux", ["rocky"]),
      si("almalinux", ["alma"]),
      si("kalilinux", ["kali"]),
      si("alpinelinux", ["alpine"]),
      si("opensuse", ["suse"]),
      si("gentoo"),
      si("freebsd", ["bsd"]),
      si("openbsd", ["bsd"]),
      si("android"),
      si("apple", ["mac", "osx"]),
      si("macos", ["mac", "osx"]),
      si("ios"),
    ],
  },
  {
    label: "Cloud & infrastructure",
    icons: [
      si("googlecloud", ["gcp", "gcloud"]),
      si("docker"),
      si("kubernetes", ["k8s"]),
      si("nginx"),
      si("apache"),
      si("cloudflare"),
      si("digitalocean"),
      si("vmware"),
      si("proxmox"),
      si("openstack"),
      si("terraform"),
      si("ansible"),
    ],
  },
  {
    label: "Dev & data",
    icons: [
      si("git"),
      si("github"),
      si("gitlab"),
      si("python"),
      si("go", ["golang"]),
      si("rust"),
      si("javascript", ["js"]),
      si("typescript", ["ts"]),
      si("react"),
      si("nodedotjs", ["node", "nodejs"]),
      si("postgresql", ["postgres", "psql"]),
      si("mysql"),
      si("mongodb", ["mongo"]),
      si("redis"),
    ],
  },
  {
    label: "Network & security",
    icons: [
      si("wireshark"),
      si("torproject", ["tor"]),
      si("openvpn", ["vpn"]),
      si("wireguard", ["vpn"]),
      si("tailscale", ["vpn"]),
      si("gnubash", ["bash", "shell", "sh"]),
      si("cisco"),
      si("mikrotik"),
      si("fortinet"),
    ],
  },
]

/**
 * Slugs already shown in the curated browse sections — the search path excludes
 * these from the "More brand icons" results so they aren't listed twice.
 * Co-located with the catalog (mirrors lucide's ICON_LOOKUP) so the dedupe set
 * can't drift from SIMPLE_ICON_CATALOG.
 */
export const CURATED_SIMPLE_SLUGS: ReadonlySet<string> = new Set(
  SIMPLE_ICON_CATALOG.flatMap((g) => g.icons.map((i) => i.slug)),
)
