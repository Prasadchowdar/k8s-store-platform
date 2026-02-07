{{/*
Expand the name of the chart.
*/}}
{{- define "store-platform.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "store-platform.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "store-platform.labels" -}}
helm.sh/chart: {{ include "store-platform.name" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Backend image
*/}}
{{- define "store-platform.backendImage" -}}
{{- if .Values.global.imageRegistry }}
{{- printf "%s%s:%s" .Values.global.imageRegistry .Values.backend.image.repository .Values.backend.image.tag }}
{{- else }}
{{- printf "%s:%s" .Values.backend.image.repository .Values.backend.image.tag }}
{{- end }}
{{- end }}

{{/*
Frontend image
*/}}
{{- define "store-platform.frontendImage" -}}
{{- if .Values.global.imageRegistry }}
{{- printf "%s%s:%s" .Values.global.imageRegistry .Values.frontend.image.repository .Values.frontend.image.tag }}
{{- else }}
{{- printf "%s:%s" .Values.frontend.image.repository .Values.frontend.image.tag }}
{{- end }}
{{- end }}
