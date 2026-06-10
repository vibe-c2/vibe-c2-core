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

// Host is a discovered machine recorded by operators against an operation's
// target network. It carries just enough structure — interfaces (segments) and
// routes (pivots) — for the frontend to derive a network topology. Edges are
// never stored: they are computed from this data, so the graph can never go
// stale relative to its hosts.
type Host struct {
	field.DefaultField `bson:",inline"`
	HostID             uuid.UUID   `bson:"host_id"       json:"host_id"`
	OperationID        uuid.UUID   `bson:"operation_id"  json:"operation_id"`
	Hostname           string      `bson:"hostname"      json:"hostname"`
	Interfaces         []Interface `bson:"interfaces"    json:"interfaces"`
	Routes             []Route     `bson:"routes"        json:"routes"`
	OS                 string      `bson:"os"            json:"os"` // free-text fingerprint, e.g. "Windows Server 2019"
	CreatedByID        uuid.UUID   `bson:"created_by_id" json:"created_by_id"`
}
