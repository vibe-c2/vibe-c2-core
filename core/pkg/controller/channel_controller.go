package controller

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/cache"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/logger"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"
	"github.com/vibe-c2/vibe-c2-golang-protocol/protocol"
	"go.uber.org/zap"
)

// dedupKeyPrefix namespaces channel sync message_id idempotency guards in the
// shared cache.
const dedupKeyPrefix = "channel:sync:msg:"

type IChannelController interface {
	Sync(c *gin.Context)
}

type channelController struct {
	cache cache.Cache
	log   *zap.Logger
}

func NewChannelController(c cache.Cache, log *zap.Logger) IChannelController {
	return &channelController{
		cache: c,
		log:   log,
	}
}

// Sync is the data-plane endpoint a channel module calls per inbound minion
// message. It validates the contract envelope, dedups on message_id, and returns
// a well-formed outbound.minion_message.
//
// Request/response types come from the shared protocol module so core and module
// authors agree on one definition. This is still a skeleton of the channel↔core
// HTTP contract: core does not yet hold minion keys, run a minion factory, or
// decide tasking, so the response always carries an empty/no-op encrypted_data.
// The decrypt → factory → tasking → encrypt pipeline will hang off this handler.
//
//	@Summary		Channel sync (data plane)
//	@Description	Accepts an inbound.minion_message from a channel module and returns an outbound.minion_message. Payloads are opaque encrypted blobs; core currently returns a no-op outbound payload.
//	@Tags			Channels
//	@Accept			json
//	@Produce		json
//	@Param			request	body		protocol.InboundMinionMessage	true	"Inbound minion message"
//	@Success		200		{object}	protocol.OutboundMinionMessage
//	@Failure		400		{object}	responses.ErrorResponse
//	@Router			/channel/sync [post]
func (ctrl *channelController) Sync(c *gin.Context) {
	ctx := c.Request.Context()
	log := logger.From(ctx)

	var req protocol.InboundMinionMessage
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, responses.ErrInvalidInput)
		return
	}

	// Core-side validation per the data-plane contract: require type, message_id,
	// id, encrypted_data, and a parseable RFC3339 timestamp. (Source is a
	// channel-side concern and not required here — see protocol.ValidateInbound
	// for the stricter channel-side profile.)
	if req.Type != protocol.TypeInboundMinionMessage ||
		req.MessageID == "" || req.ID == "" || req.EncryptedData == "" {
		c.JSON(http.StatusBadRequest, responses.ErrInvalidInput)
		return
	}
	if _, err := time.Parse(time.RFC3339, req.Timestamp); err != nil {
		c.JSON(http.StatusBadRequest, responses.ErrInvalidInput)
		return
	}

	// Idempotency guard. SetNX reports false when this message_id was already
	// seen within the dedup window; we still return a valid no-op outbound so
	// the exchange stays idempotent rather than erroring on replay. Fails open
	// when the cache is disabled (noop cache reports every key as new).
	fresh, err := ctrl.cache.SetNX(ctx, dedupKeyPrefix+req.MessageID, "1", cache.TTLChannelSyncDedup)
	if err != nil {
		log.Warn("channel sync: dedup guard failed, processing anyway",
			zap.String("message_id", req.MessageID), zap.Error(err))
	} else if !fresh {
		log.Debug("channel sync: duplicate message_id, returning no-op",
			zap.String("message_id", req.MessageID))
	}

	// Propagate the trace id from the inbound meta when present.
	meta := protocol.MessageMeta{"status": "ok"}
	if traceID, ok := req.Meta["trace_id"].(string); ok && traceID != "" {
		meta["trace_id"] = traceID
	}

	c.JSON(http.StatusOK, protocol.OutboundMinionMessage{
		MessageID:     protocol.NewULID(),
		Type:          protocol.TypeOutboundMinionMessage,
		Version:       protocol.VersionV1,
		Timestamp:     protocol.NowTimestamp(),
		ID:            req.ID,
		EncryptedData: "", // no-op: no tasking pipeline yet
		Meta:          meta,
	})
}
