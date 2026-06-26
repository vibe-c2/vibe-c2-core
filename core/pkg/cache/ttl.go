package cache

import (
	"strings"
	"time"
)

const (
	// TTLStatic - for rarely changing data (options, providers)
	TTLStatic = 24 * time.Hour

	// TTLPaginated - for lists with pagination
	TTLPaginated = 15 * time.Minute

	// TTLSingle - for single items
	TTLSingle = 10 * time.Minute

	// TTLDynamic - for frequently changing data
	TTLDynamic = 5 * time.Minute

	// TTLDefault - default TTL for cache keys
	TTLDefault = TTLSingle

	// TTLChannelSyncDedup - retention window for channel sync message_id dedup
	// guards. Bounds replay protection for the data-plane sync endpoint.
	TTLChannelSyncDedup = 24 * time.Hour
)

func GetTTLForKey(cacheKey string) time.Duration {
	if strings.Contains(cacheKey, ":list") || strings.Contains(cacheKey, ":page:") {
		return TTLPaginated
	}
	return TTLDefault
}
