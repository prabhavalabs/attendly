# syntax=docker/dockerfile:1

# --- build stage: produce a static, CGO-free binary -------------------------
FROM golang:1.25-alpine AS build
WORKDIR /src

# Cache modules first.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
# modernc.org/sqlite is pure Go, so CGO can stay off → fully static binary.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/attendly-api ./cmd/server

# Pre-create the data dir so the named volume inherits nonroot ownership
# (distroless has no shell, so we can't mkdir/chown in the final stage).
RUN mkdir -p /data/assets

# --- runtime stage: distroless, non-root ------------------------------------
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/attendly-api /attendly-api
# nonroot uid:gid is 65532 — own /data so the app can write the SQLite db +
# assets. An empty named volume mounted here inherits this ownership.
COPY --from=build --chown=65532:65532 /data /data

ENV ADDR=:8787 \
    DB_PATH=/data/attendly.db \
    ASSETS_DIR=/data/assets

EXPOSE 8787
VOLUME ["/data"]
USER nonroot:nonroot
ENTRYPOINT ["/attendly-api"]
