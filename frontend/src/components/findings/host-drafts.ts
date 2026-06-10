import { makeClientId } from "@/components/findings/credential-key-drafts"
import type {
  HostFieldsFragment,
  NetworkInterfaceInput,
  RouteInput,
} from "@/graphql/gql/graphql"

// Draft state + wire converters for the host form. Lives apart from the form
// component because react-refresh forbids exporting plain functions from
// component files (same reason credential-key-drafts.ts exists).
//
// Drafts carry a client-only `_id` so React can identify a row across inserts
// and deletes (same trick as KeyDraft); the id is stripped before submit.
// An interface's addresses are edited as ONE newline/comma-separated string
// rather than a nested list editor: CIDRs are short, and operators typically
// paste several at once from `ip a` output.

export interface InterfaceDraft {
  _id: string
  name: string
  mac: string
  addresses: string
}

export interface RouteDraft {
  _id: string
  destination: string
  gateway: string
  interface: string
}

export interface HostFormValues {
  hostname: string
  os: string
  interfaces: InterfaceDraft[]
  routes: RouteDraft[]
}

export function hostFormValuesFromWire(
  host: HostFieldsFragment,
): HostFormValues {
  return {
    hostname: host.hostname,
    os: host.os,
    interfaces: host.interfaces.map((i) => ({
      _id: makeClientId(),
      name: i.name,
      mac: i.mac,
      addresses: i.addresses.join("\n"),
    })),
    routes: host.routes.map((r) => ({
      _id: makeClientId(),
      destination: r.destination,
      gateway: r.gateway,
      interface: r.interface,
    })),
  }
}

export function emptyHostFormValues(): HostFormValues {
  return { hostname: "", os: "", interfaces: [], routes: [] }
}

// Mirrors the backend's normalizeInterfaces: trim everything, split the
// addresses blob on newlines/commas dropping blanks (so a trailing newline
// can't produce a "" address the CIDR parser would reject), and drop rows
// that ended up fully empty.
export function interfaceDraftsToInputs(
  drafts: InterfaceDraft[],
): NetworkInterfaceInput[] {
  const out: NetworkInterfaceInput[] = []
  for (const d of drafts) {
    const name = d.name.trim()
    const mac = d.mac.trim()
    const addresses = splitAddresses(d.addresses)
    if (!name && !mac && addresses.length === 0) continue
    out.push({ name, mac, addresses })
  }
  return out
}

// Mirrors the backend's normalizeRoutes: trim, drop fully-empty rows.
export function routeDraftsToInputs(drafts: RouteDraft[]): RouteInput[] {
  const out: RouteInput[] = []
  for (const d of drafts) {
    const destination = d.destination.trim()
    const gateway = d.gateway.trim()
    const iface = d.interface.trim()
    if (!destination && !gateway && !iface) continue
    out.push({ destination, gateway, interface: iface })
  }
  return out
}

export function splitAddresses(blob: string): string[] {
  return blob
    .split(/[\n,]/)
    .map((a) => a.trim())
    .filter((a) => a.length > 0)
}

// Loose shape checks powering the form's inline hints. Deliberately NOT a
// faithful net.ParseCIDR/ParseIP port — the backend is the source of truth
// and its error lands in the dialog banner; these only catch obvious typos
// before the round-trip.
const CIDR_SHAPE = /^[0-9a-fA-F.:]+\/\d{1,3}$/
const IP_SHAPE = /^[0-9a-fA-F.:]+$/

export function looksLikeCidr(value: string): boolean {
  return CIDR_SHAPE.test(value)
}

export function looksLikeIp(value: string): boolean {
  return IP_SHAPE.test(value)
}
