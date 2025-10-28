# Stage 1: Build the Go application
FROM golang:1.24-alpine AS builder

# Install build dependencies including C++ compiler for goheif/libde265
RUN apk add --no-cache git gcc g++ musl-dev libheif-dev libde265-dev

# Set working directory
WORKDIR /build

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application
# CGO is required for SQLite
RUN CGO_ENABLED=1 GOOS=linux go build -o pocketbase .

# Stage 2: Runtime image
FROM alpine:latest

# Install runtime dependencies including libheif for HEIC image processing
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    su-exec \
    libheif \
    libde265

# Create directories
RUN mkdir -p /pb/pb_data /pb/pb_migrations /pb/pb_hooks /pb/pb_public

# Copy the binary from builder
COPY --from=builder /build/pocketbase /usr/local/bin/pocketbase

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set working directory
WORKDIR /pb

# Expose port
EXPOSE 8090

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --spider -q http://localhost:8090/api/health || exit 1

# Use entrypoint to fix permissions before starting
ENTRYPOINT ["/entrypoint.sh"]

# Default command (can be overridden by docker-compose)
CMD ["pocketbase", "serve", "--http=0.0.0.0:8090"]
