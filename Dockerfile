# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source files
COPY . .

# Build with base path for subpath hosting
ARG BASE_PATH=/grocerygenius
ENV BASE_PATH=$BASE_PATH

# Build client (Vite) and server (esbuild)
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Only install production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built output
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=8080
ENV BASE_PATH=/grocerygenius

EXPOSE 8080

CMD ["node", "dist/index.js"]
