package models

import (
	"github.com/google/uuid"
	"github.com/qiniu/qmgo/field"
)

// SchemeNetworkPort represents a network port on a SchemeNetworkPoint.
// Stored as an embedded sub-document within SchemeNetworkPoint (not a separate collection).
type SchemeNetworkPort struct {
	PortID   uuid.UUID `bson:"port_id" json:"port_id"`
	Number   int       `bson:"number" json:"number"`
	Protocol string    `bson:"protocol" json:"protocol"`
	Service  string    `bson:"service" json:"service"`
	Notes    string    `bson:"notes" json:"notes"`
}

// SchemeNetworkPoint represents any network device (server, VM, or any IP-addressable entity)
// within an operation's scheme. Lives in its own MongoDB collection, scoped to an operation
// via OperationID.
//
// The Names field is the only required property — it must contain at least one network
// identifier (IPv4, IPv6, hostname, or domain name). All other fields are optional.
type SchemeNetworkPoint struct {
	field.DefaultField `bson:",inline"`
	PointID            uuid.UUID           `bson:"point_id" json:"point_id"`
	OperationID        uuid.UUID           `bson:"operation_id" json:"operation_id"`
	Names              []string            `bson:"names" json:"names"`
	Description        string              `bson:"description" json:"description"`
	Tags               []string            `bson:"tags" json:"tags"`
	Ports              []SchemeNetworkPort `bson:"ports" json:"ports"`
}
