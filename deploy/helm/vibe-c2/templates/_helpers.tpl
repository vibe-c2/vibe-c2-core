{{/*
Expand the chart name.
*/}}
{{- define "vibe-c2.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Fully qualified app name. Combines release + chart name unless overridden.
*/}}
{{- define "vibe-c2.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Component-scoped names. Used as Service / Deployment names so each pod
group is independently addressable.
*/}}
{{- define "vibe-c2.core.fullname" -}}
{{- printf "%s-core" (include "vibe-c2.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "vibe-c2.frontend.fullname" -}}
{{- printf "%s-frontend" (include "vibe-c2.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "vibe-c2.hocuspocus.fullname" -}}
{{- printf "%s-hocuspocus" (include "vibe-c2.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common chart labels — applied to every resource the chart owns.
*/}}
{{- define "vibe-c2.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
app.kubernetes.io/name: {{ include "vibe-c2.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: vibe-c2
{{- end -}}

{{/*
Per-component selector labels. Stable across upgrades — never include
chart version or other rolling values here.
*/}}
{{- define "vibe-c2.core.selectorLabels" -}}
app.kubernetes.io/name: {{ include "vibe-c2.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: core
{{- end -}}

{{- define "vibe-c2.frontend.selectorLabels" -}}
app.kubernetes.io/name: {{ include "vibe-c2.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: frontend
{{- end -}}

{{- define "vibe-c2.hocuspocus.selectorLabels" -}}
app.kubernetes.io/name: {{ include "vibe-c2.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: hocuspocus
{{- end -}}

{{/*
Resolve the image reference, applying global.imageRegistry if set so
operators mirroring images to a private registry only override one value.
*/}}
{{- define "vibe-c2.image" -}}
{{- $img := .image -}}
{{- $tag := default .root.Chart.AppVersion $img.tag -}}
{{- $registry := .root.Values.global.imageRegistry -}}
{{- if $registry -}}
{{- $repo := $img.repository | trimPrefix "ghcr.io/" | trimPrefix "docker.io/" -}}
{{- printf "%s/%s:%s" $registry $repo $tag -}}
{{- else -}}
{{- printf "%s:%s" $img.repository $tag -}}
{{- end -}}
{{- end -}}

{{/*
Name of the application Secret. When secrets.existingSecret is set we
defer to that name; otherwise we render and own the Secret ourselves.

The "owned" name uses a fixed `<release>-vibe-c2-secrets` shape so the
bitnami subcharts can reproduce it in their `auth.existingSecret`
field via `tpl` (subchart helpers cannot reach into vibe-c2.fullname).
*/}}
{{- define "vibe-c2.appSecretName" -}}
{{- if .Values.secrets.existingSecret -}}
{{- .Values.secrets.existingSecret -}}
{{- else -}}
{{- printf "%s-vibe-c2-secrets" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{/*
ConfigMap name (non-secret env).
*/}}
{{- define "vibe-c2.configName" -}}
{{- printf "%s-config" (include "vibe-c2.fullname" .) -}}
{{- end -}}

{{/*
Image-pull secret list — merged from global.imagePullSecrets.
*/}}
{{- define "vibe-c2.imagePullSecrets" -}}
{{- with .Values.global.imagePullSecrets -}}
imagePullSecrets:
{{ toYaml . | indent 2 }}
{{- end -}}
{{- end -}}

{{/*
Hostnames for backend services. When the matching subchart is enabled
we point at its in-cluster Service; otherwise we trust external.* values.
*/}}
{{- define "vibe-c2.mongo.host" -}}
{{- if .Values.mongodb.enabled -}}
{{- printf "%s-mongodb" .Release.Name -}}
{{- else -}}
{{- required "external.mongodb.host is required when mongodb.enabled=false" .Values.external.mongodb.host -}}
{{- end -}}
{{- end -}}

{{- define "vibe-c2.mongo.port" -}}
{{- if .Values.mongodb.enabled -}}27017{{- else -}}{{ .Values.external.mongodb.port | default 27017 }}{{- end -}}
{{- end -}}

{{- define "vibe-c2.redis.host" -}}
{{- if .Values.redis.enabled -}}
{{- printf "%s-redis-master" .Release.Name -}}
{{- else -}}
{{- required "external.redis.host is required when redis.enabled=false" .Values.external.redis.host -}}
{{- end -}}
{{- end -}}

{{- define "vibe-c2.redis.port" -}}
{{- if .Values.redis.enabled -}}6379{{- else -}}{{ .Values.external.redis.port | default 6379 }}{{- end -}}
{{- end -}}

{{/*
SeaweedFS S3 endpoint URL. The bundled chart hardcodes the Service name
to `seaweedfs-s3` (NOT release-prefixed) — see
charts/seaweedfs/templates/s3-service.yaml. As a side-effect, two
vibe-c2 releases cannot share a namespace when both bundle SeaweedFS;
deploy each release into its own namespace, or set seaweedfs.enabled=false
on all but one release and point the others at the shared external
endpoint.
*/}}
{{- define "vibe-c2.seaweedfs.s3Endpoint" -}}
{{- if .Values.seaweedfs.enabled -}}
{{- printf "http://seaweedfs-s3.%s.svc.cluster.local:8333" .Release.Namespace -}}
{{- else -}}
{{- required "external.seaweedfs.s3Endpoint is required when seaweedfs.enabled=false" .Values.external.seaweedfs.s3Endpoint -}}
{{- end -}}
{{- end -}}

{{/*
In-cluster Service hostname for the hocuspocus internal HTTP API.
Used by core to call the disconnect / markdown-to-yjs endpoints.
*/}}
{{- define "vibe-c2.hocuspocus.internalUrl" -}}
{{- printf "http://%s:%d" (include "vibe-c2.hocuspocus.fullname" .) (int .Values.hocuspocus.httpPort) -}}
{{- end -}}

{{/*
URL hocuspocus posts onConnect/onDisconnect webhooks back to.
*/}}
{{- define "vibe-c2.core.webhookUrl" -}}
{{- printf "http://%s:%d/api/v1/internal/wiki/webhook" (include "vibe-c2.core.fullname" .) (int .Values.core.service.port) -}}
{{- end -}}
