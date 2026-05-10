# Deploying VibeC2 to a local `kind` cluster

A walkthrough for spinning up the full stack on your laptop in a real
Kubernetes API server, without a cloud provider, persistent volumes, or
a domain name. Useful for studying the chart, reproducing production
issues locally, or smoke-testing changes before pushing.

> Companion to [`values-kind.yaml`](./values-kind.yaml). The values file
> shrinks every component down to laptop-friendly sizes — start there if
> you only want the resource numbers.

---

## 1. Why `kind`?

`kind` ("Kubernetes IN Docker") runs a real, unmodified Kubernetes
cluster as Docker containers. One container per node. The API server is
the same `kube-apiserver` binary you'd hit on EKS or GKE, the kubelet is
the upstream kubelet — there is no cut-down distribution involved.

Compared to alternatives:

| Tool          | What it is                            | Why not for us                                              |
|---------------|---------------------------------------|-------------------------------------------------------------|
| **`kind`**    | Real K8s, in Docker                   | This guide. Closest to prod.                                |
| `k3d`         | k3s (slim K8s) in Docker              | Ships with Traefik. Our nginx-specific Ingress annotations silently no-op. |
| `minikube`    | K8s in a VM                           | Heavier; slower start; another hypervisor to maintain.     |
| `microk8s`    | Snap-installed K8s on the host         | Mutates the host; harder to throw away.                    |
| Docker Desktop | K8s built into Docker Desktop         | Not available on Linux Docker Engine; Mac/Windows only.    |

The big practical win of `kind` is **disposability** — you can
`kind delete cluster` and start over in seconds without touching the host.

## 2. Prerequisites

Install:

```sh
# Manjaro/Arch
sudo pacman -S kind kubectl helm
# (Docker is already installed on this machine.)

# Or any distro: kind ships as a single static binary
# https://kind.sigs.k8s.io/docs/user/quick-start/#installation
```

Verify:

```sh
docker info >/dev/null && echo "docker ok"
kind version
kubectl version --client
helm version
```

You'll also need **at least 4 GB of free RAM** for a comfortable
smoke test (Mongo + Redis + 4 SeaweedFS pods + 3 app pods + the kind
control plane). 6 GB if you also have the dev IDE running.

## 3. Create the cluster

The kind cluster config is committed at
[`deploy/kind/kind-cluster.yaml`](../../kind/kind-cluster.yaml). It
declares a single control-plane node, forwards `:80` and `:443` from
the host into the node container so an in-cluster ingress controller
is reachable from your browser, and labels the node `ingress-ready=true`
so kind's stock ingress-nginx manifest schedules on it.

```sh
kind create cluster --name vibe-c2 --config deploy/kind/kind-cluster.yaml
```

This creates a single-node cluster. `kubectl` is auto-configured to
point at the new context (`kind-vibe-c2`).

> The default `kind` cluster has no Ingress controller — Kubernetes
> doesn't bundle one. Pods can talk to each other, but nothing outside
> the cluster can reach a Service through a hostname. We install one
> next.

## 4. Install the Ingress controller

`kind` publishes a manifest specifically tuned for the
`extraPortMappings` + `node-labels` setup above:

```sh
kubectl apply -f https://kind.sigs.k8s.io/examples/ingress/deploy-ingress-nginx.yaml

kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=180s
```

What this does:

- Creates the `ingress-nginx` namespace
- Deploys the controller as a Deployment with `nodeSelector: ingress-ready=true`
- Exposes it via a `Service` of type `NodePort`, but bound to `:80`/`:443`
  on the host through the kind port mappings — so `curl http://localhost`
  from your laptop hits the controller

Once `kubectl wait` returns, the cluster is ready to terminate HTTP
traffic from your browser.

## 5. Wire a hostname to localhost

The chart's `Ingress` matches by `Host:` header. Browsers won't send the
right header for `localhost`, so add an alias:

```sh
echo '127.0.0.1 vibe-c2.local' | sudo tee -a /etc/hosts
```

Now `http://vibe-c2.local` resolves to `127.0.0.1`, which the kind port
mapping forwards into the cluster, which the ingress controller routes
to our Services by path.

## 6. Install the chart

From the repo root:

```sh
cd deploy/helm/vibe-c2
helm dependency build .

helm install vibe-c2 . \
  -n vibe-c2 --create-namespace \
  -f values-kind.yaml \
  --set secrets.values.jwtSecretKey="$(openssl rand -hex 32)" \
  --set secrets.values.mongoPassword="$(openssl rand -hex 16)" \
  --set secrets.values.redisPassword="$(openssl rand -hex 16)" \
  --set secrets.values.seaweedfsS3SecretKey="$(openssl rand -hex 16)" \
  --set secrets.values.hocuspocusTicketSecret="$(openssl rand -hex 32)" \
  --set secrets.values.hocuspocusWebhookSecret="$(openssl rand -hex 32)"
```

`helm dependency build` resolves `Chart.lock` and pulls the bundled
MongoDB, Redis, and SeaweedFS subcharts into `./charts/`. You only need
to rerun it when `Chart.lock` changes.

`values-kind.yaml` overrides:

- `replicaCount: 1` everywhere (no HA on a single-node cluster)
- 1–2 GiB PVCs (kind's default StorageClass is `rancher.io/local-path`)
- Lighter resource requests
- Disabled PodDisruptionBudgets (single replica = always at minAvailable)
- Longer core `startupProbe` window because cold image pulls + cold Mongo
  add up on a laptop

## 7. Watch it come up

```sh
kubectl -n vibe-c2 get pods -w
```

You'll see roughly this order:

1. `vibe-c2-mongodb-0`         — StatefulSet, ~30 s
2. `vibe-c2-redis-master-0`    — StatefulSet, ~10 s
3. `seaweedfs-master-0`        — StatefulSet, ~15 s
4. `seaweedfs-volume-0`        — depends on master
5. `seaweedfs-filer-0`         — depends on master + volume; this is the slow one (~60 s)
6. `vibe-c2-core-*`            — fails its readiness check until Mongo is up
7. `vibe-c2-frontend-*`        — independent
8. `vibe-c2-hocuspocus-*`      — depends on Mongo
9. `vibe-c2-bucket-bootstrap-*` (Job) — runs once SeaweedFS S3 answers; reaches `Completed`

When everything is `Running` and the Job is `Completed`:

```sh
kubectl -n vibe-c2 get all,ingress,pvc,job
```

## 8. Create the first admin and log in

```sh
curl -fsSL -X POST http://vibe-c2.local/api/v1/enroll \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"adminadmin","email":"a@b.c"}'
```

Then open <http://vibe-c2.local> in a browser and log in.

## 9. Smoke tests

### Health endpoint (no auth)

```sh
curl -fsSL http://vibe-c2.local/api/v1/status
```

### GraphQL playground

In dev mode the chart still renders Altair at `GET /api/v1/graphql`.
Open <http://vibe-c2.local/api/v1/graphql> in a browser.

### WebSocket upgrade

Open the wiki in two browser tabs and start typing in one. The other
should mirror within ~200 ms — that's the round trip
`browser → ingress → /api/v1/ws/wiki/ → hocuspocus → MongoDB Y.Doc → back`.

If you only see one direction sync, it's an Ingress WebSocket annotation
issue — check `kubectl describe ingress -n vibe-c2`.

### Image upload

In the wiki editor, paste an image. The first upload validates the
SeaweedFS bucket bootstrap and the core's S3 credentials path end-to-end.

## 10. Common issues

| Symptom                                                         | Cause                                                                                                                              | Fix                                                                                                                                                          |
|-----------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `bucket-bootstrap` Job is `Failed` after 6 retries              | SeaweedFS S3 hadn't started by the time mc tried `mb`                                                                              | `kubectl -n vibe-c2 delete job vibe-c2-bucket-bootstrap` then `helm upgrade vibe-c2 . -f values-kind.yaml --reset-then-reuse-values` to recreate it          |
| `core` pod CrashLoopBackOff with `MONGO_URI is not set`         | Secret didn't render (likely missing `--set secrets.values.*`)                                                                     | `kubectl -n vibe-c2 get secret vibe-c2-vibe-c2-secrets -o yaml` and confirm all keys exist                                                                  |
| 401/403 on every authenticated request after login              | Browser dropped `Secure` cookies on http://. Default chart values ship `appStageStatus=production` which sets `Secure: true`.      | `values-kind.yaml` overrides `core.config.appStageStatus=development` for HTTP. Make sure your install uses it.                                              |
| 500 on Outline import (`/api/v1/wiki/import/outline`)           | `/tmp` was read-only because `securityContext.readOnlyRootFilesystem: true`                                                        | Chart now mounts an `emptyDir` at `/tmp`. Bump `core.tmpSizeLimit` if you upload zips bigger than ~256 MiB.                                                  |
| Login UI hits `/undefined/status`                               | `VITE_API_URL` was missing at frontend build time, Vite inlined the literal `undefined`                                            | Make sure the `:main` image was built after committing `frontend/.env.production` and the `frontend/.dockerignore` change                                   |
| `helm install` fails with `missing dependencies`                | Forgot `helm dependency build`                                                                                                     | Run it from the chart directory before `helm install`                                                                                                       |
| `helm install` fails with `Unrecognized images`                 | Bitnami DockerHub deprecation; chart references `bitnamilegacy/*` mirror                                                            | Already handled via `global.security.allowInsecureImages: true` in `values.yaml`. If the error returns, the bitnami chart was upgraded — re-pin or revert.   |
| Pods stuck in `Pending` with `0/1 nodes available: insufficient memory` | Laptop is out of RAM                                                                                                          | Free ~2 GB or set `seaweedfs.enabled=false` and disable image upload smoke tests                                                                             |
| `vibe-c2.local` returns `default backend - 404`                 | Ingress controller is up but didn't pick up our Ingress yet                                                                        | Wait 10 s; if it persists, `kubectl describe ingress -n vibe-c2`                                                                                            |

## 11. Iterating on the chart

After editing templates or values:

```sh
helm upgrade vibe-c2 . -n vibe-c2 -f values-kind.yaml --reuse-values
```

`--reuse-values` keeps the `--set` flags from `helm install` so you don't
have to retype the secrets on every upgrade. To override a single value:

```sh
helm upgrade vibe-c2 . -n vibe-c2 -f values-kind.yaml --reuse-values \
  --set core.image.tag=sha-abcd123
```

To preview without applying:

```sh
helm template vibe-c2 . -f values-kind.yaml \
  --set secrets.values.jwtSecretKey=x ...   # the same --set flags
| less
```

## 12. Tear down

```sh
kind delete cluster --name vibe-c2
sudo sed -i '/vibe-c2.local/d' /etc/hosts
```

That's the whole cleanup — `kind delete` removes the Docker container,
which carries the entire cluster state with it. PVCs, Pods, ConfigMaps,
Secrets — gone. No leftover state on the host.

---

## What this exercise actually proves

A green smoke test on `kind` confirms:

- The chart renders without missing values
- Inter-pod DNS resolves (`<release>-mongodb`, `<release>-redis-master`, `seaweedfs-s3`)
- The shared Secret is wired correctly to both subcharts and our pods
- Ingress path order routes WebSocket → hocuspocus, REST → core, SPA → frontend
- The bucket bootstrap Job reaches `Completed`
- The core's startup ordering against Mongo/Redis/SeaweedFS is correct

It does **not** prove:

- Multi-node scheduling, anti-affinity, or PDB behavior
- HA / rolling-upgrade behavior under load
- TLS termination (kind uses HTTP)
- Real-world StorageClass behavior (kind uses the local-path provisioner)
- Network policies (kind has no CNI policy enforcement by default)

For those, run on a real cluster with the production values file.
