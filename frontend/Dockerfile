# ==========================================
# Stage 1: Build Angular Application
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code and build production bundle
COPY . .
RUN npm run build -- --configuration=production

# ==========================================
# Stage 2: Serve with Nginx
# ==========================================
FROM nginx:alpine AS runner

# Remove default nginx html
RUN rm -rf /usr/share/nginx/html/*

# Copy compiled Angular distribution files
COPY --from=builder /app/dist/frontend/browser /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
