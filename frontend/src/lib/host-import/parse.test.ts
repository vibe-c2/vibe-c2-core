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
    const r = parseCommandOutput("netstat -an\nsomething")
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

describe("detectCommand — last", () => {
  it("recognizes last variants", () => {
    for (const cmd of ["last", "last -i", "last -F -a", "sudo last -n 50", "lastb"]) {
      expect(parseCommandOutput(cmd).command).toBe("last")
    }
  })
})

describe("parseCommandOutput — last", () => {
  it("parses a remote login: user + source host", () => {
    const out = [
      "last",
      "alice    pts/0        10.0.5.12        Tue Jun 10 14:02   still logged in",
    ].join("\n")
    const r = parseCommandOutput(out)
    expect(r.command).toBe("last")
    expect(r.errorCount).toBe(0)
    expect(r.logins).toEqual([
      {
        user: "alice",
        from: "10.0.5.12",
        tty: "pts/0",
        lastSeen: "Tue Jun 10 14:02",
        count: 1,
      },
    ])
    // user and source host are highlighted as used.
    const line = r.lines[1]
    expect(textWithRole(line, "used")).toBe("alice")
    expect(reassemble(line)).toBe(
      "alice    pts/0        10.0.5.12        Tue Jun 10 14:02   still logged in",
    )
  })

  it("treats a local console login as having no source host", () => {
    const out = ["last", "root     tty1                          Mon Jun  9 09:00 - 09:30  (00:30)"].join("\n")
    const r = parseCommandOutput(out)
    expect(r.logins).toEqual([
      { user: "root", from: "", tty: "tty1", lastSeen: "Mon Jun 9 09:00", count: 1 },
    ])
  })

  it("drops reboot/shutdown pseudo-users and the wtmp footer as noise", () => {
    const out = [
      "last",
      "reboot   system boot  5.15.0-generic   Tue Jun 10 12:00   still running",
      "shutdown system down  5.15.0-generic   Tue Jun 10 11:59 - 12:00  (00:01)",
      "",
      "wtmp begins Mon Jun  9 09:00:00 2026",
    ].join("\n")
    const r = parseCommandOutput(out)
    expect(r.logins).toHaveLength(0)
    expect(r.usedCount).toBe(0)
    expect(r.skippedCount).toBeGreaterThanOrEqual(3)
  })

  it("collapses repeated sessions of the same (user, from) into a count", () => {
    const out = [
      "last",
      "alice    pts/0        10.0.5.12        Tue Jun 10 14:02   still logged in",
      "alice    pts/1        10.0.5.12        Tue Jun 10 09:10 - 11:00  (01:50)",
      "alice    pts/0        10.0.9.99        Mon Jun  9 18:00 - 19:00  (01:00)",
    ].join("\n")
    const r = parseCommandOutput(out)
    expect(r.logins).toEqual([
      { user: "alice", from: "10.0.5.12", tty: "pts/0", lastSeen: "Tue Jun 10 14:02", count: 2 },
      { user: "alice", from: "10.0.9.99", tty: "pts/0", lastSeen: "Mon Jun 9 18:00", count: 1 },
    ])
    expect(r.usedCount).toBe(2)
  })

  it("ignores the all-zero placeholder from `last -i` local logins", () => {
    const out = ["last -i", "bob      pts/2        0.0.0.0          Wed Jun 11 08:00   still logged in"].join("\n")
    const r = parseCommandOutput(out)
    expect(r.logins).toEqual([
      { user: "bob", from: "", tty: "pts/2", lastSeen: "Wed Jun 11 08:00", count: 1 },
    ])
  })

  it("keeps a hostname source (not just IPs)", () => {
    const out = ["last", "carol    pts/3        workstation.corp Thu Jun  5 13:00 - 14:00  (01:00)"].join("\n")
    const r = parseCommandOutput(out)
    expect(r.logins[0]).toMatchObject({ user: "carol", from: "workstation.corp" })
  })

  it("treats localhost / loopback sources as local (no source host)", () => {
    const out = [
      "last",
      "alice    pts/0        localhost        Tue Jun 10 14:02   still logged in",
      "bob      pts/1        localhost.localdomain Tue Jun 10 13:00 - 13:45  (00:45)",
      "carol    pts/2        127.0.0.1        Mon Jun  9 09:00 - 09:30  (00:30)",
    ].join("\n")
    const r = parseCommandOutput(out)
    expect(r.logins.map((l) => l.from)).toEqual(["", "", ""])
  })
})

describe("detectCommand — ipconfig", () => {
  it("recognizes ipconfig variants, prompts, and the space-less /all", () => {
    for (const cmd of [
      "ipconfig /all",
      "ipconfig",
      "ipconfig/all",
      "ipconfig.exe /all",
      "C:\\Users\\admin>ipconfig /all",
      "PS C:\\> ipconfig /all",
    ]) {
      expect(parseCommandOutput(cmd).command).toBe("ipconfig")
    }
  })

  it("does not mistake other windows commands for ipconfig", () => {
    expect(parseCommandOutput("ipconfigure").command).toBeNull()
  })
})

describe("parseCommandOutput — ipconfig /all", () => {
  const IPCONFIG = `ipconfig /all

Windows IP Configuration

   Host Name . . . . . . . . . . . . : DESKTOP-ABC123
   Primary Dns Suffix  . . . . . . . : corp.example.com
   Node Type . . . . . . . . . . . . : Hybrid
   IP Routing Enabled. . . . . . . . : No

Ethernet adapter Ethernet0:

   Connection-specific DNS Suffix  . : corp.example.com
   Description . . . . . . . . . . . : Intel(R) 82574L Gigabit Network Connection
   Physical Address. . . . . . . . . : 00-0C-29-3E-4B-5A
   DHCP Enabled. . . . . . . . . . . : Yes
   Link-local IPv6 Address . . . . . : fe80::1c2a:3b4c:5d6e:7f80%4(Preferred)
   IPv4 Address. . . . . . . . . . . : 10.10.20.15(Preferred)
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Lease Obtained. . . . . . . . . . : Tuesday, June 10, 2025 8:01:23 AM
   Default Gateway . . . . . . . . . : 10.10.20.1
   DHCP Server . . . . . . . . . . . : 10.10.20.1
   DNS Servers . . . . . . . . . . . : 10.10.20.5
                                       10.10.20.6
   NetBIOS over Tcpip. . . . . . . . : Enabled

Tunnel adapter Teredo Tunneling Pseudo-Interface:

   Media State . . . . . . . . . . . : Media disconnected
   Connection-specific DNS Suffix  . :
   Description . . . . . . . . . . . : Microsoft Teredo Tunneling Adapter
   Physical Address. . . . . . . . . : 00-00-00-00-00-00-00-E0`

  it("imports the adapter with a CIDR built from address + mask", () => {
    const r = parseCommandOutput(IPCONFIG)
    expect(r.command).toBe("ipconfig")
    expect(r.errorCount).toBe(0)
    expect(r.interfaces).toEqual([
      {
        name: "Ethernet0",
        mac: "00:0c:29:3e:4b:5a",
        addresses: ["10.10.20.15/24"],
      },
    ])
  })

  it("emits the default gateway as a route through the adapter", () => {
    const r = parseCommandOutput(IPCONFIG)
    expect(r.routes).toEqual([
      { destination: "0.0.0.0/0", gateway: "10.10.20.1", interface: "Ethernet0" },
    ])
  })

  it("extracts the host name from the global section", () => {
    const r = parseCommandOutput(IPCONFIG)
    expect(r.hostname).toBe("DESKTOP-ABC123")
    // interface + route + hostname
    expect(r.usedCount).toBe(3)
  })

  it("drops the tunnel adapter as skipped, never imported", () => {
    const r = parseCommandOutput(IPCONFIG)
    expect(r.skippedCount).toBe(1)
    const header = r.lines.find((l) => l.raw.startsWith("Tunnel adapter"))!
    expect(rolesOf(header)).toEqual(["skipped"])
  })

  it("highlights the address (not its (Preferred) suffix) as used", () => {
    const r = parseCommandOutput(IPCONFIG)
    const addr = r.lines.find((l) => l.raw.includes("10.10.20.15"))!
    expect(textWithRole(addr, "used")).toBe("10.10.20.15")
    // link-local IPv6 stays gray.
    const ll = r.lines.find((l) => l.raw.includes("fe80::"))!
    expect(rolesOf(ll)).toEqual(["skipped"])
  })

  it("every line's segments reassemble to the raw line", () => {
    const r = parseCommandOutput(IPCONFIG)
    for (const l of r.lines) expect(reassemble(l)).toBe(l.raw)
  })

  it("pairs multiple IPv4 address/mask pairs on one adapter", () => {
    const r = parseCommandOutput(
      `ipconfig /all
Ethernet adapter Ethernet0:
   IPv4 Address. . . . . . . . . . . : 10.0.0.5(Preferred)
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   IPv4 Address. . . . . . . . . . . : 10.0.1.5(Preferred)
   Subnet Mask . . . . . . . . . . . : 255.255.0.0`,
    )
    expect(r.errorCount).toBe(0)
    expect(r.interfaces[0].addresses).toEqual(["10.0.0.5/24", "10.0.1.5/16"])
  })

  it("takes the IPv4 gateway from a multi-line Default Gateway (IPv6 first)", () => {
    const r = parseCommandOutput(
      `ipconfig /all
Ethernet adapter Ethernet0:
   IPv4 Address. . . . . . . . . . . : 10.0.0.5(Preferred)
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . : fe80::1%12
                                       10.0.0.1`,
    )
    expect(r.errorCount).toBe(0)
    // The link-local IPv6 gateway carries no pivot signal — skipped.
    expect(r.routes).toEqual([
      { destination: "0.0.0.0/0", gateway: "10.0.0.1", interface: "Ethernet0" },
    ])
  })

  it("emits both default routes for a dual-stack gateway (routable IPv6 + IPv4)", () => {
    // A dual-stack host genuinely has two default routes — both are pivot
    // signal and both are kept.
    const r = parseCommandOutput(
      `ipconfig /all
Ethernet adapter Ethernet0:
   IPv4 Address. . . . . . . . . . . : 10.0.0.5(Preferred)
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . : 2001:db8::1
                                       10.0.0.1`,
    )
    expect(r.errorCount).toBe(0)
    expect(r.routes).toEqual([
      { destination: "::/0", gateway: "2001:db8::1", interface: "Ethernet0" },
      { destination: "0.0.0.0/0", gateway: "10.0.0.1", interface: "Ethernet0" },
    ])
  })

  it("flags the first of two consecutive IPv4 addresses (mask never arrived)", () => {
    const r = parseCommandOutput(
      `ipconfig /all
Ethernet adapter Ethernet0:
   IPv4 Address. . . . . . . . . . . : 10.0.0.5(Preferred)
   IPv4 Address. . . . . . . . . . . : 10.0.1.5(Preferred)
   Subnet Mask . . . . . . . . . . . : 255.255.255.0`,
    )
    expect(r.errorCount).toBe(1)
    const bad = r.lines.find((l) => l.error)!
    expect(bad.raw).toContain("10.0.0.5")
    expect(bad.error).toContain("Subnet Mask")
    // The properly paired second address still imports.
    expect(r.interfaces[0]?.addresses).toEqual(["10.0.1.5/24"])
  })

  it("keeps a routable IPv6 gateway as a ::/0 route", () => {
    const r = parseCommandOutput(
      `ipconfig /all
Ethernet adapter Ethernet0:
   IPv6 Address. . . . . . . . . . . : 2001:db8::5(Preferred)
   Default Gateway . . . . . . . . . : 2001:db8::1`,
    )
    expect(r.interfaces[0].addresses).toEqual(["2001:db8::5/128"])
    expect(r.routes).toEqual([
      { destination: "::/0", gateway: "2001:db8::1", interface: "Ethernet0" },
    ])
  })

  it("skips temporary IPv6 addresses (privacy churn)", () => {
    const r = parseCommandOutput(
      `ipconfig /all
Ethernet adapter Ethernet0:
   IPv6 Address. . . . . . . . . . . : 2001:db8::5(Preferred)
   Temporary IPv6 Address. . . . . . : 2001:db8::abcd(Preferred)`,
    )
    expect(r.interfaces[0].addresses).toEqual(["2001:db8::5/128"])
  })

  it("drops a media-disconnected ethernet adapter and demotes its lines", () => {
    const r = parseCommandOutput(
      `ipconfig /all
Ethernet adapter Ethernet1:

   Media State . . . . . . . . . . . : Media disconnected
   Description . . . . . . . . . . . : Realtek PCIe GbE Family Controller
   Physical Address. . . . . . . . . : 54-BF-64-0A-1B-2C`,
    )
    expect(r.errorCount).toBe(0)
    expect(r.interfaces).toHaveLength(0)
    expect(r.skippedCount).toBe(1)
    const header = r.lines.find((l) => l.raw.startsWith("Ethernet adapter"))!
    expect(rolesOf(header)).toEqual(["skipped"])
  })

  it("drops host-side virtual adapters by name (vEthernet) and description (VMware)", () => {
    const r = parseCommandOutput(
      `ipconfig /all
Ethernet adapter vEthernet (Default Switch):

   Physical Address. . . . . . . . . : 00-15-5D-01-02-03
   IPv4 Address. . . . . . . . . . . : 172.30.96.1(Preferred)
   Subnet Mask . . . . . . . . . . . : 255.255.240.0

Ethernet adapter VMware Network Adapter VMnet8:

   Description . . . . . . . . . . . : VMware Virtual Ethernet Adapter for VMnet8
   Physical Address. . . . . . . . . : 00-50-56-C0-00-08
   IPv4 Address. . . . . . . . . . . : 192.168.142.1(Preferred)
   Subnet Mask . . . . . . . . . . . : 255.255.255.0

Ethernet adapter Ethernet0:

   Physical Address. . . . . . . . . : 00-0C-29-AA-BB-CC
   IPv4 Address. . . . . . . . . . . : 10.0.5.20(Preferred)
   Subnet Mask . . . . . . . . . . . : 255.255.255.0`,
    )
    expect(r.errorCount).toBe(0)
    expect(r.interfaces.map((i) => i.name)).toEqual(["Ethernet0"])
    expect(r.skippedCount).toBe(2)
    // The VMware adapter's address never renders green (description arrives
    // after the header — the exclusion flip must demote it).
    const vmAddr = r.lines.find((l) => l.raw.includes("192.168.142.1"))!
    expect(rolesOf(vmAddr)).toEqual(["skipped"])
  })

  it("skips an APIPA autoconfiguration address and drops the empty adapter", () => {
    const r = parseCommandOutput(
      `ipconfig /all
Ethernet adapter Ethernet0:
   Autoconfiguration IPv4 Address. . : 169.254.33.7(Preferred)
   Subnet Mask . . . . . . . . . . . : 255.255.0.0`,
    )
    expect(r.errorCount).toBe(0)
    expect(r.interfaces).toHaveLength(0)
    expect(r.skippedCount).toBe(1)
  })

  it("flags an IPv4 address with no Subnet Mask line as an error", () => {
    const r = parseCommandOutput(
      `ipconfig /all
Ethernet adapter Ethernet0:
   IPv4 Address. . . . . . . . . . . : 10.0.0.5(Preferred)
   Default Gateway . . . . . . . . . : 10.0.0.1`,
    )
    expect(r.errorCount).toBe(1)
    const bad = r.lines.find((l) => l.error)!
    expect(bad.error).toContain("Subnet Mask")
    expect(r.interfaces).toHaveLength(0)
  })

  it("flags an invalid subnet mask as an error", () => {
    const r = parseCommandOutput(
      `ipconfig /all
Ethernet adapter Ethernet0:
   IPv4 Address. . . . . . . . . . . : 10.0.0.5(Preferred)
   Subnet Mask . . . . . . . . . . . : 255.0.255.0`,
    )
    expect(r.errorCount).toBe(1)
    expect(r.interfaces).toHaveLength(0)
  })

  it("parses the pre-Vista key style (IP Address, no /all extras)", () => {
    const r = parseCommandOutput(
      `ipconfig
Ethernet adapter Local Area Connection:

   IP Address. . . . . . . . . . . . : 192.168.1.50
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . : 192.168.1.1`,
    )
    expect(r.errorCount).toBe(0)
    expect(r.interfaces).toEqual([
      { name: "Local Area Connection", mac: "", addresses: ["192.168.1.50/24"] },
    ])
    expect(r.routes).toHaveLength(1)
  })

  it("degrades an unsupported display language (German) to all-skipped, zero used, zero errors", () => {
    const r = parseCommandOutput(
      `ipconfig /all

Windows-IP-Konfiguration

   Hostname  . . . . . . . . . . . . : DESKTOP-DE
   Primäres DNS-Suffix . . . . . . . : corp.example.de

Ethernet-Adapter Ethernet0:

   Physikalische Adresse . . . . . . : 00-0C-29-3E-4B-5A
   IPv4-Adresse  . . . . . . . . . . : 10.10.20.15(Bevorzugt)
   Subnetzmaske  . . . . . . . . . . : 255.255.255.0
   Standardgateway . . . . . . . . . : 10.10.20.1`,
    )
    expect(r.command).toBe("ipconfig")
    expect(r.errorCount).toBe(0)
    expect(r.usedCount).toBe(0)
    expect(r.interfaces).toHaveLength(0)
    expect(r.routes).toHaveLength(0)
  })
})

describe("parseCommandOutput — ipconfig /all (Russian ru-RU)", () => {
  // The exact paste an operator gets from a Russian-language domain controller,
  // pasted through the cmd.exe prompt (Cyrillic in the path).
  const RU = `C:\\Users\\Администратор>ipconfig /all

Настройка протокола IP для Windows

   Имя компьютера  . . . . . . . . . : dc-net03
   Основной DNS-суффикс  . . . . . . : ABC.QWE-RT.ER
   Тип узла. . . . . . . . . . . . . : Гибридный
   IP-маршрутизация включена . . . . : Нет
   WINS-прокси включен . . . . . . . : Нет
   Порядок просмотра суффиксов DNS . : ABC.QWE-RT.ER

Адаптер Ethernet Net:

   DNS-суффикс подключения . . . . . :
   Описание. . . . . . . . . . . . . : Microsoft Network Adapter Multiplexor Driver
   Физический адрес. . . . . . . . . : 6C-B3-11-28-88-31
   DHCP включен. . . . . . . . . . . : Нет
   Автонастройка включена. . . . . . : Да
   Локальный IPv6-адрес канала . . . : fe80::9d53:6b10:fae5:8e24%8(Основной)
   IPv4-адрес. . . . . . . . . . . . : 15.3.142.32(Основной)
   Маска подсети . . . . . . . . . . : 255.255.255.0
   Основной шлюз. . . . . . . . . : 15.3.142.254
   IAID DHCPv6 . . . . . . . . . . . : 191673105
   DUID клиента DHCPv6 . . . . . . . : 00-01-00-01-2B-1B-5B-98-6C-B3-11-28-88-31
   DNS-серверы. . . . . . . . . . . : 15.3.113.2
                                       15.3.108.1
                                       15.3.108.2
   NetBios через TCP/IP. . . . . . . . : Включен`

  it("imports the interface (name, MAC, CIDR) from the Russian DC paste", () => {
    const r = parseCommandOutput(RU)
    expect(r.command).toBe("ipconfig")
    expect(r.errorCount).toBe(0)
    expect(r.interfaces).toEqual([
      {
        name: "Ethernet Net",
        mac: "6c:b3:11:28:88:31",
        addresses: ["15.3.142.32/24"],
      },
    ])
  })

  it("emits the default gateway as a route, not confusing it with the DNS servers", () => {
    const r = parseCommandOutput(RU)
    // Основной шлюз → route; DNS-серверы (also bare IPv4s) must NOT become routes.
    expect(r.routes).toEqual([
      { destination: "0.0.0.0/0", gateway: "15.3.142.254", interface: "Ethernet Net" },
    ])
  })

  it("extracts the host name and counts interface + route + hostname", () => {
    const r = parseCommandOutput(RU)
    expect(r.hostname).toBe("dc-net03")
    expect(r.usedCount).toBe(3)
  })

  it("skips the link-local IPv6 and the DHCPv6 DUID (not mistaken for a MAC)", () => {
    const r = parseCommandOutput(RU)
    const ll = r.lines.find((l) => l.raw.includes("fe80::"))!
    expect(rolesOf(ll)).toEqual(["skipped"])
    const duid = r.lines.find((l) => l.raw.includes("00-01-00-01"))!
    expect(rolesOf(duid)).toEqual(["skipped"])
  })

  it("every line reassembles verbatim (Cyrillic preserved)", () => {
    const r = parseCommandOutput(RU)
    for (const l of r.lines) expect(reassemble(l)).toBe(l.raw)
  })

  it("excludes a Russian tunnel adapter (Туннельный адаптер)", () => {
    const r = parseCommandOutput(
      `ipconfig /all
Туннельный адаптер isatap.{GUID}:

   Состояние среды. . . . . . . . . : Среда передачи недоступна.
   Физический адрес. . . . . . . . . : 00-00-00-00-00-00-00-E0`,
    )
    expect(r.errorCount).toBe(0)
    expect(r.interfaces).toHaveLength(0)
    expect(r.skippedCount).toBe(1)
  })

  it("drops a media-disconnected Russian adapter", () => {
    const r = parseCommandOutput(
      `ipconfig /all
Адаптер Ethernet Ethernet1:

   Состояние среды. . . . . . . . . : Среда передачи недоступна.
   Физический адрес. . . . . . . . . : 54-BF-64-0A-1B-2C`,
    )
    expect(r.errorCount).toBe(0)
    expect(r.interfaces).toHaveLength(0)
  })

  it("treats an empty Default Gateway as no route", () => {
    const r = parseCommandOutput(
      `ipconfig /all
Ethernet adapter Ethernet0:
   IPv4 Address. . . . . . . . . . . : 10.0.0.5(Preferred)
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . :
   DHCP Server . . . . . . . . . . . : 10.0.0.2`,
    )
    expect(r.errorCount).toBe(0)
    expect(r.routes).toHaveLength(0)
    expect(r.interfaces).toHaveLength(1)
  })

  it("ignores a 0.0.0.0 gateway (no default route configured)", () => {
    const r = parseCommandOutput(
      `ipconfig /all
Ethernet adapter Ethernet0:
   IPv4 Address. . . . . . . . . . . : 10.0.0.5(Preferred)
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . : 0.0.0.0`,
    )
    expect(r.routes).toHaveLength(0)
    expect(r.errorCount).toBe(0)
  })

  it("keeps the gateway of an address-less adapter (route survives the iface drop)", () => {
    // Pathological but possible: no parsable address, yet a real gateway.
    const r = parseCommandOutput(
      `ipconfig /all
Ethernet adapter Ethernet0:
   Default Gateway . . . . . . . . . : 10.0.0.1`,
    )
    expect(r.interfaces).toHaveLength(0)
    expect(r.routes).toEqual([
      { destination: "0.0.0.0/0", gateway: "10.0.0.1", interface: "Ethernet0" },
    ])
  })
})
