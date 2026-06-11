import { describe, expect, it } from "vitest"
import {
  parseCommandOutput,
  type ParsedLine,
  type SegRole,
} from "@/lib/host-import/parse"

// --- helpers -----------------------------------------------------------------

// Reconstruct a line's text from its segments — must equal the raw line.
const reassemble = (l: ParsedLine) => l.segments.map((s) => s.text).join("")

// All distinct roles present across a line's segments.
const rolesOf = (l: ParsedLine): SegRole[] => [
  ...new Set(l.segments.map((s) => s.role)),
]

// The text of the first segment carrying the given role on a line.
const textWithRole = (l: ParsedLine, role: SegRole) =>
  l.segments.find((s) => s.role === role)?.text

describe("detectCommand", () => {
  it("recognizes ip a variants", () => {
    for (const cmd of ["ip a", "ip addr", "ip address show", "ip -4 a", "sudo ip a"]) {
      expect(parseCommandOutput(cmd).command).toBe("ip-addr")
    }
  })

  it("recognizes ip ro variants", () => {
    for (const cmd of ["ip r", "ip ro", "ip route", "ip route show", "ip -6 ro"]) {
      expect(parseCommandOutput(cmd).command).toBe("ip-route")
    }
  })

  it("rejects unsupported commands with an error on the command line", () => {
    const r = parseCommandOutput("ipconfig /all\nsomething")
    expect(r.command).toBeNull()
    expect(r.commandError).toContain("Unsupported command")
    expect(r.errorCount).toBe(1)
    expect(r.lines[0].segments[0].role).toBe("error")
    // Output lines after an unsupported command are left untouched (skipped).
    expect(r.lines[1].segments.every((s) => s.role === "skipped")).toBe(true)
  })

  it("returns an empty, non-error result for blank input", () => {
    const r = parseCommandOutput("")
    expect(r.command).toBeNull()
    expect(r.commandError).toBeNull()
    expect(r.errorCount).toBe(0)
    expect(r.interfaces).toHaveLength(0)
  })
})

describe("parseCommandOutput — ip a", () => {
  const IP_A = `ip a
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
    inet 127.0.0.1/8 scope host lo
       valid_lft forever preferred_lft forever
    inet6 ::1/128 scope host
       valid_lft forever preferred_lft forever
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000
    link/ether 08:00:27:12:34:56 brd ff:ff:ff:ff:ff:ff
    inet 10.0.5.12/24 brd 10.0.5.255 scope global eth0
       valid_lft forever preferred_lft forever
    inet6 fe80::a00:27ff:fe12:3456/64 scope link
       valid_lft forever preferred_lft forever`

  it("imports the real interface, dropping loopback", () => {
    const r = parseCommandOutput(IP_A)
    expect(r.command).toBe("ip-addr")
    expect(r.errorCount).toBe(0)
    expect(r.interfaces).toHaveLength(1)
    const eth0 = r.interfaces[0]
    expect(eth0.name).toBe("eth0")
    expect(eth0.mac).toBe("08:00:27:12:34:56")
    // link-local fe80:: is dropped; only the routable address survives.
    expect(eth0.addresses).toEqual(["10.0.5.12/24"])
    // lo counts as a skipped interface.
    expect(r.skippedCount).toBe(1)
    expect(r.usedCount).toBe(1)
  })

  it("highlights the routable address as used and the link-local as skipped", () => {
    const r = parseCommandOutput(IP_A)
    const used = r.lines.find((l) => textWithRole(l, "used") === "10.0.5.12/24")
    expect(used).toBeDefined()
    const linkLocal = r.lines.find((l) => l.raw.includes("fe80::"))!
    expect(rolesOf(linkLocal)).toEqual(["skipped"])
  })

  it("every line's segments reassemble to the raw line", () => {
    const r = parseCommandOutput(IP_A)
    for (const l of r.lines) expect(reassemble(l)).toBe(l.raw)
  })

  it("strips a VLAN @ifN suffix from the interface name", () => {
    const r = parseCommandOutput(
      "ip a\n3: eth0.10@eth0: <UP> mtu 1500\n    inet 10.0.9.5/24 scope global",
    )
    expect(r.interfaces[0].name).toBe("eth0.10")
  })

  it("flags an invalid CIDR as an error and blocks (errorCount > 0)", () => {
    const r = parseCommandOutput(
      "ip a\n2: eth0: <UP>\n    inet 10.0.5.999/24 scope global eth0",
    )
    expect(r.errorCount).toBe(1)
    const bad = r.lines.find((l) => l.error)!
    expect(textWithRole(bad, "error")).toBe("10.0.5.999/24")
    // The interface had no valid address → not imported.
    expect(r.interfaces).toHaveLength(0)
  })

  it("parses multiple real interfaces", () => {
    const r = parseCommandOutput(
      `ip a
2: eth0: <UP>
    link/ether 08:00:27:00:00:01 brd ff:ff:ff:ff:ff:ff
    inet 10.0.5.12/24 scope global eth0
3: eth1: <UP>
    link/ether 08:00:27:00:00:02 brd ff:ff:ff:ff:ff:ff
    inet 192.168.50.4/24 scope global eth1`,
    )
    expect(r.interfaces.map((i) => i.name)).toEqual(["eth0", "eth1"])
    expect(r.interfaces[1].addresses).toEqual(["192.168.50.4/24"])
  })

  it("demotes name/mac highlights of an address-less (dropped) interface to skipped", () => {
    // eth0 is DOWN with no inet line — it is not imported, so nothing on its
    // lines may render green ("used"). eth1 has an address and stays used.
    const r = parseCommandOutput(
      `ip a
2: eth0: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN group default qlen 1000
    link/ether 00:1d:c3:00:85:fe brd ff:ff:ff:ff:ff:ff
3: eth1: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP group default qlen 1000
    link/ether 6c:b3:11:5e:ac:70 brd ff:ff:ff:ff:ff:ff
    inet 10.1.142.65/24 brd 10.1.142.255 scope global eth1`,
    )
    expect(r.errorCount).toBe(0)
    expect(r.interfaces.map((i) => i.name)).toEqual(["eth1"])
    expect(r.usedCount).toBe(1)
    expect(r.skippedCount).toBe(1)

    const eth0Header = r.lines.find((l) => l.raw.includes("2: eth0"))!
    const eth0Mac = r.lines.find((l) => l.raw.includes("00:1d:c3:00:85:fe"))!
    expect(rolesOf(eth0Header)).toEqual(["skipped"])
    expect(rolesOf(eth0Mac)).toEqual(["skipped"])

    const eth1Header = r.lines.find((l) => l.raw.includes("3: eth1"))!
    expect(textWithRole(eth1Header, "used")).toBe("eth1")
  })

  it("demotes the last interface when it is address-less (flush at end of input)", () => {
    const r = parseCommandOutput(
      `ip a
2: eth0: <UP>
    inet 10.0.5.12/24 scope global eth0
3: eth1: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN
    link/ether 08:00:27:00:00:02 brd ff:ff:ff:ff:ff:ff`,
    )
    expect(r.interfaces.map((i) => i.name)).toEqual(["eth0"])
    expect(r.skippedCount).toBe(1)
    const eth1Header = r.lines.find((l) => l.raw.includes("3: eth1"))!
    expect(rolesOf(eth1Header)).toEqual(["skipped"])
  })

  it("errors on an address with no preceding interface header", () => {
    const r = parseCommandOutput("ip a\n    inet 10.0.5.12/24 scope global")
    expect(r.errorCount).toBe(1)
    expect(r.interfaces).toHaveLength(0)
  })

  it("drops host-local virtual interfaces (docker0, br-*, virbr0, cni0) by name", () => {
    // Docker host: real eth0 plus docker0 and a custom bridge — both 172.x
    // ranges that collide across hosts and must not become subnet nodes.
    const r = parseCommandOutput(
      `ip a
2: eth0: <UP>
    link/ether 08:00:27:00:00:01 brd ff:ff:ff:ff:ff:ff
    inet 10.0.5.12/24 scope global eth0
3: docker0: <NO-CARRIER,BROADCAST,MULTICAST,UP>
    link/ether 02:42:9b:1a:2c:3d brd ff:ff:ff:ff:ff:ff
    inet 172.17.0.1/16 brd 172.17.255.255 scope global docker0
4: br-1a2b3c4d5e6f: <UP>
    link/ether 02:42:aa:bb:cc:dd brd ff:ff:ff:ff:ff:ff
    inet 172.18.0.1/16 scope global br-1a2b3c4d5e6f
5: virbr0: <UP>
    link/ether 52:54:00:11:22:33 brd ff:ff:ff:ff:ff:ff
    inet 192.168.122.1/24 scope global virbr0`,
    )
    expect(r.errorCount).toBe(0)
    expect(r.interfaces.map((i) => i.name)).toEqual(["eth0"])
    expect(r.usedCount).toBe(1)
    expect(r.skippedCount).toBe(3)

    // The docker0 address line never renders green.
    const docker0Addr = r.lines.find((l) => l.raw.includes("172.17.0.1/16"))!
    expect(rolesOf(docker0Addr)).toEqual(["skipped"])
  })

  it("drops a virtual interface caught only by its 02:42 MAC OUI", () => {
    // Name doesn't match the list, but the locally-administered Docker OUI does.
    const r = parseCommandOutput(
      `ip a
2: myveth42: <UP>
    link/ether 02:42:de:ad:be:ef brd ff:ff:ff:ff:ff:ff
    inet 172.20.0.1/16 scope global myveth42`,
    )
    expect(r.errorCount).toBe(0)
    expect(r.interfaces).toHaveLength(0)
    expect(r.skippedCount).toBe(1)

    const header = r.lines.find((l) => l.raw.includes("2: myveth42"))!
    expect(rolesOf(header)).toEqual(["skipped"])
  })

  it("keeps a real bridge named brN that isn't a Docker br-<hex> bridge", () => {
    // A legitimate host bridge (br0) with a normal MAC stays imported — only
    // Docker's br-<12 hex> form and the 02:42 OUI are treated as virtual.
    const r = parseCommandOutput(
      `ip a
2: br0: <UP>
    link/ether 08:00:27:ab:cd:ef brd ff:ff:ff:ff:ff:ff
    inet 10.10.0.1/24 scope global br0`,
    )
    expect(r.interfaces.map((i) => i.name)).toEqual(["br0"])
  })
})

describe("parseCommandOutput — ip ro", () => {
  const IP_RO = `ip ro
default via 10.0.5.1 dev eth0 proto dhcp metric 100
10.0.5.0/24 dev eth0 proto kernel scope link src 10.0.5.12 metric 100
10.0.8.0/24 via 10.0.5.1 dev eth0`

  it("imports gatewayed routes and maps default to 0.0.0.0/0", () => {
    const r = parseCommandOutput(IP_RO)
    expect(r.command).toBe("ip-route")
    expect(r.errorCount).toBe(0)
    expect(r.routes).toEqual([
      { destination: "0.0.0.0/0", gateway: "10.0.5.1", interface: "eth0" },
      { destination: "10.0.8.0/24", gateway: "10.0.5.1", interface: "eth0" },
    ])
    // The on-link kernel route is recognized but skipped.
    expect(r.skippedCount).toBe(1)
    expect(r.usedCount).toBe(2)
  })

  it("highlights destination, gateway, and dev as used", () => {
    const r = parseCommandOutput(IP_RO)
    const def = r.lines.find((l) => l.raw.startsWith("default"))!
    const usedTexts = def.segments.filter((s) => s.role === "used").map((s) => s.text)
    expect(usedTexts).toContain("default")
    expect(usedTexts).toContain("10.0.5.1")
    expect(usedTexts).toContain("eth0")
  })

  it("marks the whole on-link route line as skipped", () => {
    const r = parseCommandOutput(IP_RO)
    const onlink = r.lines.find((l) => l.raw.startsWith("10.0.5.0/24"))!
    expect(rolesOf(onlink)).toEqual(["skipped"])
  })

  it("flags a bad gateway IP as an error", () => {
    const r = parseCommandOutput("ip ro\ndefault via 10.0.5.999 dev eth0")
    expect(r.errorCount).toBe(1)
    const bad = r.lines.find((l) => l.error)!
    expect(textWithRole(bad, "error")).toBe("10.0.5.999")
    expect(r.routes).toHaveLength(0)
  })

  it("flags a bad destination as an error", () => {
    const r = parseCommandOutput("ip ro\nnot-a-cidr via 10.0.5.1 dev eth0")
    expect(r.errorCount).toBe(1)
    expect(r.routes).toHaveLength(0)
  })

  it("skips special route types (blackhole/unreachable) without erroring", () => {
    const r = parseCommandOutput(
      `ip ro
blackhole 10.244.89.64/26 proto 80
unreachable 10.0.0.0/8`,
    )
    expect(r.errorCount).toBe(0)
    expect(r.routes).toHaveLength(0)
    expect(r.skippedCount).toBe(2)
  })

  it("skips on-link host routes (bare IP, no gateway) without erroring", () => {
    // The exact k8s/calico shape: a bare-IP destination, dev only, no via.
    const r = parseCommandOutput(
      `ip ro
10.244.89.68 dev calif2a7a17753a scope link
10.244.89.69 dev calif9bf21e7ace scope link`,
    )
    expect(r.errorCount).toBe(0)
    expect(r.routes).toHaveLength(0)
    expect(r.skippedCount).toBe(2)
  })

  it("normalizes a gatewayed bare-IP host route to /32", () => {
    const r = parseCommandOutput("ip ro\n10.0.9.5 via 10.0.5.1 dev eth0")
    expect(r.errorCount).toBe(0)
    expect(r.routes).toEqual([
      { destination: "10.0.9.5/32", gateway: "10.0.5.1", interface: "eth0" },
    ])
  })

  it("reassembles every route line verbatim", () => {
    const r = parseCommandOutput(IP_RO)
    for (const l of r.lines) expect(reassemble(l)).toBe(l.raw)
  })
})

describe("parseCommandOutput — IPv6", () => {
  it("handles IPv6 interface addresses and routes", () => {
    const ifaces = parseCommandOutput(
      "ip a\n2: eth0: <UP>\n    inet6 2001:db8::5/64 scope global",
    )
    expect(ifaces.interfaces[0].addresses).toEqual(["2001:db8::5/64"])

    const routes = parseCommandOutput("ip ro\n2001:db8:8::/64 via 2001:db8::1 dev eth0")
    expect(routes.routes).toEqual([
      { destination: "2001:db8:8::/64", gateway: "2001:db8::1", interface: "eth0" },
    ])
  })
})
