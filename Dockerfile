# Multi-stage Dockerfile for production

# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production stage
FROM node:20-alpine AS production

# Install nginx, supervisor and create necessary users
RUN apk add --no-cache nginx supervisor curl && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    mkdir -p /var/log/nginx /var/cache/nginx /etc/nginx/conf.d /run/nginx /var/log/supervisor /var/run/supervisor && \
    chown -R nginx:nginx /var/log/nginx /var/cache/nginx /etc/nginx /run/nginx

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy assets directory (create if it doesn't exist to avoid errors)
RUN mkdir -p ./assets && chown nodejs:nodejs ./assets
COPY --chown=nodejs:nodejs assets ./assets

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy supervisor configuration
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Copy .env file (contains database credentials and configuration)
# Make sure .env exists before building the image

# Create directory for nginx pid file and set permissions
RUN mkdir -p /var/run/nginx /var/log/supervisor /var/run/supervisor && \
    chown -R nodejs:nodejs /app && \
    chown -R nginx:nginx /var/run/nginx /var/log/nginx /var/cache/nginx && \
    chmod 755 /var/run/supervisor

# Expose port 81 (nginx) - DIFFERENT from wellnessme (80)
EXPOSE 81

# Health check - check nginx health endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:81/health || exit 1

# Create entrypoint script to ensure directories exist at runtime
# /var/run is a tmpfs in containers, so we need to create it on startup
# Also update nginx config with the correct PORT from environment
RUN echo '#!/bin/sh' > /entrypoint.sh && \
    echo 'set -e' >> /entrypoint.sh && \
    echo 'mkdir -p /var/run/supervisor /var/log/supervisor /var/run/nginx' >> /entrypoint.sh && \
    echo 'chmod 755 /var/run/supervisor /var/log/supervisor' >> /entrypoint.sh && \
    echo 'chown root:root /var/run/supervisor 2>/dev/null || true' >> /entrypoint.sh && \
    echo '# Update nginx upstream with PORT from environment (default to 4000 for this project)' >> /entrypoint.sh && \
    echo 'NODE_PORT=${PORT:-4000}' >> /entrypoint.sh && \
    echo 'sed -i "s/server 127.0.0.1:4000/server 127.0.0.1:$NODE_PORT/g" /etc/nginx/nginx.conf' >> /entrypoint.sh && \
    echo 'echo "Updated nginx to proxy to port $NODE_PORT"' >> /entrypoint.sh && \
    echo 'exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf' >> /entrypoint.sh && \
    chmod +x /entrypoint.sh

# Start supervisor which will manage both nginx and node
# Supervisor needs to run as root to manage both services
CMD ["/entrypoint.sh"]