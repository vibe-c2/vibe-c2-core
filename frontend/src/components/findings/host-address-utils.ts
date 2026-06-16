import type { HostFieldsFragment } from "@/graphql/gql/graphql"

// All addresses across every interface, deduplicated (a CIDR can legitimately
// repeat across interfaces — e.g. re-imported data — and duplicate keys would
// crash list/badge renders). Shared by the hosts table row and the wiki host
// reference picker so both surface the same address list.
export function hostAddresses(h: HostFieldsFragment): string[] {
  return [...new Set(h.interfaces.flatMap((i) => i.addresses))]
}
