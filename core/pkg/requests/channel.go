package requests

// Channel ↔ Core data-plane contract (HTTP sync). See
// docs/vibe-c2-docs/src/content/docs/contracts/channel-core-sync.md.
//
// A channel module relays opaque encrypted minion traffic to core. The canonical
// model carried over the wire is only id + encrypted_data; core treats
// encrypted_data as completely opaque (it never decrypts at this layer yet).
const (
	// TypeInboundMinionMessage is the required type for sync request bodies.
	TypeInboundMinionMessage = "inbound.minion_message"
)

// InboundMinionMessage is the POST /api/channel/sync request body.
//
// Presence of type/id/encrypted_data/timestamp is enforced by Gin binding tags;
// the handler additionally validates the type value and that the timestamp is
// RFC3339-parseable.
type InboundMinionMessage struct {
	MessageID     string                `json:"message_id" binding:"required"`
	Type          string                `json:"type" binding:"required"`
	Version       string                `json:"version"`
	Timestamp     string                `json:"timestamp" binding:"required"`
	Source        *InboundMessageSource `json:"source,omitempty"`
	ID            string                `json:"id" binding:"required"`
	EncryptedData string                `json:"encrypted_data" binding:"required"`
	Meta          *InboundMessageMeta   `json:"meta,omitempty"`
}

// InboundMessageSource describes the originating channel module. Informational
// only at this stage; core does not yet act on it.
type InboundMessageSource struct {
	Module         string `json:"module,omitempty"`
	ModuleInstance string `json:"module_instance,omitempty"`
	Transport      string `json:"transport,omitempty"`
	Tenant         string `json:"tenant,omitempty"`
}

// InboundMessageMeta carries optional transport/tracing hints.
type InboundMessageMeta struct {
	ReceiveCount int    `json:"receive_count,omitempty"`
	TraceID      string `json:"trace_id,omitempty"`
}
