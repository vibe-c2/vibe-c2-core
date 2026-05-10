# vibe-c2 Helm chart

Deploys the entire VibeC2 stack — Go API, React frontend, Hocuspocus
collab sidecar, plus MongoDB, Redis, and SeaweedFS — into a single
Kubernetes namespace.

```
ingress (host: vibe-c2.example.com)
  ├── /                   → frontend (nginx + SPA)
  ├── /api/               → core (Go REST + GraphQL + SSE)
  ├── /api/v1/ws/wiki/    → hocuspocus (WebSocket, Yjs collab)
  └── /swagger/           → core (Swagger UI)

cluster-internal
  ├── core ←→ mongodb, redis, seaweedfs-s3
  ├── hocuspocus ←→ mongodb (Y.Doc snapshots)
  └── core → hocuspocus:1235 (disconnect / markdown-to-yjs)
     hocuspocus → core:8002 (onConnect/onDisconnect webhooks)
```

## Requirements

- Kubernetes 1.26+
- An ingress controller — defaults assume **ingress-nginx**
- A default `StorageClass`, or one set explicitly via `global.storageClass`
- Helm 3.14+

## Quick start

```sh
# Pull subchart dependencies into ./charts/
helm dependency build ./deploy/helm/vibe-c2

# Install with inline secrets (dev only)
helm install vibe-c2 ./deploy/helm/vibe-c2 \
  --namespace vibe-c2 --create-namespace \
  --set ingress.host=vibe-c2.lab.local \
  --set secrets.values.jwtSecretKey="$(openssl rand -hex 32)" \
  --set secrets.values.mongoPassword="$(openssl rand -hex 24)" \
  --set secrets.values.redisPassword="$(openssl rand -hex 24)" \
  --set secrets.values.seaweedfsS3SecretKey="$(openssl rand -hex 24)" \
  --set secrets.values.hocuspocusTicketSecret="$(openssl rand -hex 32)" \
  --set secrets.values.hocuspocusWebhookSecret="$(openssl rand -hex 32)"

# Then: enroll the first admin
curl -X POST http://vibe-c2.lab.local/api/v1/enroll \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"<strong>","email":"you@example.com"}'
```

For local kind testing, see [`README.kind.md`](./README.kind.md) and
the kind-tuned overrides at [`values-kind.yaml`](./values-kind.yaml).
For production, use the example file at
[`values-production.example.yaml`](./values-production.example.yaml) and
manage secrets through `secrets.existingSecret`.

## Architecture decisions baked into the chart

### Single host, path-based routing
The frontend's `VITE_API_URL` is the relative path `/api/v1`, so the
SPA, REST/GraphQL, and the Yjs WebSocket are all served from the same
origin. The Ingress routes by path. WebSocket upgrades flow through
`/api/v1/ws/wiki/` to the hocuspocus Service.

### MONGO_URI is composed in-pod
`MONGO_URI` is built from `MONGO_HOST` + `MONGO_PORT` (ConfigMap) and
`MONGO_INITDB_ROOT_USERNAME` + `MONGO_INITDB_ROOT_PASSWORD` (Secret).
This keeps the password out of the ConfigMap while still letting
operators override the host for an external Mongo.

### Hocuspocus runs as a single replica
Hocuspocus holds Y.Doc state in process memory. Two replicas without
sticky sessions cause split-brain editing. The chart pins
`replicaCount: 1` and uses `Recreate` strategy. To scale, you need a
sticky-session ingress AND a document-affinity routing layer — out of
scope for this chart.

### Bucket bootstrap is an async Job, not a hook
SeaweedFS does not pre-create S3 buckets. The chart ships a Job that
runs `mc mb` against the filer's S3 endpoint to ensure `wiki-images`
and `wiki-files` exist before the first upload. The Job is idempotent
(`--ignore-existing`) and retries while SeaweedFS warms up
(`backoffLimit: 6` plus an in-script wait loop).

It is intentionally **not** a `helm.sh/hook` — wrapping it in a
post-install hook makes `helm install` block for 3–5 minutes on a cold
cluster while SeaweedFS settles, with no helm-side output. Running it
as a regular Job lets `helm install` return immediately; broken
bootstrap surfaces as a `Failed` Job from `kubectl get jobs`. Re-run
after fixing the cause with `kubectl delete job ...-bucket-bootstrap`
followed by `helm upgrade`.

### App Secret is the source of truth
The bitnami MongoDB and Redis subcharts read passwords from the same
Secret the app uses (`mongodb-root-password`, `mongodb-passwords`,
`redis-password` keys are duplicated in `templates/secret.yaml` to match
their conventions). One rotation point.

### RabbitMQ is not deployed
The compose file ships RabbitMQ, but the Go core does not consume it —
the import sites in `core/pkg/app/app.go` are commented out. When wiring
RabbitMQ in, add it as another subchart dependency here.

### Bitnami images come from `bitnamilegacy/*`
In August 2025 Bitnami restricted public access to `docker.io/bitnami/*`
([bitnami/charts#35164](https://github.com/bitnami/charts/issues/35164)).
The freely-pullable images now live at `docker.io/bitnamilegacy/*`. Our
`mongodb:` and `redis:` value blocks override `image.repository` and
`volumePermissions.image.repository` to the legacy mirror. We also set
`global.security.allowInsecureImages: true` because the bitnami chart
NOTES.txt aborts rendering when the image registry isn't on its hardcoded
allowlist. The override is safe — the legacy mirror serves the same
images Bitnami used to publish at the original path.

### Frontend image must be rebuilt from the current `frontend/` tree
`VITE_API_URL` is inlined into the SPA bundle by Vite at build time. The
chart pulls `ghcr.io/vibe-c2/vibe-c2-frontend:main`, so the published
image must be built from a tree that contains both
`frontend/.env.production` (committed; carries `VITE_API_URL=/api/v1`)
and the `frontend/.dockerignore` change that lets `.env.production`
flow into the docker build context. If either is missing at image-build
time, Vite inlines the literal string `undefined` and the SPA hits
`/undefined/status`. The CI workflow at
`.github/workflows/publish-frontend.yml` produces the right image as
long as those two files are committed.

## Bring-your-own infrastructure

To use an existing MongoDB / Redis / SeaweedFS:

```yaml
mongodb:
  enabled: false
external:
  mongodb:
    host: mongo.shared.svc.cluster.local
    port: 27017

redis:
  enabled: false
external:
  redis:
    host: redis.shared.svc.cluster.local
    port: 6379

seaweedfs:
  enabled: false
external:
  seaweedfs:
    s3Endpoint: http://seaweedfs.shared.svc.cluster.local:8333
```

Credentials still come from `secrets.values` or `secrets.existingSecret`.

## Values reference (high-traffic keys)

| Path | Description |
|------|-------------|
| `ingress.host` | Public hostname; required for browser access |
| `ingress.tls.enabled` | Terminate TLS at the ingress (recommended for production) |
| `ingress.tls.secretName` | Name of the TLS secret in the release namespace |
| `core.image.tag` / `frontend.image.tag` / `hocuspocus.image.tag` | Pin to a specific build; defaults to chart `appVersion` |
| `core.replicaCount` / `frontend.replicaCount` | Horizontal scale |
| `secrets.existingSecret` | Read all app secrets from a Secret you manage |
| `secrets.values.*` | Inline secret values (development only) |
| `global.storageClass` | StorageClass applied to all PVCs |
| `mongodb.persistence.size` / `redis.master.persistence.size` / `seaweedfs.*.data.size` | PVC sizing |
| `external.*` | Connection details when subcharts are disabled |

The full surface lives in [`values.yaml`](./values.yaml).

## Troubleshooting

```sh
# Render templates without applying
helm template vibe-c2 ./deploy/helm/vibe-c2 -f my-values.yaml | less

# Chart lint
helm lint ./deploy/helm/vibe-c2

# Inspect what was deployed
kubectl -n vibe-c2 get all,ingress,configmap,secret,pvc,job

# Pod logs
kubectl -n vibe-c2 logs -l app.kubernetes.io/component=core --tail=200
kubectl -n vibe-c2 logs -l app.kubernetes.io/component=hocuspocus --tail=200

# If the bucket bootstrap Job failed, re-run it
kubectl -n vibe-c2 delete job vibe-c2-bucket-bootstrap
helm upgrade vibe-c2 ./deploy/helm/vibe-c2 -f my-values.yaml
```

### "MONGO_URI is not set" on core startup
The chart composes `MONGO_URI` from envvars, so this means the Pod could
not resolve `MONGO_HOST`, or the Secret keys are missing. Check:

```sh
kubectl -n vibe-c2 get cm,secret
kubectl -n vibe-c2 describe pod -l app.kubernetes.io/component=core
```

### Hocuspocus disconnects every few seconds
Almost always an ingress configuration issue. Confirm:
- `nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"` is on the Ingress
- The `/api/v1/ws/wiki/` path matches BEFORE `/api/`
- `ingressClassName` matches your controller

## Updating subchart pins

```sh
helm dependency update ./deploy/helm/vibe-c2
```

Then commit the regenerated `Chart.lock`.
