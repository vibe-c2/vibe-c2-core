package controller

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/cache"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/logger"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/requests"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"
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
// This is a skeleton of the channel↔core HTTP contract: core does not yet hold
// minion keys, run a minion factory, or decide tasking, so the response always
// carries an empty/no-op encrypted_data. The decrypt → factory → tasking →
// encrypt pipeline will hang off this handler later.
//
//	@Summary		Channel sync (data plane)
//	@Description	Accepts an inbound.minion_message from a channel module and returns an outbound.minion_message. Payloads are opaque encrypted blobs; core currently returns a no-op outbound payload.
//	@Tags			Channels
//	@Accept			json
//	@Produce		json
//	@Param			request	body		requests.InboundMinionMessage	true	"Inbound minion message"
//	@Success		200		{object}	responses.OutboundMinionMessage
//	@Failure		400		{object}	responses.ErrorResponse
//	@Router			/channel/sync [post]
func (ctrl *channelController) Sync(c *gin.Context) {
	ctx := c.Request.Context()
	log := logger.From(ctx)

	var req requests.InboundMinionMessage
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, responses.ErrInvalidInput)
		return
	}

	if req.Type != requests.TypeInboundMinionMessage {
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

	var traceID string
	if req.Meta != nil {
		traceID = req.Meta.TraceID
	}

	c.JSON(http.StatusOK, responses.OutboundMinionMessage{
		MessageID:     uuid.NewString(),
		Type:          responses.TypeOutboundMinionMessage,
		Version:       responses.ChannelContractVersion,
		Timestamp:     time.Now().UTC().Format("2006-01-02T15:04:05.000Z07:00"),
		ID:            req.ID,
		EncryptedData: "", // no-op: no tasking pipeline yet
		Meta: responses.OutboundMessageMeta{
			Status:  "ok",
			TraceID: traceID,
		},
	})
}
