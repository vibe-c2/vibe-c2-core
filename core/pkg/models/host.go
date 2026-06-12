package models

import (
	"github.com/google/uuid"
	"github.com/qiniu/qmgo/field"
)

// Interface is a single network interface on a discovered Host. It is stored as
// an embedded sub-document (not a separate collection), the same convention as
// CredentialKey/CredentialProperty.
//
// Addresses are recorded in CIDR form ("10.0.5.12/24"), not as bare IPs. The
// prefix length is what lets the frontend cluster hosts into subnets: two hosts
// with an address in the same network are on the same L2/L3 segment, which is
// the backbone of the derived topology. Without the mask there is no segment to
// derive.
type Interface struct {
	Name      string   `bson:"name"      json:"name"`      // e.g. "eth0"
	MAC       string   `bson:"mac"       json:"mac"`       // hardware address, optional
	Addresses []string `bson:"addresses" json:"addresses"` // CIDR form, e.g. "10.0.5.12/24"
}

// Route is a single routing-table entry on a discovered Host. Embedded
// sub-document, like Interface.
//
// Routes are what reveal the pivots in a topology: a route's Gateway is the
// next-hop IP used to reach Destination. When that gateway IP is owned by
// another recorded Host, the frontend draws a directed edge through it — that's
// how routers and dual-homed boxes surface. A default route uses Destination
// "0.0.0.0/0".
type Route struct {
	Destination string `bson:"destination" json:"destination"` // CIDR, "0.0.0.0/0" = default
	Gateway     string `bson:"gateway"     json:"gateway"`     // next-hop IP
	Interface   string `bson:"interface"   json:"interface"`   // optional exiting iface name
}

// Login is a user footprint observed on a Host, parsed from `last` output.
// Embedded sub-document, like Interface and Route.
//
// Where interfaces reveal segments and routes reveal network pivots, logins
// reveal the IDENTITY layer: the same username seen on two hosts is a
// credential-reuse lead, and the From field — the source host a session
// originated from — is an observed access path (A → user → B). The frontend
// derives an identity graph from these the same way it derives segments and
// pivots: nodes for users, edges to the hosts they logged into and the hosts
// they came from. Nothing about the relation is stored — it is recomputed from
// this data, so it can never go stale.
type Login struct {
	User     string `bson:"user"      json:"user"`      // account name, e.g. "root", "alice"
	From     string `bson:"from"      json:"from"`      // source host/IP the session came from; empty for local logins
	TTY      string `bson:"tty"       json:"tty"`       // line/terminal, e.g. "pts/0"; optional
	LastSeen string `bson:"last_seen" json:"last_seen"` // free-text login time from `last`; optional
	Count    int    `bson:"count"     json:"count"`     // sessions collapsed into this (user, from) footprint
}

// Host is a discovered machine recorded by operators against an operation's
// target network. It carries just enough structure — interfaces (segments),
// routes (pivots), and logins (identity footprints) — for the frontend to
// derive a network topology. Edges are never stored: they are computed from
// this data, so the graph can never go stale relative to its hosts.
type Host struct {
	field.DefaultField `bson:",inline"`
	HostID             uuid.UUID   `bson:"host_id"       json:"host_id"`
	OperationID        uuid.UUID   `bson:"operation_id"  json:"operation_id"`
	Hostname           string      `bson:"hostname"      json:"hostname"`
	Interfaces         []Interface `bson:"interfaces"    json:"interfaces"`
	Routes             []Route     `bson:"routes"        json:"routes"`
	Logins             []Login     `bson:"logins"        json:"logins"`
	OS                 string      `bson:"os"            json:"os"` // free-text fingerprint, e.g. "Windows Server 2019"
	// Visual identity, same triple as WikiDocument: an emoji glyph OR a lucide
	// icon name, plus an optional color for the icon variant. When emoji and
	// icon are both empty the frontend derives a glyph from the OS field
	// (linux/windows/generic server) — that derivation is presentation, so it
	// is never persisted here.
	Emoji       string    `bson:"emoji"         json:"emoji"`
	Icon        string    `bson:"icon"          json:"icon"`
	Color       string    `bson:"color"         json:"color"`
	CreatedByID uuid.UUID `bson:"created_by_id" json:"created_by_id"`
}
