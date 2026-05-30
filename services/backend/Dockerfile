# ---- Build stage ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./

COPY db/cafeteria/package.json ./db/cafeteria/package.json
COPY services/backend/package.json ./services/backend/package.json

RUN npm install

COPY db/cafeteria ./db/cafeteria
COPY services/backend ./services/backend

WORKDIR /app/db/cafeteria
RUN npm run build

WORKDIR /app/services/backend
RUN npm run build

# ---- Run stage ----
FROM node:20-alpine AS run

WORKDIR /app

COPY --from=build /app /app

WORKDIR /app/services/backend

USER node

EXPOSE 4000

CMD ["node", "dist/index.js"]