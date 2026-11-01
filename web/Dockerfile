FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Local development: the source is mounted over /app
FROM deps AS dev
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM deps AS build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/next.config.mjs ./
USER node
EXPOSE 3000
CMD ["npm", "start"]
