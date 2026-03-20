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
)

func GetTTLForKey(cacheKey string) time.Duration {
	if strings.Contains(cacheKey, ":list") || strings.Contains(cacheKey, ":page:") {
		return TTLPaginated
	}
	return TTLDefault
}
