package session

import (
	"github.com/gin-gonic/gin"
	"github.com/mssola/useragent"
)

// Meta holds request metadata captured at authentication time.
type Meta struct {
	IPAddress string
	UserAgent string
	Browser   string // e.g. "Chrome 120"
	OS        string // e.g. "macOS 14.2"
	Device    string // "Desktop", "Mobile", "Bot", or "Unknown"
}

// Extract captures session metadata from the current HTTP request.
// Uses Gin's ClientIP (respects X-Forwarded-For via trusted proxies)
// and parses the User-Agent header for browser/OS/device information.
func Extract(c *gin.Context) Meta {
	rawUA := c.Request.UserAgent()
	ua := useragent.New(rawUA)

	browserName, browserVersion := ua.Browser()
	browser := browserName
	if browserVersion != "" {
		browser = browserName + " " + browserVersion
	}

	osInfo := ua.OS()

	device := classifyDevice(ua)

	return Meta{
		IPAddress: c.ClientIP(),
		UserAgent: rawUA,
		Browser:   browser,
		OS:        osInfo,
		Device:    device,
	}
}

func classifyDevice(ua *useragent.UserAgent) string {
	if ua.Bot() {
		return "Bot"
	}
	if ua.Mobile() {
		return "Mobile"
	}
	// The mssola/useragent library doesn't distinguish tablet from desktop,
	// so we default to "Desktop" for non-mobile, non-bot agents.
	return "Desktop"
}
