# One image, three Cloud Run services; ROLE selects the handlers at start.
# Built by Cloud Build inside the Amazon project (deploy.sh) — the image never
# leaves the perimeter's Artifact Registry.
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /srv
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
USER node
EXPOSE 8080
CMD ["node", "src/server.js"]
