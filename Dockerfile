FROM node:22-alpine AS assets

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY public ./public
RUN npm run build:css

FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY server.mjs ./server.mjs
COPY public/index.html public/app.js public/agent-renderer.mjs ./public/
COPY --from=assets /app/public/generated.css ./public/generated.css

USER node
EXPOSE 3000

CMD ["node", "server.mjs"]
