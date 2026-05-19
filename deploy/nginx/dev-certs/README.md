# Dev TLS certs

Self-signed cert for `localhost` (and `127.0.0.1`), used by the dev nginx in
`docker-compose.yml` to terminate TLS so the browser sees HTTPS and HTTP/2.

Browsers will flag it as untrusted on first visit. Click through the warning
once (or `chrome://flags/#allow-insecure-localhost` for Chrome).

Regenerate with:

```bash
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 3650 \
  -keyout localhost.key -out localhost.crt \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,DNS:vibec2.local,IP:127.0.0.1,IP:::1" \
  -addext "keyUsage=digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth"
```

These are committed because they're a non-secret dev convenience. Never use
them in production — production gets real certs at the LB or via cert-manager.
