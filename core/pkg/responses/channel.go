package responses

// Channel ↔ Core data-plane contract (HTTP sync) response side. See
// docs/vibe-c2-docs/src/content/docs/contracts/channel-core-sync.md.
const (
	// TypeOutboundMinionMessage is the type stamped on sync response bodies.
	TypeOutboundMinionMessage = "outbound.minion_message"

	// ChannelContractVersion is the data-plane contract version core speaks.
	ChannelContractVersion = "1.0"
)

// OutboundMinionMessage is the POST /api/channel/sync response body.
//
// It exposes only one payload field: EncryptedData, which is opaque to the
// channel. When no work is pending for the id, core returns an empty/no-op
// EncryptedData (the field is present but empty).
type OutboundMinionMessage struct {
	MessageID     string              `json:"message_id"`
	Type          string              `json:"type"`
	Version       string              `json:"version"`
	Timestamp     string              `json:"timestamp"`
	ID            string              `json:"id"`
	EncryptedData string              `json:"encrypted_data"`
	Meta          OutboundMessageMeta `json:"meta"`
}

// OutboundMessageMeta carries the processing status and propagated trace id.
type OutboundMessageMeta struct {
	Status  string `json:"status"`
	TraceID string `json:"trace_id,omitempty"`
}
