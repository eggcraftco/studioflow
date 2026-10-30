# nivadesk.app off Hostinger (30 Oct 2026): the same Next.js app, as Next's self-contained server,
# for Cloud Run (europe-west2) behind Google's external Application Load Balancer.
#
# Why: Hostinger answers 429 to Amazon's, Meta's and Microsoft's networks at server level, and that
# cannot be switched off per site (infra/cloudrun/README.md). Hostinger's own build is untouched:
# only this image sets NIVADESK_STANDALONE=1 (next.config.ts).
#
# NEXT_PUBLIC_* values are compiled into the bundles, so they are build arguments, not runtime
# environment. They are public by design (Firebase web config). Server secrets are NOT here: the
# one server secret, NIVADESK_EBAY_CALLBACK_KEY, comes from Secret Manager at deploy time.

FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NIVADESK_STANDALONE=1
ARG NEXT_PUBLIC_FIREBASE_API_KEY NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID NEXT_PUBLIC_FIREBASE_VAPID_KEY NEXT_PUBLIC_STAGING_NO_INDEX NV_BUILD_ID
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=$NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID \
    NEXT_PUBLIC_FIREBASE_VAPID_KEY=$NEXT_PUBLIC_FIREBASE_VAPID_KEY \
    NEXT_PUBLIC_STAGING_NO_INDEX=$NEXT_PUBLIC_STAGING_NO_INDEX \
    NV_BUILD_ID=$NV_BUILD_ID
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx next build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 8080
CMD ["node", "server.js"]
