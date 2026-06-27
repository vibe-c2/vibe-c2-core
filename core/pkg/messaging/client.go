package messaging

import (
	"fmt"
	"net/url"

	"github.com/wagslane/go-rabbitmq"
	"go.uber.org/zap"
)

// Config holds the connection parameters for the AMQP broker. Values originate
// from environment (APP_RABBITMQ_*).
type Config struct {
	Host     string
	Port     string
	User     string
	Password string
	VHost    string
}

// amqpURL builds the broker URL, percent-escaping credentials so passwords
// containing reserved characters dial cleanly.
func (c Config) amqpURL() string {
	vhost := c.VHost
	if vhost == "/" {
		vhost = "" // amqp://host:port/ already means the default vhost "/"
	}
	u := url.URL{
		Scheme: "amqp",
		User:   url.UserPassword(c.User, c.Password),
		Host:   fmt.Sprintf("%s:%s", c.Host, c.Port),
		Path:   "/" + vhost,
	}
	return u.String()
}

// Client wraps a wagslane *rabbitmq.Conn with auto-reconnect. Construction
// fails on the initial dial so the caller (app.go) can degrade gracefully —
// the broker being unavailable is non-fatal for the rest of core.
type Client struct {
	conn   *rabbitmq.Conn
	logger *zap.Logger
}

// NewClient dials the broker. An error here means modules cannot register yet;
// the caller is expected to log a warning and continue without the RPC server.
func NewClient(cfg Config, logger *zap.Logger) (*Client, error) {
	conn, err := rabbitmq.NewConn(
		cfg.amqpURL(),
		rabbitmq.WithConnectionOptionsLogger(newZapLogger(logger)),
	)
	if err != nil {
		return nil, fmt.Errorf("dial rabbitmq: %w", err)
	}
	return &Client{conn: conn, logger: logger}, nil
}

// Conn exposes the underlying connection for building consumers/publishers.
func (c *Client) Conn() *rabbitmq.Conn { return c.conn }

// Close tears down the connection.
func (c *Client) Close() error {
	if c == nil || c.conn == nil {
		return nil
	}
	return c.conn.Close()
}

// zapLogger adapts our *zap.Logger to wagslane's rabbitmq.Logger interface so
// broker-internal reconnect/recovery chatter lands in the structured log.
type zapLogger struct{ l *zap.Logger }

func newZapLogger(l *zap.Logger) rabbitmq.Logger {
	return &zapLogger{l: l.With(zap.String("component", "rabbitmq"))}
}

func (z *zapLogger) Fatalf(format string, args ...any) {
	z.l.Error(fmt.Sprintf(format, args...))
}
func (z *zapLogger) Errorf(format string, args ...any) {
	z.l.Error(fmt.Sprintf(format, args...))
}
func (z *zapLogger) Warnf(format string, args ...any) {
	z.l.Warn(fmt.Sprintf(format, args...))
}
func (z *zapLogger) Infof(format string, args ...any) {
	z.l.Info(fmt.Sprintf(format, args...))
}
func (z *zapLogger) Debugf(format string, args ...any) {
	z.l.Debug(fmt.Sprintf(format, args...))
}
