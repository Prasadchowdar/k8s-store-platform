{{/*
Common labels for store resources
*/}}
{{- define "woocommerce-store.labels" -}}
app.kubernetes.io/managed-by: store-platform
store-platform/store-slug: {{ .Values.store.slug }}
{{- end }}
