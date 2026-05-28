# ---- Build stage ----
FROM node:20-alpine AS build

WORKDIR /app

# Copy root workspace manifests
COPY package.json package-lock.json ./

# Copy the workspace packages we need
COPY db/wallet/package.json ./db/wallet/package.json
COPY services/mock-wallet/package.json ./services/mock-wallet/package.json

# Install all workspace deps
RUN npm install

# Copy the actual source for the packages we use
COPY db/wallet ./db/wallet
COPY services/mock-wallet ./services/mock-wallet

# Build the db/wallet package first (produces dist/schema.js + .d.ts)
WORKDIR /app/db/wallet
RUN npm run build

# Then build the mock-wallet service
WORKDIR /app/services/mock-wallet
RUN npm run build

# ---- Run stage ----
FROM node:20-alpine AS run

WORKDIR /app

COPY --from=build /app /app

WORKDIR /app/services/mock-wallet

USER node

EXPOSE 4001

CMD ["node", "dist/index.js"]